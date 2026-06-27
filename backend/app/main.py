from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routers import projects, categories, contacts, email_templates, auth, email

app = FastAPI(title="Sponsor CRM")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router)
app.include_router(categories.router)
app.include_router(contacts.router)
app.include_router(email_templates.router)
app.include_router(auth.router)
app.include_router(email.router)


@app.get("/health")
def health():
    return {"status": "ok"}
