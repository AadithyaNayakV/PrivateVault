"""Integration tests against a running Postgres DB (per create_tables.py).

Requires the API's own DB to be reachable (same DATABASE_URL as .env) and the
tables to already exist. Each run registers fresh random-email users so it is
safe to re-run repeatedly without manual cleanup.
"""
import io
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _register_and_login(email: str, password: str = "Password123!") -> str:
    resp = client.post("/api/auth/register", json={"email": email, "password": password})
    assert resp.status_code == 201, resp.text

    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_cross_user_download_is_forbidden():
    email_a = f"user-a-{uuid.uuid4().hex}@example.com"
    email_b = f"user-b-{uuid.uuid4().hex}@example.com"

    token_a = _register_and_login(email_a)
    token_b = _register_and_login(email_b)

    upload_resp = client.post(
        "/api/files/upload",
        headers=_auth_headers(token_a),
        files={"file": ("test.bin", io.BytesIO(b"fake-ciphertext-bytes"), "application/octet-stream")},
        data={
            "iv": "aXZpdml2aXZpdml2",
            "salt": "c2FsdHNhbHRzYWx0c2FsdA==",
            "kdf_iterations": "250000",
            "encrypted_name": "test.txt",
            "mime_type": "text/plain",
            "original_size_bytes": "21",
        },
    )
    assert upload_resp.status_code == 201, upload_resp.text
    file_id = upload_resp.json()["id"]

    # User B must not be able to download or view metadata for User A's file.
    resp = client.get(f"/api/files/{file_id}/download", headers=_auth_headers(token_b))
    assert resp.status_code == 403

    resp = client.get(f"/api/files/{file_id}/metadata", headers=_auth_headers(token_b))
    assert resp.status_code == 403

    resp = client.delete(f"/api/files/{file_id}", headers=_auth_headers(token_b))
    assert resp.status_code == 403

    # The owner can still access it.
    resp = client.get(f"/api/files/{file_id}/download", headers=_auth_headers(token_a))
    assert resp.status_code == 200


def test_unauthenticated_requests_are_rejected():
    resp = client.get("/api/files")
    assert resp.status_code == 401
