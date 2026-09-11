# PrivateVault — Architecture & Tech Stack

## 1. Repository Layout

```
privatevault/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app entrypoint
│   │   ├── config.py            # env vars, settings
│   │   ├── database.py          # SQLAlchemy engine/session
│   │   ├── models.py            # SQLAlchemy models (User, File, AuditLog)
│   │   ├── schemas.py           # Pydantic request/response schemas
│   │   ├── security.py          # password hashing, JWT creation/verification
│   │   ├── deps.py               # FastAPI dependencies (get_current_user, get_db)
│   │   ├── rate_limit.py        # slowapi limiter setup
│   │   ├── routers/
│   │   │   ├── auth.py          # /api/auth/*
│   │   │   └── files.py         # /api/files/*
│   │   └── storage/
│   │       └── local_storage.py # save/read ciphertext blobs on disk
│   ├── storage_data/            # actual ciphertext .bin files live here (gitignored)
│   ├── alembic/                 # DB migrations
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── api/
│   │   │   └── client.js        # fetch wrapper, attaches JWT
│   │   ├── crypto/
│   │   │   ├── deriveKey.js     # PBKDF2 → AES-256 key
│   │   │   ├── encryptFile.js   # AES-256-GCM encrypt
│   │   │   └── decryptFile.js   # AES-256-GCM decrypt
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   └── Vault.jsx        # file list + upload + download
│   │   └── components/
│   │       ├── FileUploader.jsx
│   │       ├── FileList.jsx
│   │       └── EncryptionPasswordModal.jsx
│   ├── package.json
│   └── vite.config.js
└── docs/                        # (these files)
```

## 2. Backend Stack (Python)

| Concern | Library |
|---|---|
| Web framework | `fastapi` |
| ASGI server | `uvicorn` |
| ORM | `sqlalchemy` (2.x) |
| Migrations | `alembic` |
| Postgres driver | `psycopg2-binary` (sync) or `asyncpg` (async) |
| Password hashing | `passlib[bcrypt]` or `argon2-cffi` |
| JWT | `python-jose[cryptography]` |
| File uploads | native `fastapi.UploadFile` |
| Rate limiting | `slowapi` |
| Validation | Pydantic v2 (built into FastAPI) |
| CORS | `fastapi.middleware.cors.CORSMiddleware` |
| Env config | `python-dotenv` / `pydantic-settings` |

`backend/requirements.txt`:
```
fastapi
uvicorn[standard]
sqlalchemy
alembic
psycopg2-binary
passlib[bcrypt]
argon2-cffi
python-jose[cryptography]
slowapi
python-multipart
pydantic-settings
python-dotenv
```

## 3. Frontend Stack

| Concern | Choice |
|---|---|
| Framework | React 18 + Vite |
| Encryption | Native **Web Crypto API** (`crypto.subtle`) — no external crypto library needed |
| HTTP client | native `fetch` |
| Routing | `react-router-dom` |
| State | React state/context (no Redux needed for this scope) |
| Styling | Your choice — Tailwind recommended for speed |

**Important:** Do not use a third-party JS crypto library unless you have a specific reason — the browser's built-in Web Crypto API is standards-compliant, audited, and sufficient for AES-256-GCM + PBKDF2.

## 4. Local Postgres Setup (pgAdmin)

Since you're storing everything locally:

1. In pgAdmin, create a database, e.g. `privatevault`.
2. Note your connection details: host (`localhost`), port (`5432` default), username, password, database name.
3. Backend `.env`:
   ```
   DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/privatevault
   JWT_SECRET=replace-with-a-long-random-string
   JWT_EXPIRE_MINUTES=60
   STORAGE_DIR=./storage_data
   MAX_UPLOAD_MB=50
   ```
4. Run Alembic migrations (or `Base.metadata.create_all()` for the prototype) to create tables — see `03_DATABASE_SCHEMA.md`.

## 5. Local File Storage Design

Since there's no S3/MinIO in this build:

- `backend/storage_data/` holds one file per upload, named by a **random UUID**, not the original filename (e.g. `storage_data/7e2c1a4d-....bin`).
- The mapping from UUID → real (encrypted) filename/owner lives only in Postgres.
- Add `storage_data/` to `.gitignore` — never commit ciphertext blobs to source control.
- The backend must generate this UUID server-side; never trust a client-supplied filename/path (path traversal risk).

## 6. Request Flow Summary

**Upload:**
```
React: pick file → derive key (PBKDF2) → generate IV → AES-256-GCM encrypt
     → POST /api/files/upload (multipart: ciphertext blob + iv + salt + metadata, JWT in header)
FastAPI: verify JWT → validate size/rate limit → generate UUID → write ciphertext to disk
     → insert row into files table → audit log → 201 response
```

**Download:**
```
React: GET /api/files/{id}/download (JWT in header)
FastAPI: verify JWT → look up file → check file.owner_id == current_user.id → stream ciphertext
React: receives ciphertext + (fetched) iv/salt → prompts for encryption password
     → derive key → AES-256-GCM decrypt → trigger browser download of plaintext
```

## 7. Why FastAPI Fits This Project

- Built-in Pydantic validation maps cleanly to the "never trust client input" rule (Section 18 of the overview: ownership must come from the JWT, not the request body).
- Native async support pairs well with streaming file uploads/downloads without buffering huge files in memory.
- Automatic OpenAPI docs at `/docs` are handy for testing upload/download endpoints during development.
