from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.db.session import get_db
from app.models.paper import Tag

router = APIRouter()


class TagCreateRequest(BaseModel):
    name: str


@router.get("")
def list_tags(db: Session = Depends(get_db)):
    tags = db.query(Tag).order_by(Tag.name).all()
    return [{"id": t.id, "name": t.name} for t in tags]


@router.post("")
def create_tag(request: TagCreateRequest, db: Session = Depends(get_db)):
    existing = db.query(Tag).filter(Tag.name == request.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Tag already exists")
    tag = Tag(name=request.name)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return {"id": tag.id, "name": tag.name}


@router.delete("/{tag_id}")
def delete_tag(tag_id: int, db: Session = Depends(get_db)):
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    db.delete(tag)
    db.commit()
    return {"deleted": True}
