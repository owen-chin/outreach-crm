from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.db.database import get_db
from app.models.models import Contact, EmailTemplate, EmailLog, ContactStatus, Category, Project
from app.schemas.schemas import SendEmailRequest, SendEmailResponse, EmailLogOut
from app.services.gmail import get_credentials, send_email, render_template

router = APIRouter(prefix="/api/contacts/{contact_id}", tags=["email"])


def _get_contact_or_404(contact_id: int, db: Session) -> Contact:
    contact = db.get(Contact, contact_id)
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    return contact


@router.post("/send-email", response_model=SendEmailResponse)
def send_email_to_contact(contact_id: int, payload: SendEmailRequest, db: Session = Depends(get_db)):
    contact = _get_contact_or_404(contact_id, db)

    if not contact.email:
        raise HTTPException(status_code=422, detail="Contact has no email address")

    template = db.get(EmailTemplate, payload.template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    creds = get_credentials(db)
    if not creds or not creds.valid:
        raise HTTPException(status_code=403, detail="Gmail not connected — visit /api/auth/google to connect")

    category = db.get(Category, contact.category_id)
    project = db.get(Project, category.project_id) if category else None
    project_date = str(project.date) if project and project.date else ""

    subject, body = render_template(
        subject=template.subject,
        body=template.body,
        contact_name=contact.contact_name or "",
        company_name=contact.company_name,
        project_name=project.name if project else "",
        project_date=project_date,
    )

    gmail_id = send_email(creds, to=contact.email, subject=subject, body=body)

    db.add(EmailLog(contact_id=contact_id, subject=subject, body=body))

    contact.last_contacted_date = datetime.now(timezone.utc)
    if contact.status == ContactStatus.not_contacted:
        contact.status = ContactStatus.contacted

    db.commit()

    return SendEmailResponse(gmail_message_id=gmail_id, subject=subject, body=body)


@router.get("/email-logs", response_model=List[EmailLogOut])
def list_email_logs(contact_id: int, db: Session = Depends(get_db)):
    _get_contact_or_404(contact_id, db)
    return db.query(EmailLog).filter(EmailLog.contact_id == contact_id).order_by(EmailLog.sent_at.desc()).all()
