from datetime import date as Date, datetime
from typing import Optional, List
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


# ── Person ────────────────────────────────────────────────────────────────────

class PersonCreate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    title: Optional[str] = None
    notes: Optional[str] = None


class PersonUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    title: Optional[str] = None
    notes: Optional[str] = None


class PersonOut(BaseModel):
    id: int
    organization_id: int
    name: Optional[str] = None
    email: Optional[str] = None
    title: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Thread ────────────────────────────────────────────────────────────────────

class ThreadSummaryOut(BaseModel):
    id: int
    gmail_thread_id: str
    subject: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ThreadMessage(BaseModel):
    id: str
    sender: str
    subject: str
    date: str
    snippet: str


class ThreadMessagesOut(BaseModel):
    thread_id: str
    messages: List[ThreadMessage]


class LinkThreadRequest(BaseModel):
    gmail_thread_id: str
    subject: Optional[str] = None


# ── Organization ──────────────────────────────────────────────────────────────

class OrgCreate(BaseModel):
    name: str
    website: Optional[str] = None
    ask_type: Optional[str] = None
    notes: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None


class OrgUpdate(BaseModel):
    name: Optional[str] = None
    website: Optional[str] = None
    ask_type: Optional[str] = None
    status: Optional[ContactStatus] = None
    notes: Optional[str] = None


class OrgOut(BaseModel):
    id: int
    category_id: int
    name: str
    website: Optional[str] = None
    ask_type: Optional[str] = None
    status: ContactStatus
    last_contacted_date: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    people: List[PersonOut] = []
    threads: List[ThreadSummaryOut] = []

    model_config = {"from_attributes": True}


# ── Email send / reply ────────────────────────────────────────────────────────

class StartEmailRequest(BaseModel):
    to_person_id: int
    cc_person_ids: List[int] = []
    subject: str
    body: str


class ReplyRequest(BaseModel):
    body: str
    cc_person_ids: List[int] = []


class SendEmailResponse(BaseModel):
    thread_id: int
    gmail_thread_id: str
    subject: str


# ── EmailLog ──────────────────────────────────────────────────────────────────

class EmailLogOut(BaseModel):
    id: int
    thread_id: int
    subject: str
    body: str
    to_email: Optional[str] = None
    cc_emails: Optional[str] = None
    sent_at: datetime

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
    org_name: str
    contact_name: Optional[str] = None
    email: Optional[str] = None
