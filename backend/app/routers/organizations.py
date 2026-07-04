from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.db.database import get_db
from app.models.models import Organization, Category, Person
from app.schemas.schemas import OrgCreate, OrgUpdate, OrgOut

router = APIRouter(prefix="/api/categories/{category_id}/organizations", tags=["organizations"])


def _get_org_or_404(category_id: int, org_id: int, db: Session) -> Organization:
    org = db.query(Organization).filter(
        Organization.id == org_id, Organization.category_id == category_id
    ).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


@router.get("", response_model=List[OrgOut])
def list_orgs(category_id: int, db: Session = Depends(get_db)):
    return db.query(Organization).filter(Organization.category_id == category_id).all()


@router.post("", response_model=OrgOut, status_code=201)
def create_org(category_id: int, payload: OrgCreate, db: Session = Depends(get_db)):
    if not db.get(Category, category_id):
        raise HTTPException(status_code=404, detail="Category not found")

    data = payload.model_dump(exclude={"contact_name", "contact_email"})
    org = Organization(category_id=category_id, **data)
    db.add(org)
    db.flush()

    if payload.contact_name or payload.contact_email:
        person = Person(
            organization_id=org.id,
            name=payload.contact_name,
            email=payload.contact_email,
        )
        db.add(person)

    db.commit()
    db.refresh(org)
    return org


@router.get("/{org_id}", response_model=OrgOut)
def get_org(category_id: int, org_id: int, db: Session = Depends(get_db)):
    return _get_org_or_404(category_id, org_id, db)


@router.patch("/{org_id}", response_model=OrgOut)
def update_org(category_id: int, org_id: int, payload: OrgUpdate, db: Session = Depends(get_db)):
    org = _get_org_or_404(category_id, org_id, db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(org, field, value)
    db.commit()
    db.refresh(org)
    return org


@router.delete("/{org_id}", status_code=204)
def delete_org(category_id: int, org_id: int, db: Session = Depends(get_db)):
    org = _get_org_or_404(category_id, org_id, db)
    db.delete(org)
    db.commit()
