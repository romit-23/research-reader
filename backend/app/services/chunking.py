import re
import json
import math
from pathlib import Path
from typing import List, Dict, Any, Optional
from pypdf import PdfReader
from sqlalchemy.orm import Session
from app.database.models import Document, DocumentChunk
from app.core.config import STORAGE_DIR

STOP_WORDS = {
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and",
    "any", "are", "aren't", "as", "at", "be", "because", "been", "before", "being",
    "below", "between", "both", "but", "by", "can", "can't", "cannot", "could",
    "did", "do", "does", "doing", "don't", "down", "during", "each", "few", "for",
    "from", "further", "had", "has", "have", "having", "he", "her", "here", "hers",
    "herself", "him", "himself", "his", "how", "i", "if", "in", "into", "is", "isn't",
    "it", "its", "itself", "let's", "me", "more", "most", "my", "myself", "no", "nor",
    "not", "of", "off", "on", "once", "only", "or", "other", "ought", "our", "ours",
    "ourselves", "out", "over", "own", "same", "she", "should", "so", "some", "such",
    "than", "that", "the", "their", "theirs", "them", "themselves", "then", "there",
    "these", "they", "this", "those", "through", "to", "too", "under", "until", "up",
    "very", "was", "we", "were", "what", "when", "where", "which", "while", "who",
    "whom", "why", "with", "would", "you", "your", "yours", "yourself", "yourselves"
}

def clean_text(text: str) -> str:
    """Normalize whitespace and line-breaks."""
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def split_text_into_chunks(
    text: str,
    page_number: int = 1,
    target_words: int = 160,
    overlap_words: int = 35,
) -> List[Dict[str, Any]]:
    """
    Splits text into overlapping chunks respecting sentence/word boundaries.
    """
    words = text.split()
    if not words:
        return []

    chunks = []
    step = max(1, target_words - overlap_words)

    for i in range(0, len(words), step):
        chunk_words = words[i:i + target_words]
        chunk_text = " ".join(chunk_words)
        if len(chunk_text) < 15 and i > 0:
            # Skip tiny trailing fragments
            continue

        token_est = int(len(chunk_words) * 1.3)
        chunks.append({
            "page_number": page_number,
            "content": chunk_text,
            "token_count": token_est,
            "metadata": {
                "word_count": len(chunk_words),
                "start_word_index": i,
                "strategy": "sliding_window",
            }
        })

        if i + target_words >= len(words):
            break

    return chunks

def chunk_document(
    db: Session,
    document: Document,
    target_words: int = 160,
    overlap_words: int = 35,
) -> Dict[str, Any]:
    """
    Extracts text from PDF, partitions into structured chunks, and stores in document_chunks table.
    """
    file_path = STORAGE_DIR / document.filename
    if not file_path.exists():
        raise FileNotFoundError(f"PDF file {document.filename} not found in storage.")

    try:
        reader = PdfReader(str(file_path))
        num_pages = len(reader.pages)
    except Exception:
        reader = None
        num_pages = 0

    # Clean existing chunks for this document
    db.query(DocumentChunk).filter(DocumentChunk.document_id == document.id).delete()
    db.flush()

    all_chunks: List[Dict[str, Any]] = []

    if reader:
        for page_idx, page in enumerate(reader.pages):
            page_num = page_idx + 1
            try:
                raw_text = page.extract_text() or ""
            except Exception:
                raw_text = ""
            cleaned = clean_text(raw_text)
            if not cleaned:
                continue

            page_chunks = split_text_into_chunks(
                cleaned,
                page_number=page_num,
                target_words=target_words,
                overlap_words=overlap_words,
            )
            all_chunks.extend(page_chunks)

    # Save to database
    chunk_objects = []
    for idx, c in enumerate(all_chunks):
        chunk_obj = DocumentChunk(
            document_id=document.id,
            chunk_index=idx,
            page_number=c["page_number"],
            content=c["content"],
            token_count=c["token_count"],
            metadata_json=json.dumps(c["metadata"]),
            embedding_json=None,
        )
        chunk_objects.append(chunk_obj)
        db.add(chunk_obj)

    db.commit()

    total_tokens = sum(c["token_count"] for c in all_chunks)

    return {
        "document_id": document.id,
        "document_name": document.original_name,
        "pages_processed": num_pages,
        "chunks_generated": len(chunk_objects),
        "total_tokens_estimated": total_tokens,
    }

def retrieve_relevant_chunks(
    db: Session,
    document_id: str,
    query: str,
    top_k: int = 5,
    current_page: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    High-relevance BM25/TF-IDF hybrid lexical retrieval over document chunks.
    Ranks chunks based on term frequency, inverse document frequency across chunks,
    exact phrase matching, and optional page proximity bonus.
    """
    raw_query = query.strip()
    if not raw_query:
        return []

    chunks = (
        db.query(DocumentChunk)
        .filter(DocumentChunk.document_id == document_id)
        .order_by(DocumentChunk.chunk_index.asc())
        .all()
    )

    if not chunks:
        return []

    # If all chunks are requested (e.g. for small document summary)
    total_chunks = len(chunks)

    # Tokenize and filter query
    words = re.findall(r'\b[a-zA-Z0-9_\-\']+\b', raw_query.lower())
    meaningful_words = [w for w in words if w not in STOP_WORDS and len(w) > 2]
    if not meaningful_words:
        meaningful_words = words

    # Calculate document frequency for meaningful words across chunks
    doc_freq: Dict[str, int] = {}
    chunk_words_map: Dict[str, List[str]] = {}
    for c in chunks:
        c_words = re.findall(r'\b[a-zA-Z0-9_\-\']+\b', c.content.lower())
        chunk_words_map[c.id] = c_words
        unique_in_chunk = set(c_words)
        for w in meaningful_words:
            if w in unique_in_chunk:
                doc_freq[w] = doc_freq.get(w, 0) + 1

    scored = []
    query_lower = raw_query.lower()

    for c in chunks:
        content_lower = c.content.lower()
        score = 0.0

        # Exact phrase match gives significant boost
        if query_lower in content_lower:
            score += 30.0

        # BM25-style TF-IDF scoring for individual words
        c_words = chunk_words_map[c.id]
        chunk_len = max(1, len(c_words))

        for w in meaningful_words:
            tf = c_words.count(w)
            if tf > 0:
                df = doc_freq.get(w, 1)
                # Standard IDF with smoothing
                idf = math.log(1.0 + (total_chunks - df + 0.5) / (df + 0.5))
                # Sub-linear TF scaling
                tf_norm = (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * (chunk_len / 160.0)))
                score += max(0.1, idf) * tf_norm * 4.0

        # Page proximity boost: slightly prefer chunks close to user's current reading page
        if current_page and c.page_number:
            dist = abs(c.page_number - current_page)
            if dist == 0:
                score += 3.0
            elif dist <= 2:
                score += 1.5

        if score > 0.5:
            scored.append({
                "id": c.id,
                "chunk_index": c.chunk_index,
                "page_number": c.page_number,
                "content": c.content,
                "token_count": c.token_count,
                "score": round(score, 2),
            })

    # Sort descending by score
    scored.sort(key=lambda x: x["score"], reverse=True)

    # If no chunks met threshold, fallback to first few chunks (e.g. abstract / intro)
    if not scored:
        scored = [
            {
                "id": c.id,
                "chunk_index": c.chunk_index,
                "page_number": c.page_number,
                "content": c.content,
                "token_count": c.token_count,
                "score": 0.1,
            }
            for c in chunks[:top_k]
        ]

    return scored[:top_k]

DEFINITION_SIGNALS = [
    "defined as", "we define", "refers to", "denoted by", "denote",
    "formally", "we formulate", "is called", "in this paper, we",
    "we introduce", "abbreviation for", "short for", "stands for",
]

def retrieve_definition_chunks(
    db: Session,
    document_id: str,
    term: str,
    top_k: int = 4,
) -> List[Dict[str, Any]]:
    """
    Specifically locates where the authors introduce, define, or formally describe a concept/term.
    Prioritizes:
    - Definition keywords: 'defined as', 'we define', 'refers to', 'denoted by', 'formally'
    - Acronym parentheses matches: e.g. '(LoRA)' or 'LoRA ('
    - Early chunk appearance: definitions typically appear in abstract / introduction / methodology.
    """
    clean_term = term.strip().lower()
    if not clean_term:
        return []

    chunks = (
        db.query(DocumentChunk)
        .filter(DocumentChunk.document_id == document_id)
        .order_by(DocumentChunk.chunk_index.asc())
        .all()
    )

    if not chunks:
        return []

    scored = []
    term_words = [w for w in re.findall(r'\b\w+\b', clean_term) if w not in STOP_WORDS and len(w) > 1]
    if not term_words:
        term_words = [clean_term]

    for c in chunks:
        content_lower = c.content.lower()
        score = 0.0

        # Exact term match
        if clean_term in content_lower:
            score += 25.0

            # Definition indicator patterns
            for sig in DEFINITION_SIGNALS:
                if sig in content_lower:
                    score += 15.0

            # Acronym or notation patterns: e.g. "(CNN)" or "CNN ("
            if f"({clean_term})" in content_lower or f"({clean_term.upper()})" in content_lower:
                score += 20.0
            if f"{clean_term} (" in content_lower:
                score += 15.0

            # Early appearance bonus (introductory definitions typically appear in first 25-35% of paper)
            rel_pos = c.chunk_index / max(1, len(chunks))
            if rel_pos <= 0.25:
                score += 15.0 * (1.0 - rel_pos)
            elif rel_pos <= 0.40:
                score += 7.0
        else:
            # Partial word matches if multi-word term
            matched = sum(1 for w in term_words if w in content_lower)
            if matched == len(term_words):
                score += 12.0
                for sig in DEFINITION_SIGNALS:
                    if sig in content_lower:
                        score += 8.0

        if score > 5.0:
            scored.append({
                "id": c.id,
                "chunk_index": c.chunk_index,
                "page_number": c.page_number,
                "content": c.content,
                "token_count": c.token_count,
                "score": round(score, 2),
            })

    scored.sort(key=lambda x: x["score"], reverse=True)

    # Fallback to general retrieval if no explicit definition signal matched
    if not scored:
        return retrieve_relevant_chunks(db, document_id, term, top_k=top_k)

    return scored[:top_k]

def ensure_document_chunked(db: Session, document: Document) -> int:
    """
    Ensures a document has chunks covering all its pages.
    Auto-detects documents with 0 chunks or legacy single-page chunking,
    and re-chunks them across all pages.
    """
    chunk_count = db.query(DocumentChunk).filter(DocumentChunk.document_id == document.id).count()
    if chunk_count == 0:
        try:
            summary = chunk_document(db, document)
            return summary.get("chunks_generated", 0)
        except Exception:
            return 0
    elif document.page_count and document.page_count > 2:
        distinct_pages = db.query(DocumentChunk.page_number).filter(DocumentChunk.document_id == document.id).distinct().count()
        if distinct_pages <= 1:
            try:
                summary = chunk_document(db, document)
                return summary.get("chunks_generated", 0)
            except Exception:
                return chunk_count
    return chunk_count


