import secrets

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.db.database import get_db
from app.services.scheduler import send_due_drafts

router = APIRouter(prefix="/internal", tags=["internal"])


@router.post("/send-due-drafts")
def trigger_send_due_drafts(
    x_internal_secret: str = Header(default=""),
    db: Session = Depends(get_db),
):
    """Called by an external scheduler (GitHub Actions cron) instead of an in-process
    poller, since free hosting tiers sleep on idle and can't keep a background job
    alive. Auth is a shared secret rather than a user session since there's no logged-in
    user driving this request."""
    if not settings.internal_api_secret or not secrets.compare_digest(
        x_internal_secret, settings.internal_api_secret
    ):
        raise HTTPException(status_code=403, detail="Forbidden")
    return {"results": send_due_drafts(db)}
