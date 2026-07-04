from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.db.database import get_db
from app.models.models import Category, Project, Contact, ContactStatus
from app.schemas.schemas import CategoryCreate, CategoryUpdate, CategoryOut, GmailImportThread, GmailImportCreate, ContactOut
from app.services.gmail import get_credentials, get_or_create_label, list_threads_for_label

router = APIRouter(prefix="/api/projects/{project_id}/categories", tags=["categories"])


def _get_project_or_404(project_id: int, db: Session) -> Project:
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("", response_model=List[CategoryOut])
def list_categories(project_id: int, db: Session = Depends(get_db)):
    _get_project_or_404(project_id, db)
    return db.query(Category).filter(Category.project_id == project_id).all()


@router.post("", response_model=CategoryOut, status_code=201)
def create_category(project_id: int, payload: CategoryCreate, db: Session = Depends(get_db)):
    _get_project_or_404(project_id, db)
    category = Category(project_id=project_id, **payload.model_dump())
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.get("/{category_id}", response_model=CategoryOut)
def get_category(project_id: int, category_id: int, db: Session = Depends(get_db)):
    _get_project_or_404(project_id, db)
    category = db.query(Category).filter(
        Category.id == category_id, Category.project_id == project_id
    ).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category


@router.patch("/{category_id}", response_model=CategoryOut)
def update_category(project_id: int, category_id: int, payload: CategoryUpdate, db: Session = Depends(get_db)):
    _get_project_or_404(project_id, db)
    category = db.query(Category).filter(
        Category.id == category_id, Category.project_id == project_id
    ).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(category, field, value)
    db.commit()
    db.refresh(category)
    return category


@router.delete("/{category_id}", status_code=204)
def delete_category(project_id: int, category_id: int, db: Session = Depends(get_db)):
    _get_project_or_404(project_id, db)
    category = db.query(Category).filter(
        Category.id == category_id, Category.project_id == project_id
    ).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    db.delete(category)
    db.commit()


@router.get("/{category_id}/gmail-import", response_model=List[GmailImportThread])
def list_gmail_import(project_id: int, category_id: int, db: Session = Depends(get_db)):
    project = _get_project_or_404(project_id, db)
    category = db.query(Category).filter(
        Category.id == category_id, Category.project_id == project_id
    ).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    creds = get_credentials(db)
    if not creds or not creds.valid:
        raise HTTPException(status_code=403, detail="Gmail not connected")

    label_name = f"{project.name}/{category.name}"
    try:
        label_id = get_or_create_label(creds, label_name)
        threads = list_threads_for_label(creds, label_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gmail error: {e}")

    existing_thread_ids = {
        c.gmail_thread_id
        for c in db.query(Contact).filter(Contact.category_id == category_id).all()
        if c.gmail_thread_id
    }

    return [GmailImportThread(**t) for t in threads if t["thread_id"] not in existing_thread_ids]


@router.post("/{category_id}/gmail-import", response_model=ContactOut, status_code=201)
def create_contact_from_gmail(
    project_id: int, category_id: int, payload: GmailImportCreate, db: Session = Depends(get_db)
):
    _get_project_or_404(project_id, db)
    category = db.query(Category).filter(
        Category.id == category_id, Category.project_id == project_id
    ).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    contact = Contact(
        category_id=category_id,
        company_name=payload.company_name,
        contact_name=payload.contact_name,
        email=payload.email,
        gmail_thread_id=payload.thread_id,
        status=ContactStatus.responded,
    )
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact
