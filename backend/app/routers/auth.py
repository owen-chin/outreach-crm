from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
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
from app.services.rate_limit import limiter

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Keyed by the OAuth `state` param so concurrent logins (e.g. several people on the
# same office wifi/NAT starting the flow around the same time) each get their own Flow
# instead of clobbering a single shared one, and so a callback can be tied back to the
# login that actually started it (CSRF protection). Entries expire after FLOW_TTL.
_pending_flows: dict[str, tuple[Flow, datetime]] = {}
FLOW_TTL = timedelta(minutes=10)


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


def _prune_expired_flows() -> None:
    now = datetime.now(timezone.utc)
    expired = [state for state, (_, expires_at) in _pending_flows.items() if expires_at < now]
    for state in expired:
        _pending_flows.pop(state, None)


@router.get("/google")
@limiter.limit("30/minute")
def google_auth_start(request: Request):
    _prune_expired_flows()
    flow = _build_flow()
    auth_url, state = flow.authorization_url(access_type="offline", prompt="consent")
    _pending_flows[state] = (flow, datetime.now(timezone.utc) + FLOW_TTL)
    return {"auth_url": auth_url}


@router.get("/google/callback")
@limiter.limit("30/minute")
def google_auth_callback(request: Request, code: str, state: str, db: Session = Depends(get_db)):
    _prune_expired_flows()
    pending = _pending_flows.pop(state, None)
    if not pending:
        raise HTTPException(status_code=400, detail="No pending OAuth flow for this login — visit /api/auth/google first")
    flow, _expires_at = pending
    try:
        flow.fetch_token(code=code)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"OAuth token exchange failed: {e}")

    creds = flow.credentials

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
