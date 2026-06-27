from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.db.database import get_db
from app.models.models import Category, Project
from app.schemas.schemas import CategoryCreate, CategoryUpdate, CategoryOut

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
