from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.db.database import get_db
from app.models.models import Contact, EmailTemplate, EmailLog, ContactStatus, Category, Project
from app.schemas.schemas import (
    SendEmailRequest, SendEmailResponse, EmailLogOut,
    ReplyEmailRequest, ThreadOut, ThreadMessage,
)
from app.services.gmail import (
    get_credentials, send_email, reply_email, get_thread,
    get_or_create_label, apply_label_to_thread, render_template,
)

router = APIRouter(prefix="/api/contacts/{contact_id}", tags=["email"])


def _get_contact_or_404(contact_id: int, db: Session) -> Contact:
    contact = db.get(Contact, contact_id)
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    return contact


def _get_creds_or_403(db: Session):
    creds = get_credentials(db)
    if not creds or not creds.valid:
        raise HTTPException(status_code=403, detail="Gmail not connected — log in with Google")
    return creds


def _build_label(project: Project, category: Category) -> str:
    return f"{project.name}/{category.name}"


@router.post("/send-email", response_model=SendEmailResponse)
def send_email_to_contact(contact_id: int, payload: SendEmailRequest, db: Session = Depends(get_db)):
    contact = _get_contact_or_404(contact_id, db)
    if not contact.email:
        raise HTTPException(status_code=422, detail="Contact has no email address")

    template = db.get(EmailTemplate, payload.template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    creds = _get_creds_or_403(db)
    category = db.get(Category, contact.category_id)
    project = db.get(Project, category.project_id) if category else None

    subject, body = render_template(
        subject=template.subject,
        body=template.body,
        contact_name=contact.contact_name or "",
        company_name=contact.company_name,
        project_name=project.name if project else "",
        project_date=str(project.date) if project and project.date else "",
    )

    msg_id, thread_id = send_email(creds, to=contact.email, subject=subject, body=body)

    if not contact.gmail_thread_id:
        contact.gmail_thread_id = thread_id

    db.add(EmailLog(contact_id=contact_id, subject=subject, body=body))
    contact.last_contacted_date = datetime.now(timezone.utc)
    if contact.status == ContactStatus.not_contacted:
        contact.status = ContactStatus.contacted
    db.commit()

    # Apply Gmail label (best-effort, don't fail the request)
    if project and category:
        try:
            label_id = get_or_create_label(creds, _build_label(project, category))
            apply_label_to_thread(creds, thread_id, label_id)
        except Exception:
            pass

    return SendEmailResponse(gmail_message_id=msg_id, gmail_thread_id=thread_id, subject=subject, body=body)


@router.post("/reply-email", response_model=SendEmailResponse)
def reply_email_to_contact(contact_id: int, payload: ReplyEmailRequest, db: Session = Depends(get_db)):
    contact = _get_contact_or_404(contact_id, db)
    if not contact.email:
        raise HTTPException(status_code=422, detail="Contact has no email address")
    if not contact.gmail_thread_id:
        raise HTTPException(status_code=422, detail="No Gmail thread linked to this contact")

    creds = _get_creds_or_403(db)
    category = db.get(Category, contact.category_id)
    project = db.get(Project, category.project_id) if category else None

    subject = payload.subject or contact.company_name
    msg_id, thread_id = reply_email(
        creds,
        thread_id=contact.gmail_thread_id,
        to=contact.email,
        subject=subject,
        body=payload.body,
    )

    db.add(EmailLog(contact_id=contact_id, subject=f"Re: {subject}", body=payload.body))
    contact.last_contacted_date = datetime.now(timezone.utc)
    if contact.status == ContactStatus.not_contacted:
        contact.status = ContactStatus.contacted
    db.commit()

    if project and category:
        try:
            label_id = get_or_create_label(creds, _build_label(project, category))
            apply_label_to_thread(creds, thread_id, label_id)
        except Exception:
            pass

    return SendEmailResponse(gmail_message_id=msg_id, gmail_thread_id=thread_id, subject=f"Re: {subject}", body=payload.body)


@router.get("/thread", response_model=ThreadOut)
def get_contact_thread(contact_id: int, db: Session = Depends(get_db)):
    contact = _get_contact_or_404(contact_id, db)
    if not contact.gmail_thread_id:
        raise HTTPException(status_code=404, detail="No Gmail thread linked to this contact")

    creds = _get_creds_or_403(db)
    data = get_thread(creds, contact.gmail_thread_id)
    return ThreadOut(
        thread_id=data["thread_id"],
        messages=[ThreadMessage(**m) for m in data["messages"]],
    )


@router.get("/email-logs", response_model=List[EmailLogOut])
def list_email_logs(contact_id: int, db: Session = Depends(get_db)):
    _get_contact_or_404(contact_id, db)
    return db.query(EmailLog).filter(EmailLog.contact_id == contact_id).order_by(EmailLog.sent_at.desc()).all()
