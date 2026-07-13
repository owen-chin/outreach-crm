from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.db.database import get_db
from app.models.models import Person, User
from app.schemas.schemas import PersonCreate, PersonUpdate, PersonOut
from app.services.auth_utils import get_current_user
from app.services.ownership import get_owned_org

router = APIRouter(prefix="/api/organizations/{org_id}/people", tags=["people"])


def _get_person_or_404(org_id: int, person_id: int, db: Session) -> Person:
    person = db.query(Person).filter(
        Person.id == person_id, Person.organization_id == org_id
    ).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    return person


@router.get("", response_model=List[PersonOut])
def list_people(org_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    get_owned_org(db, org_id, current_user)
    return db.query(Person).filter(Person.organization_id == org_id).all()


@router.post("", response_model=PersonOut, status_code=201)
def add_person(org_id: int, payload: PersonCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    get_owned_org(db, org_id, current_user)
    person = Person(organization_id=org_id, **payload.model_dump())
    db.add(person)
    db.commit()
    db.refresh(person)
    return person


@router.patch("/{person_id}", response_model=PersonOut)
def update_person(org_id: int, person_id: int, payload: PersonUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    get_owned_org(db, org_id, current_user)
    person = _get_person_or_404(org_id, person_id, db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(person, field, value)
    db.commit()
    db.refresh(person)
    return person


@router.delete("/{person_id}", status_code=204)
def delete_person(org_id: int, person_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    get_owned_org(db, org_id, current_user)
    person = _get_person_or_404(org_id, person_id, db)
    db.delete(person)
    db.commit()
