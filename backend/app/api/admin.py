import time
import os
import json
import re
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text, func

from app.database.session import get_db, engine
from app.database.models import User, Document, Annotation, DocumentNote, DocumentChunk
from app.core.config import DATABASE_URL, STORAGE_DIR
from app.core.deps import require_admin
from app.services.chunking import chunk_document

router = APIRouter(prefix="/api/admin", tags=["admin"])

def get_sanitized_db_info():
    """Sanitize database URL so passwords are never exposed."""
    dialect = engine.dialect.name
    if dialect == "sqlite":
        return {
            "dialect": "SQLite (Local File)",
            "host": str(STORAGE_DIR / "reader.db"),
            "is_cloud": False,
        }
    # PostgreSQL / Supabase
    host = "Cloud Database"
    try:
        parts = DATABASE_URL.split("@")
        if len(parts) > 1:
            host = parts[1].split("/")[0]
    except Exception:
        host = "Remote PostgreSQL"

    return {
        "dialect": f"PostgreSQL ({'Supabase' if 'supabase' in DATABASE_URL.lower() else 'Remote'})",
        "host": host,
        "is_cloud": True,
    }

@router.get("/health")
def get_admin_health(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Verifies database connectivity, latency, active dialect, and table metrics."""
    start_time = time.time()
    try:
        db.execute(text("SELECT 1"))
        latency_ms = round((time.time() - start_time) * 1000, 2)
        db_connected = True
    except Exception as e:
        latency_ms = -1
        db_connected = False

    # Row counts
    counts = {
        "users": db.query(func.count(User.id)).scalar() or 0,
        "documents": db.query(func.count(Document.id)).scalar() or 0,
        "annotations": db.query(func.count(Annotation.id)).scalar() or 0,
        "document_notes": db.query(func.count(DocumentNote.id)).scalar() or 0,
        "document_chunks": db.query(func.count(DocumentChunk.id)).scalar() or 0,
    }

    # Storage stats
    total_files = 0
    total_bytes = 0
    if STORAGE_DIR.exists():
        for f in STORAGE_DIR.glob("*.pdf"):
            total_files += 1
            total_bytes += f.stat().st_size

    db_info = get_sanitized_db_info()

    return {
        "status": "healthy" if db_connected else "error",
        "database_connected": db_connected,
        "latency_ms": latency_ms,
        "database_info": db_info,
        "table_counts": counts,
        "storage_stats": {
            "pdf_count": total_files,
            "total_size_mb": round(total_bytes / (1024 * 1024), 2),
        },
        "caller": {
            "username": current_user.username,
            "email": current_user.email,
        }
    }

@router.get("/tables/{table_name}")
def get_table_records(
    table_name: str,
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Data explorer to browse records in any database table."""
    allowed_tables = {
        "users": (User, ["id", "email", "username", "created_at"]),
        "documents": (Document, ["id", "user_id", "original_name", "file_size", "page_count", "last_page", "progress_percent", "created_at"]),
        "annotations": (Annotation, ["id", "document_id", "page_number", "color", "selected_text", "comment_text", "created_at"]),
        "document_notes": (DocumentNote, ["id", "document_id", "content", "updated_at"]),
        "document_chunks": (DocumentChunk, ["id", "document_id", "chunk_index", "page_number", "content", "token_count", "created_at"]),
    }

    if table_name not in allowed_tables:
        raise HTTPException(status_code=400, detail=f"Table '{table_name}' not accessible.")

    model_class, columns = allowed_tables[table_name]
    query = db.query(model_class)

    # Basic search filter if provided
    if search and search.strip():
        term = f"%{search.strip()}%"
        if table_name == "users":
            query = query.filter((User.email.ilike(term)) | (User.username.ilike(term)))
        elif table_name == "documents":
            query = query.filter(Document.original_name.ilike(term))
        elif table_name == "annotations":
            query = query.filter((Annotation.selected_text.ilike(term)) | (Annotation.comment_text.ilike(term)))
        elif table_name == "document_notes":
            query = query.filter(DocumentNote.content.ilike(term))
        elif table_name == "document_chunks":
            query = query.filter(DocumentChunk.content.ilike(term))

    total = query.count()
    records = query.order_by(getattr(model_class, "created_at", getattr(model_class, "updated_at", model_class.id)).desc())\
                   .offset((page - 1) * limit)\
                   .limit(limit)\
                   .all()

    # Serialize
    rows = []
    for r in records:
        row_dict = {}
        for col in columns:
            val = getattr(r, col, None)
            if hasattr(val, "isoformat"):
                val = val.isoformat()
            row_dict[col] = val
        rows.append(row_dict)

    return {
        "table_name": table_name,
        "page": page,
        "limit": limit,
        "total_records": total,
        "columns": columns,
        "rows": rows,
    }

# --- AI RAG & Chunking Endpoints ---

@router.get("/rag/documents")
def get_rag_documents_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Returns documents with chunk counts and token statistics."""
    docs = db.query(Document).order_by(Document.created_at.desc()).all()
    results = []

    for d in docs:
        chunk_count = db.query(func.count(DocumentChunk.id)).filter(DocumentChunk.document_id == d.id).scalar() or 0
        total_tokens = db.query(func.sum(DocumentChunk.token_count)).filter(DocumentChunk.document_id == d.id).scalar() or 0
        results.append({
            "id": d.id,
            "name": d.original_name,
            "page_count": d.page_count,
            "file_size": d.file_size,
            "chunk_count": chunk_count,
            "total_tokens": total_tokens or 0,
            "is_chunked": chunk_count > 0,
            "created_at": d.created_at.isoformat() if d.created_at else None,
        })

    return results

@router.post("/rag/chunk/{document_id}")
def trigger_document_chunking(
    document_id: str,
    target_words: int = Query(150, ge=50, le=500),
    overlap_words: int = Query(30, ge=0, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Executes sliding-window text chunking for a document."""
    doc = db.query(Document).filter(Document.id == document_id).first()
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

@router.get("/rag/chunks/{document_id}")
def get_document_chunks(
    document_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Retrieves all chunks for a document."""
    chunks = db.query(DocumentChunk)\
               .filter(DocumentChunk.document_id == document_id)\
               .order_by(DocumentChunk.chunk_index.asc())\
               .all()

    return [
        {
            "id": c.id,
            "chunk_index": c.chunk_index,
            "page_number": c.page_number,
            "content": c.content,
            "token_count": c.token_count,
            "metadata": json.loads(c.metadata_json) if c.metadata_json else {},
            "has_embedding": bool(c.embedding_json),
        }
        for c in chunks
    ]

@router.post("/rag/test-search")
def test_rag_search(
    data: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    RAG similarity testbed: searches across chunks using weighted lexical-semantic relevance,
    ready to plug into vector cosine similarity.
    """
    query_text = (data.get("query") or "").strip().lower()
    document_id = data.get("document_id")
    top_k = min(20, max(1, int(data.get("top_k", 5))))

    if not query_text:
        return {"query": query_text, "results": []}

    query_words = [w for w in re.split(r'\W+', query_text) if len(w) > 2]
    if not query_words:
        query_words = [query_text]

    chunk_query = db.query(DocumentChunk, Document.original_name)\
                    .join(Document, Document.id == DocumentChunk.document_id)

    if document_id:
        chunk_query = chunk_query.filter(DocumentChunk.document_id == document_id)

    all_candidates = chunk_query.all()
    scored = []

    for chunk, doc_name in all_candidates:
        content_lower = chunk.content.lower()
        score = 0.0

        # Exact phrase match bonus
        if query_text in content_lower:
            score += 50.0

        # Individual keyword matches
        matched_words = 0
        for w in query_words:
            count = content_lower.count(w)
            if count > 0:
                score += min(count * 5.0, 20.0)
                matched_words += 1

        # Match coverage ratio
        if query_words:
            score += (matched_words / len(query_words)) * 25.0

        if score > 5.0:
            scored.append({
                "chunk_id": chunk.id,
                "document_id": chunk.document_id,
                "document_name": doc_name,
                "chunk_index": chunk.chunk_index,
                "page_number": chunk.page_number,
                "score": round(min(100.0, score), 1),
                "token_count": chunk.token_count,
                "content": chunk.content,
            })

    # Sort descending by score
    scored.sort(key=lambda x: x["score"], reverse=True)

    return {
        "query": query_text,
        "total_matches_found": len(scored),
        "results": scored[:top_k],
    }
