from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.database.models import Document, Annotation, User
from app.schemas.schemas import AnnotationCreate, AnnotationResponse, AnnotationUpdate
from app.core.deps import get_current_user

router = APIRouter(tags=["annotations"])

@router.get("/api/documents/{doc_id}/annotations", response_model=List[AnnotationResponse])
def list_annotations(
    doc_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    doc = db.query(Document).filter(Document.id == doc_id, Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    return (
        db.query(Annotation)
        .filter(Annotation.document_id == doc_id)
        .order_by(Annotation.page_number.asc(), Annotation.created_at.asc())
        .all()
    )

@router.post("/api/documents/{doc_id}/annotations", response_model=AnnotationResponse, status_code=status.HTTP_201_CREATED)
def create_annotation(
    doc_id: str,
    payload: AnnotationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    doc = db.query(Document).filter(Document.id == doc_id, Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    annotation = Annotation(
        document_id=doc_id,
        page_number=payload.page_number,
        color=payload.color,
        selected_text=payload.selected_text,
        rects_json=payload.rects_json,
        comment_text=payload.comment_text,
    )
    db.add(annotation)
    db.commit()
    db.refresh(annotation)
    return annotation

@router.patch("/api/annotations/{annotation_id}", response_model=AnnotationResponse)
def update_annotation(
    annotation_id: str,
    payload: AnnotationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    ann = db.query(Annotation).join(Document).filter(
        Annotation.id == annotation_id,
        Document.user_id == current_user.id
    ).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Annotation not found")

    if payload.color is not None:
        ann.color = payload.color
    if payload.comment_text is not None:
        ann.comment_text = payload.comment_text

    db.commit()
    db.refresh(ann)
    return ann

@router.delete("/api/annotations/{annotation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_annotation(
    annotation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    ann = db.query(Annotation).join(Document).filter(
        Annotation.id == annotation_id,
        Document.user_id == current_user.id
    ).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Annotation not found")

    db.delete(ann)
    db.commit()
    return None
