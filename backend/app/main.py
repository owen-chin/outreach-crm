from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler
from app.config import settings
from app.db.database import SessionLocal
from app.services.scheduler import send_due_drafts
from app.routers import (
    projects, categories, email_templates, auth, gmail, organizations,
    people, threads, drafts, dashboard,
)

scheduler = BackgroundScheduler()


def _poll_due_drafts():
    db = SessionLocal()
    try:
        send_due_drafts(db)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.add_job(
        _poll_due_drafts, "interval", seconds=60, id="send_due_drafts",
        max_instances=1, coalesce=True, misfire_grace_time=120,
    )
    scheduler.start()
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(title="Sponsor CRM", lifespan=lifespan)

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


@app.get("/health")
def health():
    return {"status": "ok"}
