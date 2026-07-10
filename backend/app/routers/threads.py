import json
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException, Form, UploadFile, File, Response
from sqlalchemy.orm import Session
from typing import List, Optional

from app.db.database import get_db
from app.models.models import Organization, Person, Thread, EmailLog, EmailDraft
from app.schemas.schemas import (
    ThreadSummaryOut, ThreadMessagesOut, LinkThreadRequest,
    StartEmailRequest, ReplyRequest, SendEmailResponse, EmailLogOut,
)
from app.services.gmail import get_credentials, get_thread, get_attachment_bytes
from app.services.email_sender import apply_org_label, resolve_reply_recipient, send_and_log_email

router = APIRouter(prefix="/api/organizations/{org_id}/threads", tags=["threads"])


def _get_creds_or_403(db: Session):
    creds = get_credentials(db)
    if not creds or not creds.valid:
        raise HTTPException(status_code=403, detail="Gmail not connected — log in with Google")
    return creds


def _get_org_or_404(org_id: int, db: Session) -> Organization:
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


def _get_thread_or_404(org_id: int, thread_id: int, db: Session) -> Thread:
    thread = db.query(Thread).filter(
        Thread.id == thread_id, Thread.organization_id == org_id
    ).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    return thread


def _resolve_people(person_ids: List[int], org_id: int, db: Session) -> List[Person]:
    people = []
    for pid in person_ids:
        p = db.query(Person).filter(Person.id == pid, Person.organization_id == org_id).first()
        if not p:
            raise HTTPException(status_code=404, detail=f"Person {pid} not found in this organization")
        people.append(p)
    return people


@router.get("", response_model=List[ThreadSummaryOut])
def list_threads(org_id: int, db: Session = Depends(get_db)):
    _get_org_or_404(org_id, db)
    return db.query(Thread).filter(Thread.organization_id == org_id).all()


@router.post("/start-email", response_model=SendEmailResponse, status_code=201)
async def start_email(
    org_id: int,
    to_person_id: int = Form(...),
    cc_person_ids: str = Form("[]"),
    subject: str = Form(...),
    body: str = Form(...),
    attachments: List[UploadFile] = File(default=[]),
    draft_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
):
    org = _get_org_or_404(org_id, db)
    creds = _get_creds_or_403(db)

    to_person = db.query(Person).filter(
        Person.id == to_person_id, Person.organization_id == org_id
    ).first()
    if not to_person:
        raise HTTPException(status_code=404, detail="To-person not found in this organization")
    if not to_person.email:
        raise HTTPException(status_code=400, detail="To-person has no email address")

    cc_ids = json.loads(cc_person_ids)
    cc_people = _resolve_people(cc_ids, org_id, db)
    cc_emails = [p.email for p in cc_people if p.email]

    attachment_data = [(f.filename, await f.read(), f.content_type or "application/octet-stream") for f in attachments]

    try:
        thread = send_and_log_email(
            db, creds, org, subject=subject, body=body, to_email=to_person.email,
            cc_emails=cc_emails, attachments=attachment_data, thread=None,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gmail error: {e}")

    if draft_id is not None:
        db.query(EmailDraft).filter(EmailDraft.id == draft_id, EmailDraft.organization_id == org_id).delete()
        db.commit()

    return SendEmailResponse(
        thread_id=thread.id,
        gmail_thread_id=thread.gmail_thread_id,
        subject=thread.subject or subject,
    )


@router.post("/link", response_model=ThreadSummaryOut, status_code=201)
def link_thread(org_id: int, payload: LinkThreadRequest, db: Session = Depends(get_db)):
    org = _get_org_or_404(org_id, db)
    thread = Thread(
        organization_id=org_id,
        gmail_thread_id=payload.gmail_thread_id,
        subject=payload.subject,
    )
    db.add(thread)
    db.commit()
    db.refresh(thread)
    creds = get_credentials(db)
    if creds and creds.valid:
        apply_org_label(creds, org, payload.gmail_thread_id)
    return thread


def _attachment_url(org_id: int, thread_id: int, message_id: str, item: dict) -> str:
    filename = item.get("filename") or ""
    mime_type = item.get("mime_type") or "application/octet-stream"
    return (
        f"/api/organizations/{org_id}/threads/{thread_id}/messages/{message_id}"
        f"/attachments/{item['attachment_id']}?filename={quote(filename)}&mime_type={quote(mime_type)}"
    )


def _finalize_thread_messages(org_id: int, thread_id: int, data: dict) -> dict:
    """Rewrites cid: image references to fetchable URLs and merges inline
    images + real attachments into the single `attachments` list the schema expects."""
    for msg in data["messages"]:
        body_html = msg.get("body_html")
        combined = []
        for item in msg.pop("inline_images", []):
            url = _attachment_url(org_id, thread_id, msg["id"], item)
            if body_html and item.get("content_id"):
                body_html = body_html.replace(f"cid:{item['content_id']}", url)
            combined.append({
                "attachment_id": item["attachment_id"],
                "filename": item.get("filename"),
                "mime_type": item["mime_type"],
                "size": item.get("size", 0),
                "inline": True,
            })
        for item in msg.get("attachments", []):
            combined.append({
                "attachment_id": item["attachment_id"],
                "filename": item.get("filename"),
                "mime_type": item["mime_type"],
                "size": item.get("size", 0),
                "inline": False,
            })
        msg["body_html"] = body_html
        msg["attachments"] = combined
    return data


@router.get("/{thread_id}/messages", response_model=ThreadMessagesOut)
def get_thread_messages(org_id: int, thread_id: int, db: Session = Depends(get_db)):
    thread = _get_thread_or_404(org_id, thread_id, db)
    creds = _get_creds_or_403(db)
    try:
        data = get_thread(creds, thread.gmail_thread_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gmail error: {e}")
    return _finalize_thread_messages(org_id, thread_id, data)


@router.get("/{thread_id}/messages/{message_id}/attachments/{attachment_id}")
def get_message_attachment(
    org_id: int,
    thread_id: int,
    message_id: str,
    attachment_id: str,
    filename: Optional[str] = None,
    mime_type: Optional[str] = None,
    db: Session = Depends(get_db),
):
    _get_thread_or_404(org_id, thread_id, db)
    creds = _get_creds_or_403(db)
    try:
        data = get_attachment_bytes(creds, message_id, attachment_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gmail error: {e}")
    headers = {}
    if filename:
        headers["Content-Disposition"] = f'inline; filename="{filename}"'
    return Response(content=data, media_type=mime_type or "application/octet-stream", headers=headers)


@router.get("/{thread_id}/logs", response_model=List[EmailLogOut])
def get_thread_logs(org_id: int, thread_id: int, db: Session = Depends(get_db)):
    thread = _get_thread_or_404(org_id, thread_id, db)
    return db.query(EmailLog).filter(EmailLog.thread_id == thread.id).all()


@router.post("/{thread_id}/reply", response_model=SendEmailResponse, status_code=201)
async def reply_to_thread(
    org_id: int,
    thread_id: int,
    cc_person_ids: str = Form("[]"),
    body: str = Form(...),
    attachments: List[UploadFile] = File(default=[]),
    draft_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
):
    org = _get_org_or_404(org_id, db)
    thread = _get_thread_or_404(org_id, thread_id, db)
    creds = _get_creds_or_403(db)

    cc_ids = json.loads(cc_person_ids)
    cc_people = _resolve_people(cc_ids, org_id, db)
    cc_emails = [p.email for p in cc_people if p.email]

    to_email = resolve_reply_recipient(db, thread, org_id)
    if not to_email:
        raise HTTPException(status_code=400, detail="No email address found for this organization")

    subject = thread.subject or "Re: (no subject)"
    reply_subject = subject if subject.lower().startswith("re:") else f"Re: {subject}"

    attachment_data = [(f.filename, await f.read(), f.content_type or "application/octet-stream") for f in attachments]

    try:
        thread = send_and_log_email(
            db, creds, org, subject=reply_subject, body=body, to_email=to_email,
            cc_emails=cc_emails, attachments=attachment_data, thread=thread,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gmail error: {e}")

    if draft_id is not None:
        db.query(EmailDraft).filter(EmailDraft.id == draft_id, EmailDraft.thread_id == thread_id).delete()
        db.commit()

    return SendEmailResponse(
        thread_id=thread.id,
        gmail_thread_id=thread.gmail_thread_id,
        subject=reply_subject,
    )
