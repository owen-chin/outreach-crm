import html as html_mod
import json
import logging
import re

from google import genai
from google.genai import errors, types
from sqlalchemy.orm import Session

from app.config import settings
from app.models.models import Organization, Person, Thread
from app.services.gmail import get_credentials, get_thread

logger = logging.getLogger(__name__)


class AIDraftQuotaExceeded(RuntimeError):
    """Raised when Gemini's free-tier daily/per-minute request quota is exhausted."""

_SYSTEM_INSTRUCTION = (
    "You are an assistant helping someone from a student or nonprofit organization "
    "draft outreach and reply emails to potential sponsors and partners, inside a chat "
    "interface. Sound like a real person wrote the email, not a marketing template — "
    "no corporate filler, no excessive enthusiasm or exclamation points. Keep the email "
    "body under 200 words unless the context clearly calls for more.\n\n"
    "Every turn, respond with ONLY a JSON object of the form "
    '{"reply": string, "subject": string or null, "body": string or null}.\n'
    '- "reply" is a short (1-2 sentence) conversational message back to the user — what '
    "you did, or a clarifying question if you need more info before drafting.\n"
    '- Set "body" (and "subject", only when this is a new thread, not a reply) to the '
    "full current draft using \\n\\n for paragraph breaks — no HTML or markdown. Include "
    "them on every turn that produces or updates a draft, not just the first.\n"
    '- Leave "body" null only if you are asking a clarifying question and have nothing '
    "draftable yet."
)


def _client() -> genai.Client:
    if not settings.gemini_api_key:
        raise RuntimeError("AI drafting isn't configured — missing GEMINI_API_KEY")
    return genai.Client(api_key=settings.gemini_api_key)


def _html_to_text(html: str) -> str:
    text = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", html, flags=re.S | re.I)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    text = re.sub(r"</p>", "\n\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html_mod.unescape(text)
    text = re.sub(r"[ \t]+", " ", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _thread_transcript(db: Session, thread: Thread, user_id: int) -> str | None:
    """Fetches every message in the Gmail thread and renders a plain-text transcript,
    so the model can read the full back-and-forth rather than just the latest message."""
    creds = get_credentials(db, user_id)
    if not (creds and creds.valid):
        return None
    try:
        gmail_thread = get_thread(creds, thread.gmail_thread_id)
    except Exception:
        logger.warning("Could not fetch thread context for AI draft", exc_info=True)
        return None

    entries = []
    for msg in gmail_thread["messages"]:
        body = _html_to_text(msg.get("body_html") or "") or msg.get("snippet", "")
        entries.append(
            f"From: {msg['sender']}\nDate: {msg['date']}\n{body[:2000]}"
        )
    return "\n\n---\n\n".join(entries) if entries else None


def generate_chat_reply(
    db: Session, org: Organization, *,
    to_person: Person | None, thread: Thread | None, messages: list[dict], user_id: int,
) -> dict:
    context_lines = [
        f"Organization: {org.name}",
        f"Website: {org.website or 'unknown'}",
        f"Ask type: {org.ask_type or 'general partnership/sponsorship'}",
    ]
    if org.notes:
        context_lines.append(f"Notes on this org: {org.notes}")
    if to_person and (to_person.name or to_person.email):
        context_lines.append(
            f"Contact: {to_person.name or 'unknown name'} "
            f"<{to_person.email or 'no email'}> ({to_person.title or 'no title given'})"
        )

    if thread:
        context_lines.append(f"This is a REPLY inside an existing thread titled '{thread.subject}'.")
        transcript = _thread_transcript(db, thread, user_id)
        if transcript:
            context_lines.append(f"Full thread so far, oldest first:\n{transcript}")
        context_lines.append("Help the user draft a reply that responds appropriately to the whole thread.")
    else:
        context_lines.append("Help the user draft a first-contact outreach email introducing the organization and making the ask.")

    system_instruction = _SYSTEM_INSTRUCTION + "\n\nContext:\n" + "\n".join(context_lines)

    contents = [
        types.Content(role="user" if m["role"] == "user" else "model", parts=[types.Part(text=m["text"])])
        for m in messages
    ]

    client = _client()
    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.7,
                response_mime_type="application/json",
            ),
        )
    except errors.APIError as e:
        if e.code == 429:
            logger.info("Gemini quota exceeded: %s", e)
            raise AIDraftQuotaExceeded(
                "Daily AI draft limit reached — resets at midnight UTC. "
                "Add billing in Google AI Studio if you need more headroom."
            ) from e
        logger.warning("Gemini API call failed: %s", e)
        raise RuntimeError("AI draft failed — the model service is temporarily unavailable, try again") from e

    try:
        data = json.loads(response.text)
    except (json.JSONDecodeError, AttributeError, TypeError) as e:
        logger.error("Gemini returned unparseable output: %r", getattr(response, "text", None))
        raise RuntimeError("AI draft failed — the model returned an unexpected response") from e

    reply = (data.get("reply") or "").strip()
    if not reply:
        raise RuntimeError("AI draft failed — the model returned an empty response")

    return {"reply": reply, "subject": data.get("subject"), "body": data.get("body")}
