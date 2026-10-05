import re
import urllib.parse
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.database.models import User, Document, DocumentChunk
from app.core.deps import get_current_user, get_optional_current_user
from app.core.config import IS_PROD, IS_LOCAL, PROVIDER_ENV_KEYS, SHOW_AI_REASONS
from app.schemas.schemas import (
    AIDeepDiveRequest,
    AIDeepDiveResponse,
    AIChatRequest,
    AIChatResponse,
    CitedChunk,
    AISummaryRequest,
    AITestConnectionRequest,
    AITestConnectionResponse,
    AIProvidersResponse,
    AIFetchModelsRequest,
    AIFetchModelsResponse,
    ModelInfoItem,
)
from app.services.llm_provider import (
    generate_completion,
    get_ollama_models,
    test_llm_connection,
    fetch_provider_models,
    LLMProviderError,
    DEFAULT_OLLAMA_URL,
    DEFAULT_GEMINI_MODEL,
)
from app.services.chunking import (
    retrieve_relevant_chunks,
    retrieve_definition_chunks,
    chunk_document,
    ensure_document_chunked,
)
import os

router = APIRouter(prefix="/api/ai", tags=["ai"])

def extract_followups(text: str) -> List[str]:
    """Helper to extract suggested follow-up questions from LLM output."""
    lines = text.split("\n")
    followups = []
    for line in lines:
        cleaned = line.strip()
        if re.match(r'^(?:[-*•]|\d+\.)\s+', cleaned):
            q = re.sub(r'^(?:[-*•]|\d+\.)\s+', '', cleaned).strip()
            if q.endswith('?') and len(q) > 10:
                followups.append(q)
    return followups[:3]

@router.get("/providers", response_model=AIProvidersResponse)
async def get_providers_info(
    x_ollama_url: Optional[str] = Header(None, alias="X-Ollama-Url"),
):
    """
    Detects environment mode ('prod' vs 'local'), Ollama status,
    and returns provider defaults and server-configured credentials.
    """
    ollama_url = x_ollama_url or DEFAULT_OLLAMA_URL
    models = await get_ollama_models(ollama_url)
    ollama_available = len(models) > 0

    server_configured = [
        prov for prov, env_k in PROVIDER_ENV_KEYS.items()
        if bool(os.getenv(env_k))
    ]

    if IS_PROD:
        environment = "prod"
        # In prod mode, default to cloud provider (API keys path)
        default_provider = server_configured[0] if server_configured else "gemini"
        default_model = DEFAULT_GEMINI_MODEL if default_provider == "gemini" else "default"
    else:
        environment = "local"
        default_provider = "ollama" if ollama_available else "gemini"
        default_model = models[0] if (default_provider == "ollama" and models) else DEFAULT_GEMINI_MODEL

    return AIProvidersResponse(
        environment=environment,
        ollama_available=ollama_available,
        ollama_models=models,
        supported_cloud_providers=["gemini", "openai", "anthropic", "groq", "deepseek"],
        default_provider=default_provider,
        default_model=default_model,
        server_configured_providers=server_configured,
        show_ai_reasons=SHOW_AI_REASONS,
    )

@router.post("/test-connection", response_model=AITestConnectionResponse)
async def test_connection(payload: AITestConnectionRequest):
    """Verifies credentials or endpoint availability for any provider."""
    result = await test_llm_connection(
        provider=payload.provider,
        api_key=payload.api_key,
        model=payload.model,
        ollama_url=payload.ollama_url or DEFAULT_OLLAMA_URL,
    )
    return AITestConnectionResponse(
        success=result.get("success", False),
        provider=result.get("provider", payload.provider),
        message=result.get("message", ""),
        models=result.get("models"),
        key_source=result.get("key_source"),
    )

@router.post("/fetch-models", response_model=AIFetchModelsResponse)
async def get_models_for_provider(payload: AIFetchModelsRequest):
    """Fetches live available models for the specified provider and key."""
    result = await fetch_provider_models(
        provider=payload.provider,
        api_key=payload.api_key,
        ollama_url=payload.ollama_url or DEFAULT_OLLAMA_URL,
    )
    raw_models = result.get("models", [])
    model_items = [
        ModelInfoItem(id=m["id"], name=m["name"])
        for m in raw_models
        if isinstance(m, dict) and "id" in m
    ]
    return AIFetchModelsResponse(
        success=result.get("success", True),
        provider=result.get("provider", payload.provider),
        models=model_items,
        message=result.get("message"),
    )

@router.post("/deep-dive", response_model=AIDeepDiveResponse)
async def deep_dive(
    payload: AIDeepDiveRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
    x_ai_provider: Optional[str] = Header(None, alias="X-AI-Provider"),
    x_ai_key: Optional[str] = Header(None, alias="X-AI-Key"),
    x_ai_model: Optional[str] = Header(None, alias="X-AI-Model"),
    x_ollama_url: Optional[str] = Header(None, alias="X-Ollama-Url"),
):
    """
    Analyzes selected text, formula, or phrase using real LLM inferences.
    Grounds explanation in paper context if document_id is provided.
    """
    query_text = payload.selected_text.strip()
    if not query_text:
        raise HTTPException(status_code=400, detail="selected_text cannot be empty.")

    encoded_query = urllib.parse.quote_plus(query_text)
    google_url = f"https://www.google.com/search?q={encoded_query}"

    mode_prompts = {
        "explain": (
            "You are a world-class academic researcher. Break down the following concept or text clearly and deeply. "
            "Explain: 1) What it means in plain English, 2) Technical mechanism/math, 3) Why it matters in this research domain."
        ),
        "summarize": (
            "You are an academic synthesis assistant. Provide a concise executive summary of this excerpt with 3 bulleted key takeaways."
        ),
        "search_queries": (
            "You are an academic literature and citation analyst for this paper. "
            "Extract 4-6 high-impact academic search queries and key conceptual phrases to investigate this concept further. "
            "CRITICAL FORMAT RULES:\n"
            "1. State each search phrase enclosed in double quotes, followed immediately by the exact page where this concept or phrase appears in the paper, like [Page X]. "
            "Example: 1. \"computational complexity of scaled dot product attention\" [Page 4]\n"
            "2. Directly below each query, write 'Reason: <brief reason why this query is relevant to this section of the paper>'.\n"
            "3. Ensure each search phrase is grounded in the paper excerpts provided."
        ),
        "critique": (
            "You are a rigorous peer reviewer. Critically assess this passage, hypothesis, or methodology. "
            "Identify potential flaws, unstated assumptions, edge cases, and alternative viewpoints."
        ),
        "define": (
            "You are an expert academic scholar analyzing this specific research paper. "
            "Your task is to provide the AUTHORS' EXACT IN-PAPER DEFINITION and operationalization of the requested term/concept. "
            "CRITICAL RULES: 1) State strictly how the authors explicitly define, denote, or introduce this term on [Page X]. "
            "2) Detail any mathematical formula, notation, or specific architecture they use for it. "
            "3) Note any unique nuance or divergence from standard textbook definitions. "
            "4) If the term is used without formal redefinition, explain how the authors apply it in their methodology. "
            "5) Always cite the exact page number like [Page X]. "
            "6) Format directly with Markdown headings and bullet points. Never wrap your entire answer in backticks or code blocks (no ```markdown)."
        ),
    }

    system_prompt = mode_prompts.get(payload.mode, mode_prompts["explain"])

    paper_context = ""
    if payload.document_id and current_user:
        doc = db.query(Document).filter(Document.id == payload.document_id, Document.user_id == current_user.id).first()
        if doc:
            ensure_document_chunked(db, doc)
            paper_context = f"\nPaper: \"{doc.original_name}\""
            # If in definition mode, specifically use retrieve_definition_chunks
            if payload.mode == "define":
                chunks = retrieve_definition_chunks(db, payload.document_id, query_text, top_k=3)
            elif payload.mode == "search_queries":
                chunks = retrieve_relevant_chunks(db, payload.document_id, query_text, top_k=4, current_page=payload.current_page)
            else:
                chunks = retrieve_relevant_chunks(db, payload.document_id, query_text, top_k=2, current_page=payload.current_page)

            if chunks:
                paper_context += "\nRelevant excerpts from the paper:\n" + "\n".join(
                    f"[Page {c['page_number']}]: {c['content']}" for c in chunks
                )

    user_prompt = f"{paper_context}\n\nTarget term or concept to define in paper context:\n\"{query_text}\"\n\nPlease provide your analysis directly as formatted text (do NOT wrap your answer in a code fence)."

    # Enforce BYOK in prod for unauthenticated / guest requests
    if current_user is None and IS_PROD and not x_ai_key:
        explanation = (
            "⚠️ **API Key Required (BYOK in Production)**\n\n"
            "To use AI features as a guest without logging in, please configure your own API key in AI Settings.\n\n"
            "Click **⚙️ AI Settings** in the top navigation or sidebar to enter your free Google Gemini, OpenAI, or Groq API key."
        )
        return AIDeepDiveResponse(
            query=query_text,
            explanation=explanation,
            google_search_url=google_url,
            suggested_followups=["How to get a free Google Gemini API key?"],
            provider_used="none",
            model_used="none",
        )

    default_provider = "gemini" if IS_PROD else "ollama"
    provider = x_ai_provider or default_provider
    model = x_ai_model
    ollama_url = x_ollama_url or DEFAULT_OLLAMA_URL

    try:
        explanation = await generate_completion(
            prompt=user_prompt,
            system_prompt=system_prompt,
            provider=provider,
            api_key=x_ai_key,
            model=model,
            ollama_url=ollama_url,
            temperature=0.3,
        )
    except LLMProviderError as e:
        # Fallback to rich informative error message so the user knows what to do
        explanation = (
            f"⚠️ **AI Service Notice**\n\n"
            f"{str(e)}\n\n"
            f"---\n\n"
            f"**Quick Troubleshooting:**\n"
            f"- If using **Local Ollama**: Ensure Ollama is running (`ollama serve`). You can run `ollama pull qwen2.5:3b` in your terminal.\n"
            f"- If using **Cloud AI (Gemini / OpenAI / Groq)**: Click the ⚙️ Settings button above to enter your API key."
        )

    # Log reasons for verification if present
    reasons_found = re.findall(r'(?i)(?:^|\n)\s*(?:[-*•]\s*)?Reason:\s*([^\n]+)', explanation)
    if reasons_found:
        import logging
        logging.getLogger(__name__).info(f"[AI Literature Query Reasons for '{query_text}']:\n" + "\n".join(f"  - {r.strip()}" for r in reasons_found))

    # Generate followups
    words = [w for w in query_text.split() if len(w) > 3]
    top_keywords = " ".join(words[:4]) if words else query_text
    default_followups = [
        f"What are the primary criticisms of {top_keywords}?",
        f"How does {top_keywords} compare with modern alternatives?",
        f"Real-world benchmark results for {top_keywords}",
    ]
    extracted = extract_followups(explanation)

    return AIDeepDiveResponse(
        query=query_text,
        explanation=explanation,
        google_search_url=google_url,
        suggested_followups=extracted if extracted else default_followups,
        provider_used=provider,
        model_used=model or "default",
    )

@router.post("/chat", response_model=AIChatResponse)
async def chat_with_document(
    payload: AIChatRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
    x_ai_provider: Optional[str] = Header(None, alias="X-AI-Provider"),
    x_ai_key: Optional[str] = Header(None, alias="X-AI-Key"),
    x_ai_model: Optional[str] = Header(None, alias="X-AI-Model"),
    x_ollama_url: Optional[str] = Header(None, alias="X-Ollama-Url"),
):
    """
    Conversational RAG: answers questions about the current document using retrieved text chunks.
    Injects page citations so users can jump directly to the referenced page.
    """
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    # Enforce BYOK in prod for unauthenticated / guest requests
    if current_user is None and IS_PROD and not x_ai_key:
        return AIChatResponse(
            answer=(
                "⚠️ **API Key Required (BYOK in Production)**\n\n"
                "To use the AI research assistant in guest mode without logging in, please configure your own API key in AI Settings.\n\n"
                "Click **⚙️ AI Settings** in the top navigation or sidebar to enter your free Google Gemini, OpenAI, or Groq API key."
            ),
            cited_chunks=[],
            suggested_followups=[],
            provider_used="none",
            model_used="none",
        )

    default_provider = "gemini" if IS_PROD else "ollama"
    provider = x_ai_provider or default_provider
    model = x_ai_model
    ollama_url = x_ollama_url or DEFAULT_OLLAMA_URL

    doc_name = "the paper"
    cited_chunks: List[CitedChunk] = []
    context_text = ""

    if payload.document_id and current_user:
        doc = db.query(Document).filter(Document.id == payload.document_id, Document.user_id == current_user.id).first()
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found.")
        doc_name = doc.original_name

        # Ensure document is properly chunked across all pages
        ensure_document_chunked(db, doc)

        # Retrieve top relevant chunks based on mode
        if payload.mode == "define":
            top_chunks = retrieve_definition_chunks(
                db=db,
                document_id=doc.id,
                term=question,
                top_k=4,
            )
            system_prompt = (
                f"You are ResearchReader AI. Your task is to provide the AUTHORS' EXACT IN-PAPER DEFINITION for the requested concept based on \"{doc_name}\".\n"
                "Guidelines:\n"
                "1. Base your explanation strictly on how the authors explicitly define, denote, or introduce this concept on [Page X].\n"
                "2. Always cite the exact page number like [Page X].\n"
                "3. Detail the specific mathematical equation, notation, acronym, or experimental role the authors assign to it.\n"
                "4. Distinguish any specialized variation from generic definitions.\n"
                "5. At the end of your response, list 2-3 brief follow-up questions starting with 'Suggested Follow-ups:'."
            )
        else:
            top_chunks = retrieve_relevant_chunks(
                db=db,
                document_id=doc.id,
                query=question,
                top_k=5,
                current_page=payload.current_page,
            )
            system_prompt = (
                f"You are ResearchReader AI, a knowledgeable, rigorous academic research assistant for the paper: \"{doc_name}\".\n"
                "Guidelines:\n"
                "1. Base your answer on the provided paper excerpts whenever possible.\n"
                "2. Whenever you reference a fact, claim, statistic, or quote, cite the page number exactly like [Page X] (e.g. [Page 4]).\n"
                "3. Provide clean, well-structured Markdown with bold headings, lists, or formulas where helpful.\n"
                "4. If the paper excerpts do not contain the answer, say so honestly, and provide your general scientific understanding while clarifying that it is not explicitly stated in the retrieved text.\n"
                "5. At the very end of your response, list 2-3 brief follow-up questions starting with 'Suggested Follow-ups:'."
            )

        for c in top_chunks:
            cited_chunks.append(CitedChunk(
                chunk_id=c["id"],
                page_number=c["page_number"],
                chunk_index=c["chunk_index"],
                snippet=c["content"][:240] + ("..." if len(c["content"]) > 240 else ""),
                score=c["score"],
            ))

        if top_chunks:
            context_text = "Here are the most relevant excerpts from the paper:\n"
            for c in top_chunks:
                context_text += f"\n--- [Page {c['page_number']}, Chunk #{c['chunk_index']}] ---\n{c['content']}\n"


    prompt_parts = []
    if context_text:
        prompt_parts.append(context_text)

    # Append brief history if provided
    if payload.history:
        prompt_parts.append("\nRecent conversation history:")
        for msg in payload.history[-4:]:
            role = msg.get("role", "user").capitalize()
            prompt_parts.append(f"{role}: {msg.get('content', '')}")

    prompt_parts.append(f"\nUser Question: {question}")
    full_prompt = "\n".join(prompt_parts)

    try:
        raw_answer = await generate_completion(
            prompt=full_prompt,
            system_prompt=system_prompt,
            provider=provider,
            api_key=x_ai_key,
            model=model,
            ollama_url=ollama_url,
            temperature=0.25,
            max_tokens=1200,
        )
    except LLMProviderError as e:
        raw_answer = (
            f"⚠️ **Could not generate response**\n\n"
            f"{str(e)}\n\n"
            f"Please check your AI settings (gear icon) or ensure Ollama is running."
        )

    # Parse follow-ups from the response
    followups = extract_followups(raw_answer)
    if not followups:
        followups = [
            f"What are the main findings regarding {question[:30]}?",
            f"What methodology was used in this section?",
            f"What are the limitations cited by the authors?",
        ]

    # Clean up 'Suggested Follow-ups:' section from the main text if present
    clean_answer = re.split(r'(?i)\n(?:###?\s*)?Suggested Follow-?ups?:', raw_answer)[0].strip()

    return AIChatResponse(
        answer=clean_answer,
        cited_chunks=cited_chunks,
        suggested_followups=followups,
        provider_used=provider,
        model_used=model or "default",
    )

@router.post("/summary", response_model=AIChatResponse)
async def generate_paper_summary(
    payload: AISummaryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    x_ai_provider: Optional[str] = Header(None, alias="X-AI-Provider"),
    x_ai_key: Optional[str] = Header(None, alias="X-AI-Key"),
    x_ai_model: Optional[str] = Header(None, alias="X-AI-Model"),
    x_ollama_url: Optional[str] = Header(None, alias="X-Ollama-Url"),
):
    """Generates an executive overview, methodology analysis, or key takeaways of the whole paper."""
    doc = db.query(Document).filter(Document.id == payload.document_id, Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    # Ensure document is properly chunked across all pages
    ensure_document_chunked(db, doc)
    chunks = db.query(DocumentChunk).filter(DocumentChunk.document_id == doc.id).order_by(DocumentChunk.chunk_index.asc()).all()

    # Grab first 4 chunks and last 3 chunks
    selected_chunks = chunks[:4] + (chunks[-3:] if len(chunks) > 7 else [])
    context_text = "\n\n".join(f"[Page {c.page_number}]: {c.content}" for c in selected_chunks)

    default_provider = "gemini" if IS_PROD else "ollama"
    provider = x_ai_provider or default_provider
    model = x_ai_model
    ollama_url = x_ollama_url or DEFAULT_OLLAMA_URL

    system_prompt = (
        f"You are a senior research scientist. Create a structured executive summary of the paper \"{doc.original_name}\".\n"
        "Format your output in Markdown with:\n"
        "1. **Core Problem & Objective**\n"
        "2. **Key Methodological Innovation**\n"
        "3. **Primary Findings & Results** (cite [Page X])\n"
        "4. **Significance & Limitations**\n"
    )

    prompt = f"Excerpts from the paper:\n{context_text}\n\nPlease provide the executive summary."

    try:
        answer = await generate_completion(
            prompt=prompt,
            system_prompt=system_prompt,
            provider=provider,
            api_key=x_ai_key,
            model=model,
            ollama_url=ollama_url,
            temperature=0.2,
        )
    except LLMProviderError as e:
        answer = f"⚠️ Could not generate summary: {str(e)}"

    cited_chunks = [
        CitedChunk(
            chunk_id=c.id,
            page_number=c.page_number,
            chunk_index=c.chunk_index,
            snippet=c.content[:200] + "...",
            score=1.0,
        )
        for c in selected_chunks
    ]

    return AIChatResponse(
        answer=answer,
        cited_chunks=cited_chunks,
        suggested_followups=[
            "What datasets or benchmarks were used?",
            "How does this compare with state of the art?",
            "What future research directions are proposed?",
        ],
        provider_used=provider,
        model_used=model or "default",
    )
