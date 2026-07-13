from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.models import Category, Organization, Person, Project, Thread, User


def get_owned_project(db: Session, project_id: int, user: User) -> Project:
    project = db.query(Project).filter(
        Project.id == project_id, Project.user_id == user.id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def get_owned_category(db: Session, category_id: int, user: User) -> Category:
    category = (
        db.query(Category)
        .join(Project, Category.project_id == Project.id)
        .filter(Category.id == category_id, Project.user_id == user.id)
        .first()
    )
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category


def get_owned_org(db: Session, org_id: int, user: User) -> Organization:
    org = (
        db.query(Organization)
        .join(Category, Organization.category_id == Category.id)
        .join(Project, Category.project_id == Project.id)
        .filter(Organization.id == org_id, Project.user_id == user.id)
        .first()
    )
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


def get_owning_user_id(db: Session, *, organization_id: int) -> int | None:
    """Resolves the Project.user_id that owns a given organization, for contexts
    with no logged-in request user (e.g. the cron-triggered scheduled-send job)."""
    return (
        db.query(Project.user_id)
        .join(Category, Category.project_id == Project.id)
        .join(Organization, Organization.category_id == Category.id)
        .filter(Organization.id == organization_id)
        .scalar()
    )
