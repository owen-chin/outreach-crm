import logging

import httpx

from app.config import settings
from app.db.database import SessionLocal
from app.models.models import EmailDraft, DraftStatus

logger = logging.getLogger(__name__)

_WORKFLOW_FILE = "send-due-drafts.yml"


def _set_workflow_enabled(enabled: bool) -> None:
    """Best-effort toggle of the GitHub Actions cron via the GitHub API. Keeping the
    workflow disabled while nothing is scheduled means it doesn't wake the free-tier
    backend (or run at all) until someone actually schedules a send."""
    if not settings.github_token or not settings.github_repo:
        return
    action = "enable" if enabled else "disable"
    url = f"https://api.github.com/repos/{settings.github_repo}/actions/workflows/{_WORKFLOW_FILE}/{action}"
    try:
        resp = httpx.put(
            url,
            headers={
                "Authorization": f"Bearer {settings.github_token}",
                "Accept": "application/vnd.github+json",
            },
            timeout=5,
        )
        resp.raise_for_status()
    except httpx.HTTPError:
        logger.exception("Failed to %s send-due-drafts workflow", action)


def sync_workflow_schedule() -> None:
    """Enables the cron workflow if any draft is scheduled, disables it otherwise.
    Call after any change that could add, remove, or drain the scheduled-draft queue.
    Opens its own DB session so it's safe to run as a FastAPI background task, which
    executes after the request's own session has already been closed."""
    db = SessionLocal()
    try:
        has_scheduled = db.query(EmailDraft.id).filter(EmailDraft.status == DraftStatus.scheduled).first() is not None
    finally:
        db.close()
    _set_workflow_enabled(has_scheduled)
