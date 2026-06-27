from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.db.database import get_db
from app.models.models import Contact, Category
from app.schemas.schemas import ContactCreate, ContactUpdate, ContactOut

router = APIRouter(prefix="/api/categories/{category_id}/contacts", tags=["contacts"])


def _get_category_or_404(category_id: int, db: Session) -> Category:
    category = db.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category


@router.get("", response_model=List[ContactOut])
def list_contacts(category_id: int, db: Session = Depends(get_db)):
    _get_category_or_404(category_id, db)
    return db.query(Contact).filter(Contact.category_id == category_id).all()


@router.post("", response_model=ContactOut, status_code=201)
def create_contact(category_id: int, payload: ContactCreate, db: Session = Depends(get_db)):
    _get_category_or_404(category_id, db)
    contact = Contact(category_id=category_id, **payload.model_dump())
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact


@router.get("/{contact_id}", response_model=ContactOut)
def get_contact(category_id: int, contact_id: int, db: Session = Depends(get_db)):
    _get_category_or_404(category_id, db)
    contact = db.query(Contact).filter(
        Contact.id == contact_id, Contact.category_id == category_id
    ).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    return contact


@router.patch("/{contact_id}", response_model=ContactOut)
def update_contact(category_id: int, contact_id: int, payload: ContactUpdate, db: Session = Depends(get_db)):
    _get_category_or_404(category_id, db)
    contact = db.query(Contact).filter(
        Contact.id == contact_id, Contact.category_id == category_id
    ).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(contact, field, value)
    db.commit()
    db.refresh(contact)
    return contact


@router.delete("/{contact_id}", status_code=204)
def delete_contact(category_id: int, contact_id: int, db: Session = Depends(get_db)):
    _get_category_or_404(category_id, db)
    contact = db.query(Contact).filter(
        Contact.id == contact_id, Contact.category_id == category_id
    ).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    db.delete(contact)
    db.commit()
