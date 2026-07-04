from datetime import date as Date, datetime
from typing import Optional
from pydantic import BaseModel
from app.models.models import ContactStatus


# ── User ──────────────────────────────────────────────────────────────────────

class UserOut(BaseModel):
    id: int
    email: str
    name: Optional[str] = None
    picture: Optional[str] = None

    model_config = {"from_attributes": True}


# ── Project ──────────────────────────────────────────────────────────────────

class ProjectBase(BaseModel):
    name: str
    date: Optional[Date] = None
    description: Optional[str] = None


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    date: Optional[Date] = None
    description: Optional[str] = None


class ProjectOut(ProjectBase):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Category ─────────────────────────────────────────────────────────────────

class CategoryBase(BaseModel):
    name: str


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: Optional[str] = None


class CategoryOut(CategoryBase):
    id: int
    project_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Contact ───────────────────────────────────────────────────────────────────

class ContactBase(BaseModel):
    company_name: str
    contact_name: Optional[str] = None
    email: Optional[str] = None
    ask_type: Optional[str] = None
    status: ContactStatus = ContactStatus.not_contacted
    notes: Optional[str] = None


class ContactCreate(ContactBase):
    pass


class ContactUpdate(BaseModel):
    company_name: Optional[str] = None
    contact_name: Optional[str] = None
    email: Optional[str] = None
    ask_type: Optional[str] = None
    status: Optional[ContactStatus] = None
    notes: Optional[str] = None
    gmail_thread_id: Optional[str] = None


class ContactOut(ContactBase):
    id: int
    category_id: int
    last_contacted_date: Optional[datetime] = None
    gmail_thread_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── EmailTemplate ─────────────────────────────────────────────────────────────

class EmailTemplateBase(BaseModel):
    name: str
    subject: str
    body: str


class EmailTemplateCreate(EmailTemplateBase):
    pass


class EmailTemplateUpdate(BaseModel):
    name: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None


class EmailTemplateOut(EmailTemplateBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── EmailLog ──────────────────────────────────────────────────────────────────

class EmailLogOut(BaseModel):
    id: int
    contact_id: int
    subject: str
    body: str
    sent_at: datetime

    model_config = {"from_attributes": True}


# ── Email send / reply ────────────────────────────────────────────────────────

class SendEmailRequest(BaseModel):
    template_id: int


class SendEmailResponse(BaseModel):
    gmail_message_id: str
    gmail_thread_id: str
    subject: str
    body: str


class ReplyEmailRequest(BaseModel):
    body: str
    subject: Optional[str] = None


# ── Thread ────────────────────────────────────────────────────────────────────

class ThreadMessage(BaseModel):
    id: str
    sender: str
    subject: str
    date: str
    snippet: str


class ThreadOut(BaseModel):
    thread_id: str
    messages: list[ThreadMessage]


# ── Gmail import ──────────────────────────────────────────────────────────────

class GmailImportThread(BaseModel):
    thread_id: str
    subject: str
    from_email: str
    from_name: str
    date: str
    snippet: str


class GmailImportCreate(BaseModel):
    thread_id: str
    company_name: str
    contact_name: Optional[str] = None
    email: Optional[str] = None
