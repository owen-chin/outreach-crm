import base64
from email.mime.text import MIMEText

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from sqlalchemy.orm import Session

from app.models.models import OAuthToken
from app.config import settings

SCOPES = ["https://www.googleapis.com/auth/gmail.send"]


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


def send_email(creds: Credentials, to: str, subject: str, body: str) -> str:
    service = build("gmail", "v1", credentials=creds)
    message = MIMEText(body)
    message["to"] = to
    message["subject"] = subject
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    sent = service.users().messages().send(userId="me", body={"raw": raw}).execute()
    return sent["id"]


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
