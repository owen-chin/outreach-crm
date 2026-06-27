from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.db.database import get_db
from app.models.models import EmailTemplate
from app.schemas.schemas import EmailTemplateCreate, EmailTemplateUpdate, EmailTemplateOut

router = APIRouter(prefix="/api/email-templates", tags=["email-templates"])


@router.get("", response_model=List[EmailTemplateOut])
def list_templates(db: Session = Depends(get_db)):
    return db.query(EmailTemplate).order_by(EmailTemplate.created_at.desc()).all()


@router.post("", response_model=EmailTemplateOut, status_code=201)
def create_template(payload: EmailTemplateCreate, db: Session = Depends(get_db)):
    template = EmailTemplate(**payload.model_dump())
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.get("/{template_id}", response_model=EmailTemplateOut)
def get_template(template_id: int, db: Session = Depends(get_db)):
    template = db.get(EmailTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.patch("/{template_id}", response_model=EmailTemplateOut)
def update_template(template_id: int, payload: EmailTemplateUpdate, db: Session = Depends(get_db)):
    template = db.get(EmailTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(template, field, value)
    db.commit()
    db.refresh(template)
    return template


@router.delete("/{template_id}", status_code=204)
def delete_template(template_id: int, db: Session = Depends(get_db)):
    template = db.get(EmailTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(template)
    db.commit()
