from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.models import User
from app.schemas.schemas import GmailImportThread
from app.services.auth_utils import get_current_user
from app.services.gmail import get_credentials, list_threads_for_query

router = APIRouter(prefix="/api/gmail", tags=["gmail"])


def _get_creds_or_403(db: Session, user_id: int):
    creds = get_credentials(db, user_id)
    if not creds or not creds.valid:
        raise HTTPException(status_code=403, detail="Gmail not connected — log in with Google")
    return creds


@router.get("/search-threads", response_model=List[GmailImportThread])
def search_threads(email: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    creds = _get_creds_or_403(db, current_user.id)
    try:
        threads = list_threads_for_query(creds, f"from:{email}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gmail error: {e}")
    return [GmailImportThread(**t) for t in threads]
