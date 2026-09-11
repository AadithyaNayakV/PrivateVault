# PrivateVault

Zero-knowledge, client-side encrypted file storage. Full spec lives in [`docs/`](docs/); this is the implementation.

- **Frontend:** React (Vite) + Web Crypto API (AES-256-GCM, PBKDF2)
- **Backend:** FastAPI + SQLAlchemy
- **Database:** PostgreSQL (local)
- **File storage:** local disk (`backend/storage_data/`), ciphertext only

The server and database never see plaintext, the encryption password, or the raw AES key. Files are encrypted in the browser before upload and decrypted in the browser after download.

## Quick start

### 1. Postgres

Create a database named `privatevault` (via pgAdmin or `psql`). Note your host/port/user/password.

### 2. Backend

```bash
cd backend
python -m venv venv
source venv/Scripts/activate      # Windows Git Bash; use venv\Scripts\activate.bat for cmd
pip install -r requirements.txt

cp .env.example .env
# edit .env: DATABASE_URL, JWT_SECRET, etc.

python create_tables.py           # creates users/files/audit_logs tables
uvicorn app.main:app --reload --port 8000
```

Swagger UI: http://localhost:8000/docs

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

App: http://localhost:5173

## What's implemented

- Register/login with Argon2id-hashed account passwords, JWT auth (`GET /auth/me`, stateless logout).
- A **separate** encryption password, never sent to the server, used to derive an AES-256 key client-side via PBKDF2-SHA256 (250,000 iterations) — see `frontend/src/crypto/`.
- Upload: browser encrypts with AES-256-GCM, uploads ciphertext + iv/salt/kdf metadata; backend writes it to disk under a server-generated UUID and never trusts a client-supplied path.
- Owner-scoped list/download/delete; every file route re-checks `owner_id` against the JWT-derived user, returning 403 on mismatch (including for nonexistent file ids).
- GCM's auth tag catches tampering/corruption — a flipped byte in the stored `.bin` file makes decryption throw instead of returning garbage.
- Rate limiting on `/auth/login` and `/files/upload` (`slowapi`).
- Audit log (`audit_logs` table + `GET /api/audit-logs`, self-only) for register/login/upload/download/delete/denied events.
- pytest coverage for the cross-user-403 authorization boundary (`backend/tests/`).

## Known trade-offs (see `docs/05_ENCRYPTION_DESIGN.md` §5, §7)

- **Option A salt strategy**: a fresh salt/key is generated **per file**, not derived from one master account salt — slightly stronger than the doc's minimum, still not full per-file key-wrapping (Option B, listed as future work).
- `encrypted_name` currently stores the **plain** original filename (explicitly allowed as a trade-off in the API spec) rather than a client-encrypted name.
- JWT is stored in `localStorage` on the frontend for simplicity — a documented XSS-exposure trade-off vs. an in-memory-only token.
- If the encryption password is forgotten, the file is **not recoverable** — this is inherent to the zero-knowledge design and is surfaced in the UI.

## Verifying it yourself

1. Upload a file, then open `backend/storage_data/<uuid>.bin` in a text editor — it's unreadable binary.
2. `SELECT * FROM files;` in pgAdmin — no plaintext filename/content, just metadata + base64 iv/salt.
3. Log in as a second user and try `GET /api/files/{id}/download` for the first user's file id via `/docs` — expect `403`.
4. Flip a byte in a `.bin` file on disk, then try to download+decrypt it in the UI — expect a decryption error, not garbage output.
