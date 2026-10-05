import os
import shutil
import uuid
import re
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session
from sqlalchemy import func
import pypdf

from app.database.session import get_db
from app.database.models import Document, DocumentNote, User, DocumentChunk, DocumentFile
from app.schemas.schemas import (
    DocumentResponse,
    DocumentProgressUpdate,
    DocumentChunkResponse,
    ChunkSummaryResponse,
)
from app.core.config import STORAGE_DIR
from app.core.deps import get_current_user
from app.services.chunking import chunk_document, ensure_document_chunked

router = APIRouter(prefix="/api/documents", tags=["documents"])

def serialize_doc(doc: Document, db: Session) -> DocumentResponse:
    chunk_count = db.query(func.count(DocumentChunk.id)).filter(DocumentChunk.document_id == doc.id).scalar() or 0
    resp = DocumentResponse.model_validate(doc)
    resp.chunk_count = chunk_count
    resp.is_chunked = chunk_count > 0
    return resp

@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    file_id = str(uuid.uuid4())
    stored_filename = f"{file_id}.pdf"
    file_path = STORAGE_DIR / stored_filename

    # Read binary bytes
    file_bytes = await file.read()
    file_size = len(file_bytes)

    # Save file to disk cache
    try:
        with open(file_path, "wb") as buffer:
            buffer.write(file_bytes)
    except Exception:
        pass

    # Read page count using pypdf
    page_count = 1
    try:
        import io
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        page_count = len(reader.pages)
    except Exception:
        page_count = 1

    # Create document record in database linked to authenticated user
    doc = Document(
        id=file_id,
        user_id=current_user.id,
        filename=stored_filename,
        original_name=file.filename,
        file_size=file_size,
        page_count=max(1, page_count),
        last_page=1,
        progress_percent=round((1 / max(1, page_count)) * 100, 1),
    )
    db.add(doc)

    # Store binary PDF in database so ephemeral host restarts (Render, etc.) never lose files
    doc_file = DocumentFile(
        document_id=file_id,
        file_data=file_bytes,
    )
    db.add(doc_file)

    # Initialize empty Markdown note for this document
    note = DocumentNote(
        document_id=file_id,
        content="",
    )
    db.add(note)

    db.commit()
    db.refresh(doc)

    # Automatically chunk the uploaded document for instant AI readiness
    try:
        chunk_document(db, doc)
    except Exception as e:
        # Don't fail upload if chunking encounters an issue
        pass

    return serialize_doc(doc, db)

@router.get("", response_model=List[DocumentResponse])
def list_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    docs = (
        db.query(Document)
        .filter(Document.user_id == current_user.id)
        .order_by(Document.updated_at.desc())
        .all()
    )
    return [serialize_doc(d, db) for d in docs]

@router.get("/{doc_id}", response_model=DocumentResponse)
def get_document(
    doc_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    doc = db.query(Document).filter(Document.id == doc_id, Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return serialize_doc(doc, db)

@router.get("/{doc_id}/file")
def get_document_file(
    doc_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    doc = db.query(Document).filter(Document.id == doc_id, Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    file_path = STORAGE_DIR / doc.filename
    if file_path.exists():
        return FileResponse(
            path=str(file_path),
            media_type="application/pdf",
            filename=doc.original_name,
        )

    # Fallback to database binary if disk was wiped by ephemeral host (Render, etc.)
    doc_file = db.query(DocumentFile).filter(DocumentFile.document_id == doc_id).first()
    if doc_file and doc_file.file_data:
        try:
            with open(file_path, "wb") as f:
                f.write(doc_file.file_data)
        except Exception:
            pass

        return Response(
            content=doc_file.file_data,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'inline; filename="{doc.original_name}"'
            }
        )

    raise HTTPException(status_code=404, detail="File on disk not found")

@router.post("/{doc_id}/reupload", response_model=DocumentResponse)
async def reupload_document_file(
    doc_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    doc = db.query(Document).filter(Document.id == doc_id, Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    file_bytes = await file.read()
    file_path = STORAGE_DIR / doc.filename
    try:
        with open(file_path, "wb") as f:
            f.write(file_bytes)
    except Exception:
        pass

    doc_file = db.query(DocumentFile).filter(DocumentFile.document_id == doc_id).first()
    if not doc_file:
        doc_file = DocumentFile(document_id=doc_id, file_data=file_bytes)
        db.add(doc_file)
    else:
        doc_file.file_data = file_bytes

    doc.file_size = len(file_bytes)
    try:
        import io
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        doc.page_count = max(1, len(reader.pages))
    except Exception:
        pass

    db.commit()
    db.refresh(doc)
    return serialize_doc(doc, db)

@router.patch("/{doc_id}/progress", response_model=DocumentResponse)
def update_progress(
    doc_id: str,
    payload: DocumentProgressUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    doc = db.query(Document).filter(Document.id == doc_id, Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    doc.last_page = payload.last_page
    if payload.progress_percent is not None:
        doc.progress_percent = payload.progress_percent
    else:
        doc.progress_percent = round((payload.last_page / max(1, doc.page_count)) * 100, 1)

    db.commit()
    db.refresh(doc)
    return serialize_doc(doc, db)

@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    doc_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    doc = db.query(Document).filter(Document.id == doc_id, Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    file_path = STORAGE_DIR / doc.filename
    if file_path.exists():
        try:
            os.remove(file_path)
        except Exception:
            pass

    db.delete(doc)
    db.commit()
    return None

# --- User-Level Document Chunking & RAG Preparation ---

@router.post("/{doc_id}/chunk", response_model=ChunkSummaryResponse)
def chunk_user_document(
    doc_id: str,
    target_words: int = Query(150, ge=50, le=500),
    overlap_words: int = Query(30, ge=0, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Triggers sliding-window text chunking for a document owned by the current user."""
    doc = db.query(Document).filter(Document.id == doc_id, Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    try:
        summary = chunk_document(
            db=db,
            document=doc,
            target_words=target_words,
            overlap_words=overlap_words,
        )
        return summary
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chunking failed: {str(e)}")

@router.get("/{doc_id}/chunks", response_model=List[DocumentChunkResponse])
def get_user_document_chunks(
    doc_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieves all chunks for a document owned by the current user."""
    doc = db.query(Document).filter(Document.id == doc_id, Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    chunks = (
        db.query(DocumentChunk)
        .filter(DocumentChunk.document_id == doc_id)
        .order_by(DocumentChunk.chunk_index.asc())
        .all()
    )
    return chunks

@router.post("/{doc_id}/rag-search")
def search_user_document_chunks(
    doc_id: str,
    data: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Performs keyword/semantic relevance search across this user document's chunks."""
    doc = db.query(Document).filter(Document.id == doc_id, Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    ensure_document_chunked(db, doc)

    query_text = (data.get("query") or "").strip().lower()
    top_k = min(20, max(1, int(data.get("top_k", 5))))
    if not query_text:
        return {"query": query_text, "results": []}

    query_words = [w for w in re.split(r'\W+', query_text) if len(w) > 2]
    if not query_words:
        return {"query": query_text, "results": []}

    chunks = db.query(DocumentChunk).filter(DocumentChunk.document_id == doc_id).all()
    scored = []
    for c in chunks:
        content_lower = c.content.lower()
        score = 0.0
        if query_text in content_lower:
            score += 5.0
        for w in query_words:
            if w in content_lower:
                score += 1.0 + (content_lower.count(w) * 0.2)
        if score > 0:
            scored.append({
                "chunk_id": c.id,
                "chunk_index": c.chunk_index,
                "page_number": c.page_number,
                "relevance_score": round(score, 2),
                "snippet": c.content[:300] + ("..." if len(c.content) > 300 else ""),
                "token_count": c.token_count,
            })

    scored.sort(key=lambda x: x["relevance_score"], reverse=True)
    return {
        "query": query_text,
        "document_id": doc_id,
        "document_name": doc.original_name,
        "results": scored[:top_k],
    }
