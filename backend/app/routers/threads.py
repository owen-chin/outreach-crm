import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Form, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional

from app.db.database import get_db
from app.models.models import Organization, Person, Thread, EmailLog, ContactStatus
from app.schemas.schemas import (
    ThreadSummaryOut, ThreadMessagesOut, LinkThreadRequest,
    StartEmailRequest, ReplyRequest, SendEmailResponse, EmailLogOut,
)
from app.services.gmail import get_credentials, send_email, reply_email, get_thread, get_or_create_label, apply_label_to_thread

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


def _apply_label(creds, org: Organization, gmail_thread_id: str) -> None:
    """Applies {project}/{category} label to a Gmail thread. Silently ignores failures."""
    try:
        category = org.category
        project = category.project
        label_name = f"{project.name}/{category.name}"
        label_id = get_or_create_label(creds, label_name)
        apply_label_to_thread(creds, gmail_thread_id, label_id)
    except Exception:
        pass


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
        _msg_id, gmail_thread_id = send_email(
            creds, to_person.email, subject, body, cc=cc_emails, attachments=attachment_data
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gmail error: {e}")

    _apply_label(creds, org, gmail_thread_id)

    thread = Thread(organization_id=org_id, gmail_thread_id=gmail_thread_id, subject=subject)
    db.add(thread)
    db.flush()

    db.add(EmailLog(
        thread_id=thread.id,
        subject=subject,
        body=body,
        to_email=to_person.email,
        cc_emails=",".join(cc_emails) if cc_emails else None,
    ))

    org.last_contacted_date = datetime.now(timezone.utc)
    if org.status == ContactStatus.not_contacted:
        org.status = ContactStatus.contacted

    db.commit()
    db.refresh(thread)
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
        _apply_label(creds, org, payload.gmail_thread_id)
    return thread


@router.get("/{thread_id}/messages", response_model=ThreadMessagesOut)
def get_thread_messages(org_id: int, thread_id: int, db: Session = Depends(get_db)):
    thread = _get_thread_or_404(org_id, thread_id, db)
    creds = _get_creds_or_403(db)
    try:
        data = get_thread(creds, thread.gmail_thread_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gmail error: {e}")
    return data


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
    db: Session = Depends(get_db),
):
    org = _get_org_or_404(org_id, db)
    thread = _get_thread_or_404(org_id, thread_id, db)
    creds = _get_creds_or_403(db)

    cc_ids = json.loads(cc_person_ids)
    cc_people = _resolve_people(cc_ids, org_id, db)
    cc_emails = [p.email for p in cc_people if p.email]

    first_log = db.query(EmailLog).filter(EmailLog.thread_id == thread.id).order_by(EmailLog.sent_at).first()
    to_email = first_log.to_email if first_log else None
    if not to_email:
        first_person = db.query(Person).filter(
            Person.organization_id == org_id, Person.email.isnot(None)
        ).first()
        if not first_person:
            raise HTTPException(status_code=400, detail="No email address found for this organization")
        to_email = first_person.email

    subject = thread.subject or "Re: (no subject)"
    reply_subject = subject if subject.lower().startswith("re:") else f"Re: {subject}"

    attachment_data = [(f.filename, await f.read(), f.content_type or "application/octet-stream") for f in attachments]

    try:
        _msg_id, _thread_id = reply_email(
            creds, thread.gmail_thread_id, to_email, reply_subject, body, cc=cc_emails, attachments=attachment_data
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gmail error: {e}")

    _apply_label(creds, org, thread.gmail_thread_id)

    db.add(EmailLog(
        thread_id=thread.id,
        subject=reply_subject,
        body=body,
        to_email=to_email,
        cc_emails=",".join(cc_emails) if cc_emails else None,
    ))

    org.last_contacted_date = datetime.now(timezone.utc)
    db.commit()

    return SendEmailResponse(
        thread_id=thread.id,
        gmail_thread_id=thread.gmail_thread_id,
        subject=reply_subject,
    )
