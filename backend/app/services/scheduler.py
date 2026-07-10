import json
import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.models import EmailDraft, DraftStatus, Organization, Thread, Person
from app.services.gmail import get_credentials
from app.services.email_sender import send_and_log_email, resolve_reply_recipient

logger = logging.getLogger(__name__)


def send_due_drafts(db: Session) -> list[dict]:
    """Finds every EmailDraft with status='scheduled' and send_at in the past, and
    sends it. Plain function with no FastAPI dependency — callable from the in-process
    APScheduler job today, or later from an external cron/HTTP endpoint without
    touching the send logic itself if hosting ever moves somewhere that can't keep an
    in-process poller alive."""
    now = datetime.now(timezone.utc)
    due_ids = [
        d.id for d in db.query(EmailDraft.id)
        .filter(EmailDraft.status == DraftStatus.scheduled, EmailDraft.send_at <= now)
        .all()
    ]
    return [_send_one_draft(db, draft_id) for draft_id in due_ids]


def _send_one_draft(db: Session, draft_id: int) -> dict:
    draft = db.get(EmailDraft, draft_id)
    if not draft or draft.status != DraftStatus.scheduled:
        return {"draft_id": draft_id, "status": "skipped"}

    try:
        org = db.get(Organization, draft.organization_id)
        if not org:
            raise RuntimeError("Organization was deleted")

        creds = get_credentials(db)
        if not creds or not creds.valid:
            raise RuntimeError("Gmail not connected — reconnect Google to send this email")

        thread = db.get(Thread, draft.thread_id) if draft.thread_id else None
        if draft.thread_id and not thread:
            raise RuntimeError("Thread was deleted")

        cc_ids = json.loads(draft.cc_person_ids or "[]")
        cc_emails = [
            p.email for p in db.query(Person)
            .filter(Person.id.in_(cc_ids), Person.organization_id == draft.organization_id).all()
            if p.email
        ]
        attachments = [(a.filename, a.data, a.mime_type) for a in draft.attachments]

        if thread:
            to_email = resolve_reply_recipient(db, thread, draft.organization_id)
            subject = thread.subject or "Re: (no subject)"
            subject = subject if subject.lower().startswith("re:") else f"Re: {subject}"
        else:
            to_person = db.get(Person, draft.to_person_id) if draft.to_person_id else None
            to_email = to_person.email if to_person else None
            subject = draft.subject or "(no subject)"

        if not to_email:
            raise RuntimeError("No recipient email address found (contact may have been deleted)")

        # All validation passed — claim the row right before the side-effecting Gmail call.
        draft.status = DraftStatus.sending
        db.commit()

        send_and_log_email(
            db, creds, org, subject=subject, body=draft.body, to_email=to_email,
            cc_emails=cc_emails, attachments=attachments, thread=thread,
        )
        db.delete(draft)
        db.commit()
        return {"draft_id": draft_id, "status": "sent"}
    except Exception as e:
        db.rollback()
        failed = db.get(EmailDraft, draft_id)
        if failed:
            failed.status = DraftStatus.failed
            failed.failure_message = str(e)[:500]
            db.commit()
        logger.exception("Scheduled send failed for draft %s", draft_id)
        return {"draft_id": draft_id, "status": "failed", "error": str(e)}
