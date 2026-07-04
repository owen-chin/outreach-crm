import enum
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Date, Enum, ForeignKey, JSON
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
    name = Column(String, nullable=False)  # e.g. "Sponsors", "Performers", "Venues"
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    project = relationship("Project", back_populates="categories")
    contacts = relationship("Contact", back_populates="category", cascade="all, delete-orphan")


class Contact(Base):
    __tablename__ = "contacts"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="CASCADE"), nullable=False)
    company_name = Column(String, nullable=False)
    contact_name = Column(String)
    email = Column(String)
    ask_type = Column(String)  # free text: "money", "product", "paid performance", etc.
    status = Column(Enum(ContactStatus), default=ContactStatus.not_contacted, nullable=False)
    last_contacted_date = Column(DateTime(timezone=True))
    notes = Column(Text)
    gmail_thread_id = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    category = relationship("Category", back_populates="contacts")
    email_logs = relationship("EmailLog", back_populates="contact", cascade="all, delete-orphan")


class EmailLog(Base):
    __tablename__ = "email_logs"

    id = Column(Integer, primary_key=True, index=True)
    contact_id = Column(Integer, ForeignKey("contacts.id", ondelete="CASCADE"), nullable=False)
    subject = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    sent_at = Column(DateTime(timezone=True), server_default=func.now())

    contact = relationship("Contact", back_populates="email_logs")


class EmailTemplate(Base):
    __tablename__ = "email_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    subject = Column(String, nullable=False)
    body = Column(Text, nullable=False)  # placeholders: {{contact_name}}, {{company_name}}, {{project_name}}, {{project_date}}
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class OAuthToken(Base):
    __tablename__ = "oauth_tokens"

    id = Column(Integer, primary_key=True, index=True)
    service = Column(String, nullable=False, unique=True)  # always "gmail"
    token_data = Column(JSON, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
