import base64
import email as email_lib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from sqlalchemy.orm import Session

from app.models.models import OAuthToken
from app.config import settings

SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify",
]


def get_credentials(db: Session, user_id: int) -> Credentials | None:
    row = db.query(OAuthToken).filter(
        OAuthToken.service == "gmail", OAuthToken.user_id == user_id
    ).first()
    if not row:
        return None

    creds = Credentials(
        token=row.token_data.get("token"),
        refresh_token=row.token_data.get("refresh_token"),
        token_uri=row.token_data.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        scopes=row.token_data.get("scopes", SCOPES),
    )

    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        row.token_data = {**row.token_data, "token": creds.token}
        db.commit()

    return creds


def save_credentials(db: Session, user_id: int, creds: Credentials) -> None:
    token_data = {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "scopes": list(creds.scopes) if creds.scopes else SCOPES,
    }
    row = db.query(OAuthToken).filter(
        OAuthToken.service == "gmail", OAuthToken.user_id == user_id
    ).first()
    if row:
        row.token_data = token_data
    else:
        db.add(OAuthToken(service="gmail", user_id=user_id, token_data=token_data))
    db.commit()


def _build_message(to: str, subject: str, html_body: str, cc: list[str] = [], attachments: list[tuple[str, bytes, str]] = []) -> MIMEText | MIMEMultipart:
    """Builds a MIME message supporting HTML body and optional file attachments."""
    if attachments:
        msg = MIMEMultipart("mixed")
        msg.attach(MIMEText(html_body, "html"))
        for filename, data, content_type in attachments:
            main_type, sub_type = (content_type.split("/", 1) if "/" in content_type else ("application", "octet-stream"))
            part = MIMEBase(main_type, sub_type)
            part.set_payload(data)
            encoders.encode_base64(part)
            part.add_header("Content-Disposition", "attachment", filename=filename)
            msg.attach(part)
    else:
        msg = MIMEText(html_body, "html")
    msg["to"] = to
    msg["subject"] = subject
    if cc:
        msg["cc"] = ", ".join(cc)
    return msg


def send_email(creds: Credentials, to: str, subject: str, body: str, cc: list[str] = [], attachments: list[tuple[str, bytes, str]] = []) -> tuple[str, str]:
    """Returns (message_id, thread_id). body is HTML."""
    service = build("gmail", "v1", credentials=creds)
    msg = _build_message(to, subject, body, cc, attachments)
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    sent = service.users().messages().send(userId="me", body={"raw": raw}).execute()
    return sent["id"], sent["threadId"]


def reply_email(creds: Credentials, thread_id: str, to: str, subject: str, body: str, cc: list[str] = [], attachments: list[tuple[str, bytes, str]] = []) -> tuple[str, str]:
    """Sends a reply into an existing thread. Returns (message_id, thread_id). body is HTML."""
    service = build("gmail", "v1", credentials=creds)
    reply_subject = subject if subject.lower().startswith("re:") else f"Re: {subject}"
    msg = _build_message(to, reply_subject, body, cc, attachments)
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    sent = service.users().messages().send(
        userId="me",
        body={"raw": raw, "threadId": thread_id},
    ).execute()
    return sent["id"], sent["threadId"]



def _decode_body_data(data: str) -> str:
    """Decodes Gmail API's urlsafe-base64, unpadded body data into text."""
    padded = data + "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(padded).decode("utf-8", errors="replace")


def _walk_message_parts(part: dict, html_parts: list, text_parts: list, inline_items: list, attachment_items: list) -> None:
    """Recursively walks a Gmail message payload's MIME parts, collecting the
    text/html and text/plain bodies plus inline images and real attachments."""
    sub_parts = part.get("parts")
    if sub_parts:
        for sp in sub_parts:
            _walk_message_parts(sp, html_parts, text_parts, inline_items, attachment_items)
        return

    mime_type = part.get("mimeType", "")
    filename = part.get("filename") or ""
    body = part.get("body") or {}
    data = body.get("data")
    attachment_id = body.get("attachmentId")
    headers = {h["name"].lower(): h["value"] for h in part.get("headers", [])}
    content_id = (headers.get("content-id") or "").strip("<>")
    disposition = (headers.get("content-disposition") or "").lower()

    if attachment_id:
        is_inline = bool(content_id) or "inline" in disposition
        item = {
            "attachment_id": attachment_id,
            "filename": filename or None,
            "content_id": content_id or None,
            "mime_type": mime_type or "application/octet-stream",
            "size": body.get("size", 0),
        }
        (inline_items if is_inline else attachment_items).append(item)
    elif mime_type == "text/html" and data:
        html_parts.append(_decode_body_data(data))
    elif mime_type == "text/plain" and data:
        text_parts.append(_decode_body_data(data))


def _best_body_html(html_parts: list[str], text_parts: list[str]) -> str | None:
    if html_parts:
        return "".join(html_parts)
    if text_parts:
        import html as html_mod
        escaped = html_mod.escape("\n\n".join(text_parts))
        return f'<pre style="white-space:pre-wrap;font-family:inherit;margin:0">{escaped}</pre>'
    return None


def get_thread(creds: Credentials, thread_id: str) -> dict:
    """Fetches a thread's messages, including rendered body HTML and any
    inline images / attachments found in the MIME structure."""
    service = build("gmail", "v1", credentials=creds)
    thread = service.users().threads().get(userId="me", id=thread_id, format="full").execute()
    messages = []
    for msg in thread.get("messages", []):
        headers = {h["name"]: h["value"] for h in msg["payload"].get("headers", [])}
        html_parts: list[str] = []
        text_parts: list[str] = []
        inline_items: list[dict] = []
        attachment_items: list[dict] = []
        _walk_message_parts(msg["payload"], html_parts, text_parts, inline_items, attachment_items)
        messages.append({
            "id": msg["id"],
            "sender": headers.get("From", ""),
            "subject": headers.get("Subject", ""),
            "date": headers.get("Date", ""),
            "snippet": msg.get("snippet", ""),
            "body_html": _best_body_html(html_parts, text_parts),
            "inline_images": inline_items,
            "attachments": attachment_items,
        })
    return {"thread_id": thread_id, "messages": messages}


def get_attachment_bytes(creds: Credentials, message_id: str, attachment_id: str) -> bytes:
    """Fetches and decodes a single attachment/inline-image's raw bytes."""
    service = build("gmail", "v1", credentials=creds)
    result = service.users().messages().attachments().get(
        userId="me", messageId=message_id, id=attachment_id
    ).execute()
    data = result.get("data", "")
    padded = data + "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(padded)


def get_or_create_label(creds: Credentials, name: str) -> str:
    """Returns the Gmail label ID for the given name, creating it if needed."""
    service = build("gmail", "v1", credentials=creds)
    labels = service.users().labels().list(userId="me").execute().get("labels", [])
    for label in labels:
        if label["name"] == name:
            return label["id"]
    result = service.users().labels().create(userId="me", body={"name": name}).execute()
    return result["id"]


def apply_label_to_thread(creds: Credentials, thread_id: str, label_id: str) -> None:
    service = build("gmail", "v1", credentials=creds)
    service.users().threads().modify(
        userId="me",
        id=thread_id,
        body={"addLabelIds": [label_id]},
    ).execute()


def list_threads_for_query(creds: Credentials, query: str) -> list[dict]:
    """Returns thread list for a Gmail search query (e.g. 'from:email@example.com')."""
    service = build("gmail", "v1", credentials=creds)
    result = service.users().threads().list(userId="me", q=query, maxResults=10).execute()
    threads = result.get("threads", [])
    detailed = []
    for t in threads:
        try:
            thread = service.users().threads().get(userId="me", id=t["id"], format="metadata").execute()
            msgs = thread.get("messages", [])
            if not msgs:
                continue
            first = msgs[0]
            headers = {h["name"]: h["value"] for h in first["payload"].get("headers", [])}
            from_raw = headers.get("From", "")
            from_name, from_email = _parse_from(from_raw)
            detailed.append({
                "thread_id": t["id"],
                "subject": headers.get("Subject", "(no subject)"),
                "from_email": from_email,
                "from_name": from_name,
                "date": headers.get("Date", ""),
                "snippet": first.get("snippet", ""),
            })
        except Exception:
            continue
    return detailed


def list_threads_for_label(creds: Credentials, label_id: str) -> list[dict]:
    """Returns thread list [{id, snippet}] for a given label."""
    service = build("gmail", "v1", credentials=creds)
    result = service.users().threads().list(userId="me", labelIds=[label_id]).execute()
    threads = result.get("threads", [])
    detailed = []
    for t in threads[:20]:  # cap at 20
        try:
            thread = service.users().threads().get(userId="me", id=t["id"], format="metadata").execute()
            msgs = thread.get("messages", [])
            if not msgs:
                continue
            first = msgs[0]
            headers = {h["name"]: h["value"] for h in first["payload"].get("headers", [])}
            from_raw = headers.get("From", "")
            from_name, from_email = _parse_from(from_raw)
            detailed.append({
                "thread_id": t["id"],
                "subject": headers.get("Subject", "(no subject)"),
                "from_email": from_email,
                "from_name": from_name,
                "date": headers.get("Date", ""),
                "snippet": first.get("snippet", ""),
            })
        except Exception:
            continue
    return detailed


def _parse_from(raw: str) -> tuple[str, str]:
    """Parses 'Name <email>' into (name, email)."""
    parsed = email_lib.utils.parseaddr(raw)
    return parsed[0] or parsed[1], parsed[1]


def render_template(subject: str, body: str, contact_name: str, company_name: str, project_name: str, project_date: str) -> tuple[str, str]:
    replacements = {
        "{{contact_name}}": contact_name or "",
        "{{company_name}}": company_name or "",
        "{{project_name}}": project_name or "",
        "{{project_date}}": project_date or "",
    }
    for placeholder, value in replacements.items():
        subject = subject.replace(placeholder, value)
        body = body.replace(placeholder, value)
    return subject, body
