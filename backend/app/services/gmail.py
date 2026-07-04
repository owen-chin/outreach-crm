import base64
import email as email_lib
from email.mime.text import MIMEText

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


def get_credentials(db: Session) -> Credentials | None:
    row = db.query(OAuthToken).filter(OAuthToken.service == "gmail").first()
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


def save_credentials(db: Session, creds: Credentials) -> None:
    token_data = {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "scopes": list(creds.scopes) if creds.scopes else SCOPES,
    }
    row = db.query(OAuthToken).filter(OAuthToken.service == "gmail").first()
    if row:
        row.token_data = token_data
    else:
        db.add(OAuthToken(service="gmail", token_data=token_data))
    db.commit()


def send_email(creds: Credentials, to: str, subject: str, body: str, cc: list[str] = []) -> tuple[str, str]:
    """Returns (message_id, thread_id)."""
    service = build("gmail", "v1", credentials=creds)
    message = MIMEText(body)
    message["to"] = to
    message["subject"] = subject
    if cc:
        message["cc"] = ", ".join(cc)
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    sent = service.users().messages().send(userId="me", body={"raw": raw}).execute()
    return sent["id"], sent["threadId"]


def reply_email(creds: Credentials, thread_id: str, to: str, subject: str, body: str, cc: list[str] = []) -> tuple[str, str]:
    """Sends a reply into an existing thread. Returns (message_id, thread_id)."""
    service = build("gmail", "v1", credentials=creds)
    reply_subject = subject if subject.lower().startswith("re:") else f"Re: {subject}"
    message = MIMEText(body)
    message["to"] = to
    message["subject"] = reply_subject
    if cc:
        message["cc"] = ", ".join(cc)
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    sent = service.users().messages().send(
        userId="me",
        body={"raw": raw, "threadId": thread_id},
    ).execute()
    return sent["id"], sent["threadId"]



def get_thread(creds: Credentials, thread_id: str) -> dict:
    """Fetches thread metadata and snippets for display."""
    service = build("gmail", "v1", credentials=creds)
    thread = service.users().threads().get(userId="me", id=thread_id, format="metadata").execute()
    messages = []
    for msg in thread.get("messages", []):
        headers = {h["name"]: h["value"] for h in msg["payload"].get("headers", [])}
        messages.append({
            "id": msg["id"],
            "sender": headers.get("From", ""),
            "subject": headers.get("Subject", ""),
            "date": headers.get("Date", ""),
            "snippet": msg.get("snippet", ""),
        })
    return {"thread_id": thread_id, "messages": messages}


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
