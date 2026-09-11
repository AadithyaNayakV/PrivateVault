# PrivateVault — Project Overview

## Zero-Knowledge, Client-Side Encrypted File Storage

**Stack for this build:**
- Frontend: React (Vite) + Web Crypto API
- Backend: Python + FastAPI
- Database: PostgreSQL (local, managed via pgAdmin)
- File storage: Local disk (`storage/` folder on the backend server)

---

## 1. Goal

The storage server must only ever see **ciphertext**. It never receives, stores, or is able to derive:

- The original plaintext file
- The file encryption key
- The user's encryption password

Files are encrypted **inside the browser** before upload. The FastAPI backend stores the encrypted bytes on local disk and the corresponding metadata in Postgres. On download, the backend returns ciphertext, and the browser decrypts it locally.

```
Plaintext File → (Browser: AES-256-GCM) → Ciphertext → HTTPS → FastAPI → Local Disk
```

## 2. Problem Statement

Normal cloud storage receives the plaintext file after TLS termination — meaning the server operator, a compromised server, or an attacker with disk access can read every file. PrivateVault removes that trust requirement by encrypting client-side, so even a fully compromised backend/disk/DB only yields unreadable ciphertext.

## 3. Objectives

1. Secure account registration & login (separate from file encryption).
2. Upload files through a React UI.
3. Encrypt files in-browser with AES-256-GCM before upload.
4. Transfer encrypted files over HTTPS (or localhost during dev).
5. Store only ciphertext on the FastAPI server's local disk.
6. Enforce per-user authorization — users can never access another user's files.
7. Allow the owning user to download and decrypt their own files.
8. Detect tampering/corruption via AES-GCM's built-in authentication tag.
9. Log security-relevant events (login attempts, uploads, downloads, failures).
10. Rate-limit sensitive endpoints (login, upload).
11. Clearly demonstrate, in the code and docs: encryption at rest vs. in transit, authentication vs. authorization, and integrity protection.

## 4. Defense-in-Depth Layers

| Layer | Purpose |
|---|---|
| 1. Client-side encryption (AES-256-GCM) | Server/DB compromise ≠ file compromise |
| 2. HTTPS/TLS | Protects data in transit |
| 3. Authentication (JWT or session) | Verifies who the user is |
| 4. Authorization (ownership checks) | Verifies what the user can access |
| 5. Integrity (GCM auth tag) | Detects tampering/corruption |
| 6. Secure session handling | Protects login state |
| 7. Rate limiting + audit logging | Detects/limits abuse |

## 5. Key Terminology

- **Plaintext** — the original file (e.g. `resume.pdf`).
- **Ciphertext** — the AES-256-GCM encrypted bytes stored on disk.
- **Encryption key** — 256-bit AES key, derived client-side, never sent to the server.
- **Account password** — used only for login (hashed server-side with Argon2id/bcrypt).
- **Encryption password** — used only in-browser to derive the AES key via PBKDF2/Argon2id. **Never transmitted.**
- **Salt** — random value mixed into key derivation; stored in Postgres (not secret).
- **IV/Nonce** — random 12-byte value required by AES-GCM per encryption; stored alongside file metadata (not secret).

## 6. High-Level Architecture

```
┌───────────────────────────┐
│        React Frontend     │
│  Login / Register UI      │
│  File picker + drag/drop  │
│  Encryption module (WebCrypto)
│  Decryption module        │
└─────────────┬──────────────┘
              │ HTTPS (JSON + binary blobs)
┌─────────────▼──────────────┐
│       FastAPI Backend      │
│  /auth  (register/login)   │
│  /files (upload/list/dl)   │
│  Auth middleware (JWT)     │
│  Ownership checks          │
│  Rate limiting             │
│  Audit logging             │
└─────────┬─────────┬────────┘
          │         │
 ┌────────▼──┐  ┌───▼─────────────┐
 │ PostgreSQL │  │  Local Disk     │
 │ users      │  │  storage/*.bin  │
 │ files      │  │  (ciphertext    │
 │ audit_logs │  │   only)         │
 └────────────┘  └─────────────────┘
```

## 7. What's Different From the Original Node.js Version

This doc set adapts the original Node/Express/MinIO design to your requested stack:

| Original | This build |
|---|---|
| Node.js + Express | Python + FastAPI |
| `bcrypt`/`argon2` npm libs | `passlib[bcrypt]` or `argon2-cffi` |
| `express-session` | JWT (via `python-jose`) or FastAPI session middleware |
| `multer` | FastAPI's native `UploadFile` |
| `express-rate-limit` | `slowapi` |
| S3/MinIO | Local disk folder, path stored in Postgres |
| Sequelize/raw SQL | SQLAlchemy + Alembic (or raw `psycopg2`/`asyncpg`) |

See `02_ARCHITECTURE.md` for the full stack, `03_DATABASE_SCHEMA.md` for Postgres tables, `04_API_SPEC.md` for endpoints, `05_ENCRYPTION_DESIGN.md` for the crypto flow, and `06_BUILD_PLAN.md` for a phase-by-phase build order to hand to Claude Code.
