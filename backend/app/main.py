from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.core.config import CORS_ORIGINS
from app.database.session import Base, engine
from app.api import documents, annotations, notes, ai, auth, admin

# Ensure database tables exist
Base.metadata.create_all(bind=engine)

# Auto-migrate: check if user_id exists in documents table (SQLite backward compatibility)
if engine.dialect.name == "sqlite":
    with engine.connect() as conn:
        cols = [r[1] for r in conn.execute(text("PRAGMA table_info(documents)")).fetchall()]
        if cols and "user_id" not in cols:
            conn.execute(text("ALTER TABLE documents ADD COLUMN user_id TEXT REFERENCES users(id)"))
            conn.commit()

app = FastAPI(
    title="Research Reader API",
    description="Backend API for PDF research paper reader, annotations, notes, and AI deep dives.",
    version="1.0.0",
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS + ["*"],  # Allow development and production origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(annotations.router)
app.include_router(notes.router)
app.include_router(ai.router)
app.include_router(admin.router)

@app.get("/")
def root():
    return {
        "message": "Research Reader API is running",
        "docs": "/docs",
        "status": "healthy"
    }

@app.get("/health")
def health():
    return {"status": "ok"}
