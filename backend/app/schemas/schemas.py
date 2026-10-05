from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, EmailStr

# --- User & Auth Schemas ---
class UserBase(BaseModel):
    email: str
    username: str

class UserCreate(BaseModel):
    email: str
    username: str
    password: str = Field(min_length=6)

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    username: str
    is_admin: bool = False
    created_at: datetime

    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

# --- Document Schemas ---
class DocumentBase(BaseModel):
    original_name: str
    file_size: int
    page_count: int

class DocumentProgressUpdate(BaseModel):
    last_page: int = Field(ge=1)
    progress_percent: Optional[float] = Field(default=None, ge=0.0, le=100.0)

class DocumentResponse(BaseModel):
    id: str
    user_id: Optional[str] = None
    original_name: str
    file_size: int
    page_count: int
    last_page: int
    progress_percent: float
    chunk_count: int = 0
    is_chunked: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# --- Chunk Schemas ---
class DocumentChunkResponse(BaseModel):
    id: str
    document_id: str
    chunk_index: int
    page_number: int
    content: str
    token_count: int
    created_at: datetime

    class Config:
        from_attributes = True

class ChunkSummaryResponse(BaseModel):
    document_id: str
    document_name: str
    pages_processed: int
    chunks_generated: int
    total_tokens_estimated: int

# --- Annotation Schemas ---
class AnnotationCreate(BaseModel):
    page_number: int = Field(ge=1)
    color: str = "#fef08a"
    selected_text: str
    rects_json: str  # JSON-encoded array of {x, y, width, height}
    comment_text: Optional[str] = None

class AnnotationUpdate(BaseModel):
    color: Optional[str] = None
    comment_text: Optional[str] = None

class AnnotationResponse(BaseModel):
    id: str
    document_id: str
    page_number: int
    color: str
    selected_text: str
    rects_json: str
    comment_text: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

# --- Note Schemas ---
class DocumentNoteUpdate(BaseModel):
    content: str

class DocumentNoteResponse(BaseModel):
    id: str
    document_id: str
    content: str
    updated_at: datetime

    class Config:
        from_attributes = True

# --- AI & Deep Dive Schemas ---
class AIDeepDiveRequest(BaseModel):
    selected_text: str
    document_id: Optional[str] = None
    current_page: Optional[int] = None
    context: Optional[str] = None
    mode: str = "explain"

class AIDeepDiveResponse(BaseModel):
    query: str
    explanation: str
    google_search_url: str
    suggested_followups: List[str] = []
    provider_used: Optional[str] = None
    model_used: Optional[str] = None

class CitedChunk(BaseModel):
    chunk_id: str
    page_number: int
    chunk_index: int
    snippet: str
    score: float = 0.0

class AIChatRequest(BaseModel):
    document_id: Optional[str] = None
    question: str
    current_page: Optional[int] = None
    history: Optional[List[Dict[str, str]]] = []
    mode: str = "qa"  # qa, summarize, critique

class AIChatResponse(BaseModel):
    answer: str
    cited_chunks: List[CitedChunk] = []
    suggested_followups: List[str] = []
    provider_used: str = "ollama"
    model_used: str = "default"

class AISummaryRequest(BaseModel):
    document_id: str
    mode: str = "executive"  # executive, methodology, takeaways

class AITestConnectionRequest(BaseModel):
    provider: str
    api_key: Optional[str] = None
    model: Optional[str] = None
    ollama_url: Optional[str] = None

class AITestConnectionResponse(BaseModel):
    success: bool
    provider: str
    message: str
    models: Optional[List[str]] = None
    key_source: Optional[str] = None

class AIProvidersResponse(BaseModel):
    environment: str = "prod"  # 'prod' (default) or 'local'
    ollama_available: bool
    ollama_models: List[str] = []
    supported_cloud_providers: List[str] = ["gemini", "openai", "anthropic", "groq", "deepseek"]
    default_provider: str = "gemini"
    default_model: str = "gemini-2.5-flash"
    server_configured_providers: List[str] = []
    show_ai_reasons: bool = False

class AIFetchModelsRequest(BaseModel):
    provider: str
    api_key: Optional[str] = None
    ollama_url: Optional[str] = None

class ModelInfoItem(BaseModel):
    id: str
    name: str

class AIFetchModelsResponse(BaseModel):
    success: bool
    provider: str
    models: List[ModelInfoItem] = []
    message: Optional[str] = None

