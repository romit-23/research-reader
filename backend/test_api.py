import io
from fastapi.testclient import TestClient
from app.main import app
from app.database.models import User, DocumentChunk
from app.database.session import SessionLocal

client = TestClient(app)

def get_auth_headers():
    signup_res = client.post("/api/auth/signup", json={
        "email": "tester@test.com",
        "username": "Tester",
        "password": "password123"
    })
    if signup_res.status_code == 400:
        login_res = client.post("/api/auth/login", json={
            "email": "tester@test.com",
            "password": "password123"
        })
        token = login_res.json()["access_token"]
        user_id = login_res.json()["user"]["id"]
    else:
        token = signup_res.json()["access_token"]
        user_id = signup_res.json()["user"]["id"]
    return {"Authorization": f"Bearer {token}"}, user_id

def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    print("[PASS] Health check")

def test_ai_providers():
    res = client.get("/api/ai/providers")
    assert res.status_code == 200
    data = res.json()
    assert "supported_cloud_providers" in data
    assert "gemini" in data["supported_cloud_providers"]
    assert "openai" in data["supported_cloud_providers"]
    assert "anthropic" in data["supported_cloud_providers"]
    assert "groq" in data["supported_cloud_providers"]
    assert "deepseek" in data["supported_cloud_providers"]
    print(f"[PASS] AI Providers (Ollama available: {data['ollama_available']}, models: {data['ollama_models']})")

def test_ai_test_connection():
    res = client.post("/api/ai/test-connection", json={
        "provider": "ollama",
        "ollama_url": "http://localhost:11434"
    })
    assert res.status_code == 200
    data = res.json()
    assert "success" in data
    print(f"[PASS] AI Test Connection (Ollama: {data['success']}, message: {data['message']})")

def test_ai_environment_and_api_keys():
    # 1. Verify default environment is prod
    prov_res = client.get("/api/ai/providers")
    assert prov_res.status_code == 200
    prov_data = prov_res.json()
    assert prov_data["environment"] == "prod"
    assert prov_data["default_provider"] in ("gemini", "openai", "anthropic", "groq", "deepseek")
    print(f"[PASS] Environment default is prod (default provider: {prov_data['default_provider']})")

    # 2. Test DeepSeek API key path without key -> prompts for key
    no_key_res = client.post("/api/ai/test-connection", json={
        "provider": "deepseek",
    })
    assert no_key_res.status_code == 200
    no_key_data = no_key_res.json()
    assert no_key_data["success"] is False
    assert "required" in no_key_data["message"].lower()
    print(f"[PASS] DeepSeek without API key properly prompts for key: {no_key_data['message']}")

    # 3. Test DeepSeek API key path with a test key -> proves the API keys path executes
    test_key_res = client.post("/api/ai/test-connection", json={
        "provider": "deepseek",
        "api_key": "sk-test-fake-key-12345"
    })
    assert test_key_res.status_code == 200
    test_key_data = test_key_res.json()
    assert test_key_data["provider"] == "deepseek"
    print(f"[PASS] DeepSeek API keys path executed successfully: {test_key_data['message']}")

    # 4. Test Gemini API key path with a test key
    gemini_key_res = client.post("/api/ai/test-connection", json={
        "provider": "gemini",
        "api_key": "AIzaSyFakeKeyTest12345"
    })
    assert gemini_key_res.status_code == 200
    gemini_key_data = gemini_key_res.json()
    assert gemini_key_data["provider"] == "gemini"
    print(f"[PASS] Gemini API keys path executed successfully: {gemini_key_data['message']}")

    # 5. Test fetch-models endpoint returns modern presets when unauthenticated
    models_res = client.post("/api/ai/fetch-models", json={"provider": "gemini"})
    assert models_res.status_code == 200
    models_data = models_res.json()
    assert models_data["success"] is True
    assert len(models_data["models"]) >= 4
    assert any(m["id"] == "gemini-2.5-flash" for m in models_data["models"])
    print(f"[PASS] AI Fetch-Models endpoint returned {len(models_data['models'])} models with gemini-2.5-flash present")


def test_pdf_upload_and_annotations():
    headers, user_id = get_auth_headers()

    # Construct a minimal valid PDF byte sequence
    minimal_pdf = (
        b"%PDF-1.4\n"
        b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n"
        b"3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\n"
        b"xref\n"
        b"0 4\n"
        b"0000000000 65535 f \n"
        b"0000000053 00000 n \n"
        b"0000000102 00000 n \n"
        b"0000000180 00000 n \n"
        b"trailer<</Size 4/Root 1 0 R>>\n"
        b"startxref\n"
        b"250\n"
        b"%%EOF\n"
    )

    pdf_file = io.BytesIO(minimal_pdf)
    files = {"file": ("attention_paper.pdf", pdf_file, "application/pdf")}
    upload_res = client.post("/api/documents/upload", files=files, headers=headers)
    assert upload_res.status_code == 201
    doc_data = upload_res.json()
    doc_id = doc_data["id"]
    assert doc_data["original_name"] == "attention_paper.pdf"
    assert doc_data["page_count"] >= 1
    print(f"[PASS] Upload document (id: {doc_id})")

    # List documents
    list_res = client.get("/api/documents", headers=headers)
    assert list_res.status_code == 200
    assert any(d["id"] == doc_id for d in list_res.json())
    print("[PASS] List documents")

    # Seed test chunks representing scientific paper content with definitions
    db = SessionLocal()
    try:
        c1 = DocumentChunk(
            document_id=doc_id,
            chunk_index=0,
            page_number=1,
            content="In this paper, we define Scaled Dot-Product Attention as Attention(Q, K, V) = softmax(QK^T / sqrt(d_k))V. "
                    "The queries and keys have dimension d_k, and values have dimension d_v.",
            token_count=35,
        )
        c2 = DocumentChunk(
            document_id=doc_id,
            chunk_index=1,
            page_number=2,
            content="Multi-Head Attention allows the model to jointly attend to information from different representation subspaces. "
                    "We denote the number of parallel attention heads as h = 8.",
            token_count=30,
        )
        db.add_all([c1, c2])
        db.commit()
    finally:
        db.close()

    # Test AI Deep Dive in 'explain' mode
    explain_res = client.post(
        "/api/ai/deep-dive",
        json={
            "selected_text": "Scaled Dot-Product Attention",
            "mode": "explain",
            "document_id": doc_id,
            "current_page": 1,
        },
        headers=headers,
    )
    assert explain_res.status_code == 200
    explain_data = explain_res.json()
    assert "explanation" in explain_data
    assert len(explain_data["explanation"]) > 20
    print(f"[PASS] AI Deep Dive (explain mode): generated {len(explain_data['explanation'])} chars")

    # Test AI Deep Dive in 'define' mode (USP: in-paper definitions)
    define_res = client.post(
        "/api/ai/deep-dive",
        json={
            "selected_text": "Scaled Dot-Product Attention",
            "mode": "define",
            "document_id": doc_id,
            "current_page": 1,
        },
        headers=headers,
    )
    assert define_res.status_code == 200
    define_data = define_res.json()
    assert "explanation" in define_data
    print(f"[PASS] AI Deep Dive (in-paper 'define' mode): generated {len(define_data['explanation'])} chars")

    # Test AI Chat (RAG Q&A with citations)
    chat_res = client.post(
        "/api/ai/chat",
        json={
            "document_id": doc_id,
            "current_page": 1,
            "question": "How is Scaled Dot-Product Attention defined in this paper?",
            "mode": "qa",
        },
        headers=headers,
    )
    assert chat_res.status_code == 200
    chat_data = chat_res.json()
    assert "answer" in chat_data
    assert len(chat_data["answer"]) > 10
    assert "cited_chunks" in chat_data
    print(f"[PASS] AI Chat RAG: answer generated with {len(chat_data['cited_chunks'])} citations")

    # Test AI Summary
    summary_res = client.post(
        "/api/ai/summary",
        json={
            "document_id": doc_id,
            "mode": "executive",
        },
        headers=headers,
    )
    assert summary_res.status_code == 200
    summary_data = summary_res.json()
    assert "answer" in summary_data
    print(f"[PASS] AI Document Summary generated ({len(summary_data['answer'])} chars)")

    # Create Annotation
    ann_payload = {
        "page_number": 1,
        "color": "#fef08a",
        "selected_text": "Transformer architecture with self-attention",
        "rects_json": '[{"x":0.1,"y":0.2,"width":0.6,"height":0.03}]',
        "comment_text": "Crucial model design detail",
    }
    ann_res = client.post(f"/api/documents/{doc_id}/annotations", json=ann_payload, headers=headers)
    assert ann_res.status_code == 201
    ann_data = ann_res.json()
    ann_id = ann_data["id"]
    assert ann_data["comment_text"] == "Crucial model design detail"
    print(f"[PASS] Create annotation (id: {ann_id})")

    # Fetch Annotations
    get_anns_res = client.get(f"/api/documents/{doc_id}/annotations", headers=headers)
    assert get_anns_res.status_code == 200
    assert len(get_anns_res.json()) >= 1
    print("[PASS] Fetch annotations")

    # Update Notes
    notes_payload = {
        "content": "# Key Takeaways\n- Self-attention replaces recurrence.\n- Scaled Dot-Product Attention formula."
    }
    put_notes_res = client.put(f"/api/documents/{doc_id}/notes", json=notes_payload, headers=headers)
    assert put_notes_res.status_code == 200
    assert put_notes_res.json()["content"] == notes_payload["content"]
    print("[PASS] Update markdown notes")

    # Update Progress
    prog_res = client.patch(f"/api/documents/{doc_id}/progress", json={"last_page": 1, "progress_percent": 100.0}, headers=headers)
    assert prog_res.status_code == 200
    assert prog_res.json()["progress_percent"] == 100.0
    print("[PASS] Update reading progress")

    # Cleanup annotation
    del_ann_res = client.delete(f"/api/annotations/{ann_id}", headers=headers)
    assert del_ann_res.status_code == 204
    print("[PASS] Delete annotation")

def test_admin_and_rag():
    headers, user_id = get_auth_headers()

    # Ensure tester is initially non-admin to verify 403 Forbidden
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.id == user_id).first()
        u.is_admin = False
        db.commit()
    finally:
        db.close()

    forbidden_res = client.get("/api/admin/health", headers=headers)
    assert forbidden_res.status_code == 403
    print("[PASS] Security: Non-admin access to /api/admin/health blocked with 403 Forbidden")

    # Now promote tester to admin
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.id == user_id).first()
        u.is_admin = True
        db.commit()
    finally:
        db.close()

    # 1. Admin Health
    health_res = client.get("/api/admin/health", headers=headers)
    assert health_res.status_code == 200
    data = health_res.json()
    assert data["status"] == "healthy"
    assert data["database_connected"] is True
    print(f"[PASS] Admin Health check (latency: {data['latency_ms']}ms)")

    # 2. Table Explorer
    table_res = client.get("/api/admin/tables/users", headers=headers)
    assert table_res.status_code == 200
    assert len(table_res.json()["rows"]) >= 1
    print("[PASS] Admin Table Explorer (users table)")

    # 3. RAG Documents
    rag_docs_res = client.get("/api/admin/rag/documents", headers=headers)
    assert rag_docs_res.status_code == 200
    docs = rag_docs_res.json()
    assert len(docs) >= 1
    doc_id = docs[0]["id"]
    print(f"[PASS] Admin RAG documents list ({len(docs)} documents)")

    # 4. User-Level Fetch Document Chunks
    user_chunks_res = client.get(f"/api/documents/{doc_id}/chunks", headers=headers)
    assert user_chunks_res.status_code == 200
    chunks = user_chunks_res.json()
    assert len(chunks) >= 1
    print(f"[PASS] User-Level Document chunks retrieval ({len(chunks)} chunks retrieved)")

    # 5. User-Level Document RAG Search
    user_search_res = client.post(f"/api/documents/{doc_id}/rag-search", json={"query": "Scaled Dot-Product Attention"}, headers=headers)
    assert user_search_res.status_code == 200
    search_data = user_search_res.json()
    assert len(search_data["results"]) >= 1
    print(f"[PASS] User-Level Document RAG search (top matches: {len(search_data['results'])})")

if __name__ == "__main__":
    test_health()
    test_ai_providers()
    test_ai_test_connection()
    test_ai_environment_and_api_keys()
    test_pdf_upload_and_annotations()
    test_admin_and_rag()
    print("\nALL BACKEND API TESTS PASSED SUCCESSFULLY!")
