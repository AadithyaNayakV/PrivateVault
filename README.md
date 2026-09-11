# 🔐 PrivateVault

**Zero-knowledge, client-side encrypted file storage.**

PrivateVault is a cloud file storage system built to answer one question:

> *How can you store files on a server while making it mathematically impossible for that server — or anyone who compromises it — to read them?*

Every file is encrypted **inside the browser** before it ever leaves the user's machine. The backend, the database, and the disk only ever see ciphertext. Even a fully compromised server, a leaked database dump, or a malicious admin gets nothing but unreadable bytes.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Tech Stack](#tech-stack)
- [Security Model](#security-model)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Features](#features)
- [API Overview](#api-overview)
- [Project Structure](#project-structure)
- [Verifying the Security Claims Yourself](#verifying-the-security-claims-yourself)
- [Known Trade-offs & Future Work](#known-trade-offs--future-work)
- [Testing](#testing)

---

## How It Works

```
Your File
   │
   │  1. Browser reads the file
   ▼
AES-256-GCM Encryption (in your browser, via Web Crypto API)
   │
   │  2. Key derived from YOUR encryption password (PBKDF2, 250,000 iterations)
   │     — this password is never sent anywhere
   ▼
Ciphertext
   │
   │  3. HTTPS transfer
   ▼
FastAPI Backend
   │
   │  4. Stores ciphertext under a random UUID — never the real filename
   ▼
Local Disk + PostgreSQL (metadata only)
```

To get the file back, the process runs in reverse: the server returns ciphertext, and your browser — using your encryption password — derives the key again and decrypts locally. The server is never involved in, or capable of, decryption.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React (Vite) |
| Client-side crypto | Web Crypto API — AES-256-GCM, PBKDF2-SHA256 |
| Backend | FastAPI + SQLAlchemy |
| Auth | Argon2id password hashing + JWT |
| Database | PostgreSQL (local) |
| File storage | Local disk (`backend/storage_data/`) — ciphertext only |
| Rate limiting | `slowapi` |

---

## Security Model

PrivateVault separates **two passwords** that most systems conflate:

| | Account Password | Encryption Password |
|---|---|---|
| Purpose | Logging in | Deriving your AES file key |
| Sent to the server? | Yes, over HTTPS, for login only | **Never, under any circumstances** |
| Stored server-side? | As an Argon2id hash | Never, in any form |

This split is what makes the "zero-knowledge" claim real rather than marketing. The server can verify *who you are* without ever learning *what your files contain* or *how to decrypt them*.

### Defense in depth

| Layer | What it protects against |
|---|---|
| **Client-side AES-256-GCM encryption** | A compromised server, database, or disk — none of them can read file contents |
| **HTTPS/TLS** | Network eavesdropping in transit |
| **JWT authentication** | Impersonation — proves who's making each request |
| **Server-side ownership checks** | One user reading another user's files |
| **GCM authentication tag** | Silent tampering or corruption of stored ciphertext |
| **Argon2id password hashing** | Password cracking if the database leaks |
| **Rate limiting** | Brute-force login/upload abuse |
| **Audit logging** | Visibility into login attempts, uploads, downloads, and denied access |

Even the **filename** is encrypted client-side before upload — the database never stores a readable name, just ciphertext alongside its own IV.

---

## Architecture

```
┌─────────────────────────────┐
│        React Frontend       │
│  Register / Login           │
│  File picker + uploader     │
│  AES-256-GCM encrypt/decrypt│
│  (all crypto happens here)  │
└──────────────┬───────────────┘
               │ HTTPS
┌──────────────▼───────────────┐
│        FastAPI Backend       │
│  JWT auth                    │
│  Ownership checks            │
│  Rate limiting                │
│  Audit logging                │
└──────────┬─────────┬─────────┘
           │         │
 ┌─────────▼──┐  ┌───▼──────────────┐
 │ PostgreSQL │  │  Local Disk       │
 │ users      │  │  storage_data/    │
 │ files      │  │  <uuid>.bin       │
 │ audit_logs │  │  (ciphertext only)│
 └────────────┘  └───────────────────┘
```

---

## Quick Start

### 1. PostgreSQL

Create a database named `privatevault` (via pgAdmin or `psql`). Note your host, port, username, and password.

### 2. Backend

```bash
cd backend
python -m venv venv
source venv/Scripts/activate      # Windows Git Bash; use venv\Scripts\activate.bat for cmd, source venv/bin/activate for macOS/Linux
pip install -r requirements.txt

cp .env.example .env
# edit .env: DATABASE_URL, JWT_SECRET, STORAGE_DIR, MAX_UPLOAD_MB

python create_tables.py           # creates users / files / audit_logs tables
uvicorn app.main:app --reload --port 8000
```

Swagger UI (interactive API docs): **http://localhost:8000/docs**

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

App: **http://localhost:5173**

---

## Features

- **Register / Login** — Argon2id-hashed account passwords, JWT-based auth (`GET /auth/me`, stateless logout).
- **A separate encryption password** — never transmitted, used to derive a 256-bit AES key client-side via PBKDF2-SHA256 (250,000 iterations). See `frontend/src/crypto/`.
- **Client-side upload encryption** — the browser encrypts with AES-256-GCM and uploads ciphertext plus its IV/salt/KDF metadata. The backend writes it to disk under a server-generated UUID and never trusts a client-supplied path or filename.
- **Encrypted filenames** — the original filename is encrypted client-side under the same derived key (its own fresh IV) before upload. The file list shows `🔒 Encrypted file #id` until you enter your encryption password, which reveals the real name.
- **Owner-scoped access** — every file route re-checks `owner_id` against the JWT-derived user, returning `403` on any mismatch, including for file IDs that don't exist or belong to someone else.
- **Tamper detection** — AES-GCM's built-in authentication tag means a single flipped byte in a stored `.bin` file causes decryption to fail loudly instead of returning silently-corrupted data.
- **Rate limiting** — `/auth/login` and `/files/upload` are throttled via `slowapi`.
- **Audit logging** — every register, login (success/failure), upload, download, delete, and denied-access event is recorded (`audit_logs` table, viewable via `GET /api/audit-logs`, self-only).
- **Automated tests** — pytest coverage for the cross-user `403` authorization boundary (`backend/tests/`).

---

## API Overview

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Create an account |
| `POST` | `/api/auth/login` | Log in, receive a JWT |
| `GET` | `/api/auth/me` | Current user profile |
| `POST` | `/api/files/upload` | Upload encrypted file + metadata |
| `GET` | `/api/files` | List your own files |
| `GET` | `/api/files/{id}/metadata` | Get IV/salt/KDF info for decryption |
| `GET` | `/api/files/{id}/download` | Download ciphertext (owner only) |
| `DELETE` | `/api/files/{id}` | Delete a file (owner only) |
| `GET` | `/api/audit-logs` | View your own audit trail |

Full request/response shapes: [`docs/04_API_SPEC.md`](docs/04_API_SPEC.md).

---

## Project Structure

```
privatevault/
├── backend/
│   ├── app/
│   │   ├── main.py, config.py, database.py, models.py, schemas.py
│   │   ├── security.py, deps.py, rate_limit.py
│   │   ├── routers/          # auth.py, files.py
│   │   └── storage/          # local_storage.py
│   ├── storage_data/         # ciphertext blobs (gitignored)
│   ├── tests/                # pytest suite
│   ├── create_tables.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/               # fetch client
│   │   ├── crypto/             # deriveKey.js, encryptFile.js, decryptFile.js
│   │   ├── pages/              # Login, Register, Vault
│   │   └── components/         # FileUploader, FileList, etc.
├── docs/                      # full design spec (start here for details)
└── README.md
```

---

## Verifying the Security Claims Yourself

Don't just take the README's word for it — check the raw evidence:

1. **Ciphertext on disk is unreadable.** Upload a file, then open `backend/storage_data/<uuid>.bin` in a text editor. It's binary garbage — no readable filename, no readable content.
2. **The database holds no plaintext.** In pgAdmin: `SELECT * FROM files;` — you'll see a UUID storage key, base64 IV/salt, and an encrypted `encrypted_name` column. No real filenames, no file contents.
3. **Cross-user access is blocked.** Log in as a second user, then hit `GET /api/files/{id}/download` for the first user's file ID directly via `/docs`. Expect `403 Forbidden`.
4. **Tampering is detected.** Flip a byte in a stored `.bin` file on disk, then try to download and decrypt it in the UI. Expect a decryption error — never silently wrong output.

---

## Known Trade-offs & Future Work

*(see [`docs/05_ENCRYPTION_DESIGN.md`](docs/05_ENCRYPTION_DESIGN.md) §5, §7 for the full discussion)*

- **Salt strategy:** a fresh salt/key is generated **per file**, not derived from a single master account salt — stronger than the baseline design, though still short of full per-file key-wrapping (documented as "Option B" future work).
- **JWT storage:** the token is kept in `localStorage` on the frontend for simplicity. This is a documented XSS-exposure trade-off versus an in-memory-only token, acceptable for a prototype but worth hardening in a production version.
- **No password recovery:** if you forget your encryption password, your files are **not recoverable** — the server never knew it and cannot reset it. This is inherent to the zero-knowledge design and is surfaced directly in the UI.
- **Future enhancements:** per-file key wrapping, a recovery-key mechanism, migrating local disk storage to S3/MinIO, refresh-token rotation.

---

## Testing

```bash
cd backend
pytest
```

Covers, at minimum, the authorization boundary: a logged-in user attempting to access another user's file must always receive `403`.

---

Full design documentation — including the original security rationale, database schema, encryption code walkthrough, and phase-by-phase build plan — lives in [`docs/`](docs/).