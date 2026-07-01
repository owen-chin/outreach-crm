from datetime import date as Date, datetime
from typing import Optional
from pydantic import BaseModel
from app.models.models import ContactStatus


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


class ContactOut(ContactBase):
    id: int
    category_id: int
    last_contacted_date: Optional[datetime] = None
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


# ── Email send ────────────────────────────────────────────────────────────────

class SendEmailRequest(BaseModel):
    template_id: int


class SendEmailResponse(BaseModel):
    gmail_message_id: str
    subject: str
    body: str
