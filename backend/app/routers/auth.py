from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from google_auth_oauthlib.flow import Flow

from app.db.database import get_db
from app.config import settings
from app.services.gmail import SCOPES, get_credentials, save_credentials

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _build_flow() -> Flow:
    return Flow.from_client_config(
        {
            "web": {
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [settings.google_redirect_uri],
            }
        },
        scopes=SCOPES,
        redirect_uri=settings.google_redirect_uri,
    )


@router.get("/google")
def google_auth_start():
    flow = _build_flow()
    auth_url, _ = flow.authorization_url(access_type="offline", prompt="consent")
    return {"auth_url": auth_url}


@router.get("/google/callback")
def google_auth_callback(code: str, db: Session = Depends(get_db)):
    flow = _build_flow()
    try:
        flow.fetch_token(code=code)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"OAuth token exchange failed: {e}")
    save_credentials(db, flow.credentials)
    return RedirectResponse(url=f"{settings.frontend_url}?gmail=connected")


@router.get("/status")
def auth_status(db: Session = Depends(get_db)):
    creds = get_credentials(db)
    return {"connected": creds is not None and creds.valid}


@router.delete("/google", status_code=204)
def disconnect_google(db: Session = Depends(get_db)):
    from app.models.models import OAuthToken
    row = db.query(OAuthToken).filter(OAuthToken.service == "gmail").first()
    if row:
        db.delete(row)
        db.commit()
