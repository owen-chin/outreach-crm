import enum
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Date, Enum, ForeignKey, JSON,
    Index, LargeBinary, text
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base


class ContactStatus(str, enum.Enum):
    not_contacted = "not_contacted"
    contacted = "contacted"
    responded = "responded"
    negotiating = "negotiating"
    confirmed = "confirmed"
    declined = "declined"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    google_id = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, nullable=False)
    name = Column(String)
    picture = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    projects = relationship("Project", back_populates="owner")


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    name = Column(String, nullable=False)
    date = Column(Date)
    description = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="projects")
    categories = relationship("Category", back_populates="project", cascade="all, delete-orphan")


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    project = relationship("Project", back_populates="categories")
    organizations = relationship("Organization", back_populates="category", cascade="all, delete-orphan")


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    website = Column(String)
    ask_type = Column(String)
    status = Column(Enum(ContactStatus), default=ContactStatus.not_contacted, nullable=False)
    last_contacted_date = Column(DateTime(timezone=True))
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    category = relationship("Category", back_populates="organizations")
    people = relationship("Person", back_populates="organization", cascade="all, delete-orphan")
    threads = relationship("Thread", back_populates="organization", cascade="all, delete-orphan")


class Person(Base):
    __tablename__ = "people"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    name = Column(String)
    email = Column(String)
    title = Column(String)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    organization = relationship("Organization", back_populates="people")


class Thread(Base):
    __tablename__ = "threads"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    gmail_thread_id = Column(String, nullable=False)
    subject = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    organization = relationship("Organization", back_populates="threads")
    email_logs = relationship("EmailLog", back_populates="thread", cascade="all, delete-orphan")


class EmailLog(Base):
    __tablename__ = "email_logs"

    id = Column(Integer, primary_key=True, index=True)
    thread_id = Column(Integer, ForeignKey("threads.id", ondelete="CASCADE"), nullable=False)
    subject = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    to_email = Column(String)
    cc_emails = Column(String)  # comma-separated
    sent_at = Column(DateTime(timezone=True), server_default=func.now())

    thread = relationship("Thread", back_populates="email_logs")


class EmailTemplate(Base):
    __tablename__ = "email_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    subject = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class OAuthToken(Base):
    __tablename__ = "oauth_tokens"

    id = Column(Integer, primary_key=True, index=True)
    service = Column(String, nullable=False, unique=True)
    token_data = Column(JSON, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class DraftStatus(str, enum.Enum):
    draft = "draft"
    scheduled = "scheduled"
    sending = "sending"
    failed = "failed"


class EmailDraft(Base):
    __tablename__ = "email_drafts"
    __table_args__ = (
        Index("ux_email_drafts_compose", "organization_id", unique=True,
              postgresql_where=text("thread_id IS NULL")),
        Index("ux_email_drafts_reply", "thread_id", unique=True,
              postgresql_where=text("thread_id IS NOT NULL")),
    )

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    thread_id = Column(Integer, ForeignKey("threads.id", ondelete="CASCADE"), nullable=True)
    to_person_id = Column(Integer, ForeignKey("people.id", ondelete="SET NULL"), nullable=True)
    cc_person_ids = Column(Text, default="[]")  # JSON-encoded list[int]
    subject = Column(String)
    body = Column(Text, nullable=False, default="")
    send_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(Enum(DraftStatus), default=DraftStatus.draft, nullable=False)
    failure_message = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    organization = relationship("Organization")
    thread = relationship("Thread")
    to_person = relationship("Person")
    attachments = relationship("EmailDraftAttachment", back_populates="draft", cascade="all, delete-orphan")


class EmailDraftAttachment(Base):
    __tablename__ = "email_draft_attachments"

    id = Column(Integer, primary_key=True, index=True)
    draft_id = Column(Integer, ForeignKey("email_drafts.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String, nullable=False)
    mime_type = Column(String, nullable=False)
    size = Column(Integer, nullable=False)
    data = Column(LargeBinary, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    draft = relationship("EmailDraft", back_populates="attachments")
