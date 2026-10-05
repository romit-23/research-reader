from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.database.models import Document, DocumentNote, User
from app.schemas.schemas import DocumentNoteResponse, DocumentNoteUpdate
from app.core.deps import get_current_user

router = APIRouter(prefix="/api/documents", tags=["notes"])

@router.get("/{doc_id}/notes", response_model=DocumentNoteResponse)
def get_document_notes(
    doc_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    doc = db.query(Document).filter(Document.id == doc_id, Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    note = db.query(DocumentNote).filter(DocumentNote.document_id == doc_id).first()
    if not note:
        note = DocumentNote(
            document_id=doc_id,
            content="",
        )
        db.add(note)
        db.commit()
        db.refresh(note)

    return note

@router.put("/{doc_id}/notes", response_model=DocumentNoteResponse)
def update_document_notes(
    doc_id: str,
    payload: DocumentNoteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    doc = db.query(Document).filter(Document.id == doc_id, Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    note = db.query(DocumentNote).filter(DocumentNote.document_id == doc_id).first()
    if not note:
        note = DocumentNote(document_id=doc_id, content=payload.content)
        db.add(note)
    else:
        note.content = payload.content

    db.commit()
    db.refresh(note)
    return note
