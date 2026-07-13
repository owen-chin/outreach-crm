from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

from app.db.database import get_db
from app.config import settings
from app.models.models import User
from app.schemas.schemas import UserOut
from app.services.gmail import SCOPES, save_credentials, get_credentials
from app.services.auth_utils import create_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])

_pending_flow: Flow | None = None


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
    global _pending_flow
    _pending_flow = _build_flow()
    auth_url, _ = _pending_flow.authorization_url(access_type="offline", prompt="consent")
    return {"auth_url": auth_url}


@router.get("/google/callback")
def google_auth_callback(code: str, db: Session = Depends(get_db)):
    global _pending_flow
    if not _pending_flow:
        raise HTTPException(status_code=400, detail="No pending OAuth flow — visit /api/auth/google first")
    try:
        _pending_flow.fetch_token(code=code)
    except Exception as e:
        _pending_flow = None
        raise HTTPException(status_code=400, detail=f"OAuth token exchange failed: {e}")

    creds = _pending_flow.credentials
    _pending_flow = None

    # Get user info from Google
    service = build("oauth2", "v2", credentials=creds)
    info = service.userinfo().get().execute()

    # Create or update user
    user = db.query(User).filter(User.google_id == info["id"]).first()
    if user:
        user.email = info.get("email", user.email)
        user.name = info.get("name", user.name)
        user.picture = info.get("picture", user.picture)
    else:
        user = User(
            google_id=info["id"],
            email=info.get("email", ""),
            name=info.get("name"),
            picture=info.get("picture"),
        )
        db.add(user)

    db.flush()
    save_credentials(db, user.id, creds)
    db.commit()
    db.refresh(user)

    token = create_token(user.id)
    return RedirectResponse(url=f"{settings.frontend_url}?token={token}")


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/status")
def auth_status(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    creds = get_credentials(db, current_user.id)
    return {"connected": creds is not None and creds.valid}


@router.post("/logout", status_code=204)
def logout():
    pass
