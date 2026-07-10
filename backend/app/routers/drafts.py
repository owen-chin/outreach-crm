import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Form, UploadFile, File, Response
from sqlalchemy.orm import Session
from typing import List, Optional

from app.db.database import get_db
from app.models.models import Organization, Thread, EmailDraft, EmailDraftAttachment, DraftStatus
from app.schemas.schemas import DraftOut, DraftAttachmentOut

router = APIRouter(prefix="/api/organizations/{org_id}/drafts", tags=["drafts"])


def _get_org_or_404(org_id: int, db: Session) -> Organization:
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


def _find_draft(db: Session, org_id: int, thread_id: Optional[int]):
    q = db.query(EmailDraft).filter(EmailDraft.organization_id == org_id)
    q = q.filter(EmailDraft.thread_id == thread_id) if thread_id is not None else q.filter(EmailDraft.thread_id.is_(None))
    return q.first()


def _to_draft_out(draft: EmailDraft) -> DraftOut:
    status = draft.status.value if hasattr(draft.status, "value") else draft.status
    return DraftOut(
        id=draft.id,
        organization_id=draft.organization_id,
        thread_id=draft.thread_id,
        to_person_id=draft.to_person_id,
        cc_person_ids=json.loads(draft.cc_person_ids or "[]"),
        subject=draft.subject,
        body=draft.body,
        send_at=draft.send_at,
        status=status,
        failure_message=draft.failure_message,
        updated_at=draft.updated_at,
        attachments=[DraftAttachmentOut.model_validate(a) for a in draft.attachments],
    )


@router.get("", response_model=Optional[DraftOut])
def get_draft(org_id: int, thread_id: Optional[int] = None, db: Session = Depends(get_db)):
    _get_org_or_404(org_id, db)
    draft = _find_draft(db, org_id, thread_id)
    return _to_draft_out(draft) if draft else None


@router.put("", response_model=DraftOut)
async def upsert_draft(
    org_id: int,
    thread_id: Optional[int] = Form(None),
    to_person_id: Optional[int] = Form(None),
    cc_person_ids: str = Form("[]"),
    subject: Optional[str] = Form(None),
    body: str = Form(""),
    send_at: Optional[str] = Form(None),
    attachments: List[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
):
    _get_org_or_404(org_id, db)

    if thread_id is not None:
        thread = db.query(Thread).filter(Thread.id == thread_id, Thread.organization_id == org_id).first()
        if not thread:
            raise HTTPException(status_code=404, detail="Thread not found")

    try:
        json.loads(cc_person_ids)
    except (json.JSONDecodeError, TypeError):
        raise HTTPException(status_code=422, detail="cc_person_ids must be a JSON array")

    draft = _find_draft(db, org_id, thread_id)
    if draft and draft.status == DraftStatus.sending:
        raise HTTPException(status_code=409, detail="This email is currently being sent and can't be edited")

    parsed_send_at = None
    if send_at:
        try:
            parsed_send_at = datetime.fromisoformat(send_at)
        except ValueError:
            raise HTTPException(status_code=422, detail="send_at must be an ISO-8601 datetime")
        if parsed_send_at.tzinfo is None:
            parsed_send_at = parsed_send_at.replace(tzinfo=timezone.utc)
        if parsed_send_at <= datetime.now(timezone.utc):
            raise HTTPException(status_code=422, detail="send_at must be in the future")
        if thread_id is None and (not subject or not subject.strip() or not to_person_id):
            raise HTTPException(status_code=400, detail="Subject and recipient are required to schedule a send")

    if not draft:
        draft = EmailDraft(organization_id=org_id, thread_id=thread_id)
        db.add(draft)

    draft.to_person_id = to_person_id
    draft.cc_person_ids = cc_person_ids
    draft.subject = subject
    draft.body = body
    draft.send_at = parsed_send_at
    draft.status = DraftStatus.scheduled if parsed_send_at else DraftStatus.draft
    draft.failure_message = None
    db.flush()

    for existing in list(draft.attachments):
        db.delete(existing)
    db.flush()
    for f in attachments:
        data = await f.read()
        db.add(EmailDraftAttachment(
            draft_id=draft.id,
            filename=f.filename,
            mime_type=f.content_type or "application/octet-stream",
            size=len(data),
            data=data,
        ))

    db.commit()
    db.refresh(draft)
    return _to_draft_out(draft)


@router.delete("/{draft_id}", status_code=204)
def delete_draft(org_id: int, draft_id: int, db: Session = Depends(get_db)):
    draft = db.query(EmailDraft).filter(EmailDraft.id == draft_id, EmailDraft.organization_id == org_id).first()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    db.delete(draft)
    db.commit()


@router.get("/{draft_id}/attachments/{attachment_id}")
def get_draft_attachment(org_id: int, draft_id: int, attachment_id: int, db: Session = Depends(get_db)):
    att = db.query(EmailDraftAttachment).join(EmailDraft).filter(
        EmailDraftAttachment.id == attachment_id,
        EmailDraftAttachment.draft_id == draft_id,
        EmailDraft.organization_id == org_id,
    ).first()
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")
    headers = {"Content-Disposition": f'inline; filename="{att.filename}"'}
    return Response(content=att.data, media_type=att.mime_type, headers=headers)
