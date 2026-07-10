from datetime import datetime, timezone

from google.oauth2.credentials import Credentials
from sqlalchemy.orm import Session

from app.models.models import Organization, Thread, EmailLog, Person, ContactStatus
from app.services.gmail import send_email, reply_email, get_or_create_label, apply_label_to_thread


def apply_org_label(creds: Credentials, org: Organization, gmail_thread_id: str) -> None:
    """Applies {project}/{category} label to a Gmail thread. Silently ignores failures."""
    try:
        category = org.category
        project = category.project
        label_name = f"{project.name}/{category.name}"
        label_id = get_or_create_label(creds, label_name)
        apply_label_to_thread(creds, gmail_thread_id, label_id)
    except Exception:
        pass


def resolve_reply_recipient(db: Session, thread: Thread, org_id: int) -> str | None:
    """Returns the address to reply to: the original recipient of the thread's first
    logged email, falling back to the first person in the org with an email address."""
    first_log = db.query(EmailLog).filter(EmailLog.thread_id == thread.id).order_by(EmailLog.sent_at).first()
    if first_log and first_log.to_email:
        return first_log.to_email
    first_person = db.query(Person).filter(
        Person.organization_id == org_id, Person.email.isnot(None)
    ).first()
    return first_person.email if first_person else None


def send_and_log_email(
    db: Session, creds: Credentials, org: Organization, *,
    subject: str, body: str, to_email: str, cc_emails: list[str],
    attachments: list[tuple[str, bytes, str]], thread: Thread | None,
) -> Thread:
    """Sends via Gmail (starts a new thread if `thread` is None, else replies into it),
    applies the project/category label, writes an EmailLog row, and updates
    org.last_contacted_date/status. Commits and returns the Thread.

    `subject` should already include any "Re:" prefix the caller wants — reply_email
    is idempotent on this (only prefixes if not already present), so it's safe for a
    caller to pass a subject that's already prefixed.

    Shared by the HTTP send/reply routers and the scheduled-send poller so both paths
    do the exact same send+log+label work.
    """
    is_new_thread = thread is None
    if is_new_thread:
        _msg_id, gmail_thread_id = send_email(creds, to_email, subject, body, cc=cc_emails, attachments=attachments)
        thread = Thread(organization_id=org.id, gmail_thread_id=gmail_thread_id, subject=subject)
        db.add(thread)
        db.flush()
    else:
        _msg_id, _tid = reply_email(creds, thread.gmail_thread_id, to_email, subject, body, cc=cc_emails, attachments=attachments)

    apply_org_label(creds, org, thread.gmail_thread_id)

    db.add(EmailLog(
        thread_id=thread.id,
        subject=subject,
        body=body,
        to_email=to_email,
        cc_emails=",".join(cc_emails) if cc_emails else None,
    ))

    org.last_contacted_date = datetime.now(timezone.utc)
    if is_new_thread and org.status == ContactStatus.not_contacted:
        org.status = ContactStatus.contacted

    db.commit()
    db.refresh(thread)
    return thread
