import io
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_auth_and_user_isolation():
    # 1. Signup Alice
    alice_signup = client.post("/api/auth/signup", json={
        "email": "alice@test.com",
        "username": "Alice",
        "password": "password123"
    })
    # If already created in prior run, login
    if alice_signup.status_code == 400:
        alice_login = client.post("/api/auth/login", json={
            "email": "alice@test.com",
            "password": "password123"
        })
        assert alice_login.status_code == 200
        alice_data = alice_login.json()
    else:
        assert alice_signup.status_code == 201
        alice_data = alice_signup.json()

    alice_token = alice_data["access_token"]
    alice_headers = {"Authorization": f"Bearer {alice_token}"}
    print("[PASS] Alice signup / login")

    # 2. Duplicate email rejection
    dup_res = client.post("/api/auth/signup", json={
        "email": "alice@test.com",
        "username": "Alice Clone",
        "password": "password123"
    })
    assert dup_res.status_code == 400
    print("[PASS] Duplicate email rejected")

    # 3. Invalid credentials
    bad_login = client.post("/api/auth/login", json={
        "email": "alice@test.com",
        "password": "wrongpassword"
    })
    assert bad_login.status_code == 401
    print("[PASS] Invalid password rejected")

    # 4. Verify /api/auth/me
    me_res = client.get("/api/auth/me", headers=alice_headers)
    assert me_res.status_code == 200
    assert me_res.json()["email"] == "alice@test.com"
    print("[PASS] /api/auth/me profile verified")

    # 5. Unauthenticated request to /api/documents fails with 401
    unauth_res = client.get("/api/documents")
    assert unauth_res.status_code == 401
    print("[PASS] Unauthenticated access blocked with 401")

    # 6. Alice uploads a PDF
    minimal_pdf = (
        b"%PDF-1.4\n"
        b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n"
        b"3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\n"
        b"xref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000053 00000 n \n0000000102 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF\n"
    )
    pdf_file = io.BytesIO(minimal_pdf)
    upload_res = client.post(
        "/api/documents/upload",
        files={"file": ("alice_paper.pdf", pdf_file, "application/pdf")},
        headers=alice_headers
    )
    assert upload_res.status_code == 201
    alice_doc_id = upload_res.json()["id"]
    print(f"[PASS] Alice uploaded document ({alice_doc_id})")

    # 7. Alice adds highlight and note
    ann_res = client.post(
        f"/api/documents/{alice_doc_id}/annotations",
        json={
            "page_number": 1,
            "color": "#fef08a",
            "selected_text": "Alice Private Note",
            "rects_json": "[]",
            "comment_text": "Secret finding"
        },
        headers=alice_headers
    )
    assert ann_res.status_code == 201
    print("[PASS] Alice added private highlight")

    # 8. Signup Bob
    bob_signup = client.post("/api/auth/signup", json={
        "email": "bob@test.com",
        "username": "Bob",
        "password": "password123"
    })
    if bob_signup.status_code == 400:
        bob_login = client.post("/api/auth/login", json={
            "email": "bob@test.com",
            "password": "password123"
        })
        bob_data = bob_login.json()
    else:
        assert bob_signup.status_code == 201
        bob_data = bob_signup.json()

    bob_token = bob_data["access_token"]
    bob_headers = {"Authorization": f"Bearer {bob_token}"}
    print("[PASS] Bob signup / login")

    # 9. User Isolation: Bob cannot see Alice's document in /api/documents list
    bob_docs = client.get("/api/documents", headers=bob_headers).json()
    assert not any(d["id"] == alice_doc_id for d in bob_docs)
    print("[PASS] Isolation: Bob cannot see Alice's document in document list")

    # 10. User Isolation: Bob cannot access Alice's document by ID
    bob_get_alice_doc = client.get(f"/api/documents/{alice_doc_id}", headers=bob_headers)
    assert bob_get_alice_doc.status_code == 404
    print("[PASS] Isolation: Bob cannot access Alice's document by ID (404)")

    # 11. User Isolation: Bob cannot access Alice's annotations
    bob_get_alice_anns = client.get(f"/api/documents/{alice_doc_id}/annotations", headers=bob_headers)
    assert bob_get_alice_anns.status_code == 404
    print("[PASS] Isolation: Bob cannot access Alice's annotations (404)")

    # 12. User Isolation & Chunking: Alice can chunk her own document
    alice_chunk_res = client.post(f"/api/documents/{alice_doc_id}/chunk", headers=alice_headers)
    assert alice_chunk_res.status_code == 200
    print("[PASS] User chunking: Alice can chunk her own document")

    # 13. User Isolation & Chunking: Bob cannot chunk or view Alice's document chunks
    bob_chunk_alice = client.post(f"/api/documents/{alice_doc_id}/chunk", headers=bob_headers)
    assert bob_chunk_alice.status_code == 404
    bob_get_chunks = client.get(f"/api/documents/{alice_doc_id}/chunks", headers=bob_headers)
    assert bob_get_chunks.status_code == 404
    print("[PASS] Isolation: Bob cannot chunk or view Alice's chunks (404)")

    # 14. Admin Privilege: Bob (regular user) gets 403 on /api/admin/health
    bob_admin_res = client.get("/api/admin/health", headers=bob_headers)
    assert bob_admin_res.status_code == 403
    print("[PASS] Security: Non-admin user receives 403 Forbidden on /api/admin/health")

    # 15. Admin Privilege: Designated Admin gets 200 on /api/admin/health
    from app.database.session import SessionLocal
    from app.database.models import User
    db = SessionLocal()
    try:
        alice_db = db.query(User).filter(User.id == alice_data["user"]["id"]).first()
        alice_db.is_admin = True
        db.commit()
    finally:
        db.close()

    alice_admin_res = client.get("/api/admin/health", headers=alice_headers)
    assert alice_admin_res.status_code == 200
    print("[PASS] Security: Admin user receives 200 OK on /api/admin/health")

    print("\nALL MULTI-USER & AUTH INTEGRATION TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    test_auth_and_user_isolation()
