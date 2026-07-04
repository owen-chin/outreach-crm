from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.db.database import get_db
from app.models.models import Person, Organization
from app.schemas.schemas import PersonCreate, PersonUpdate, PersonOut

router = APIRouter(prefix="/api/organizations/{org_id}/people", tags=["people"])


def _get_org_or_404(org_id: int, db: Session) -> Organization:
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


def _get_person_or_404(org_id: int, person_id: int, db: Session) -> Person:
    person = db.query(Person).filter(
        Person.id == person_id, Person.organization_id == org_id
    ).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    return person


@router.get("", response_model=List[PersonOut])
def list_people(org_id: int, db: Session = Depends(get_db)):
    _get_org_or_404(org_id, db)
    return db.query(Person).filter(Person.organization_id == org_id).all()


@router.post("", response_model=PersonOut, status_code=201)
def add_person(org_id: int, payload: PersonCreate, db: Session = Depends(get_db)):
    _get_org_or_404(org_id, db)
    person = Person(organization_id=org_id, **payload.model_dump())
    db.add(person)
    db.commit()
    db.refresh(person)
    return person


@router.patch("/{person_id}", response_model=PersonOut)
def update_person(org_id: int, person_id: int, payload: PersonUpdate, db: Session = Depends(get_db)):
    person = _get_person_or_404(org_id, person_id, db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(person, field, value)
    db.commit()
    db.refresh(person)
    return person


@router.delete("/{person_id}", status_code=204)
def delete_person(org_id: int, person_id: int, db: Session = Depends(get_db)):
    person = _get_person_or_404(org_id, person_id, db)
    db.delete(person)
    db.commit()
