from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import settings
from app.services.rate_limit import limiter
from app.routers import (
    projects, categories, email_templates, auth, gmail, organizations,
    people, threads, drafts, dashboard, internal,
)

app = FastAPI(title="Sponsor CRM")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dashboard.router)
app.include_router(projects.router)
app.include_router(categories.router)
app.include_router(organizations.router)
app.include_router(people.router)
app.include_router(threads.router)
app.include_router(drafts.router)
app.include_router(email_templates.router)
app.include_router(auth.router)
app.include_router(gmail.router)
app.include_router(internal.router)


@app.get("/health")
def health():
    return {"status": "ok"}
