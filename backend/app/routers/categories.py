from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.db.database import get_db
from app.models.models import Category, Organization, Person, Thread, ContactStatus, User
from app.schemas.schemas import CategoryCreate, CategoryUpdate, CategoryOut, GmailImportThread, GmailImportCreate, OrgOut
from app.services.auth_utils import get_current_user
from app.services.ownership import get_owned_project

router = APIRouter(prefix="/api/projects/{project_id}/categories", tags=["categories"])


@router.get("", response_model=List[CategoryOut])
def list_categories(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    get_owned_project(db, project_id, current_user)
    return db.query(Category).filter(Category.project_id == project_id).all()


@router.post("", response_model=CategoryOut, status_code=201)
def create_category(project_id: int, payload: CategoryCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    get_owned_project(db, project_id, current_user)
    category = Category(project_id=project_id, **payload.model_dump())
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.get("/{category_id}", response_model=CategoryOut)
def get_category(project_id: int, category_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    get_owned_project(db, project_id, current_user)
    category = db.query(Category).filter(
        Category.id == category_id, Category.project_id == project_id
    ).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category


@router.patch("/{category_id}", response_model=CategoryOut)
def update_category(project_id: int, category_id: int, payload: CategoryUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    get_owned_project(db, project_id, current_user)
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
def delete_category(project_id: int, category_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    get_owned_project(db, project_id, current_user)
    category = db.query(Category).filter(
        Category.id == category_id, Category.project_id == project_id
    ).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    db.delete(category)
    db.commit()


@router.post("/{category_id}/gmail-import", response_model=OrgOut, status_code=201)
def create_org_from_gmail(
    project_id: int, category_id: int, payload: GmailImportCreate,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    get_owned_project(db, project_id, current_user)
    category = db.query(Category).filter(
        Category.id == category_id, Category.project_id == project_id
    ).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    org = Organization(
        category_id=category_id,
        name=payload.org_name,
        status=ContactStatus.responded,
    )
    db.add(org)
    db.flush()

    if payload.contact_name or payload.email:
        person = Person(
            organization_id=org.id,
            name=payload.contact_name,
            email=payload.email,
        )
        db.add(person)

    thread = Thread(
        organization_id=org.id,
        gmail_thread_id=payload.thread_id,
        subject=payload.subject,
    )
    db.add(thread)

    db.commit()
    db.refresh(org)
    return org
