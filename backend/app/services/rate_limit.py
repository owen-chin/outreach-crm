from fastapi import Request
from jose import JWTError, jwt
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings
from app.services.auth_utils import ALGORITHM


def rate_limit_key(request: Request) -> str:
    """Keys by the authenticated user when possible, falling back to IP only for
    unauthenticated routes (Google login start/callback). This matters because
    several people can share one public IP (office/campus wifi, NAT) — keying
    logged-in traffic by IP would let one busy user starve everyone else behind
    the same router, so authenticated endpoints get their own per-user bucket."""
    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        token = auth_header[7:]
        try:
            payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
            return f"user:{payload['sub']}"
        except (JWTError, KeyError):
            pass
    return f"ip:{get_remote_address(request)}"


limiter = Limiter(key_func=rate_limit_key)
