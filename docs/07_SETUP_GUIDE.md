# PrivateVault — Local Setup Guide

## 1. Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL running locally, with pgAdmin

## 2. PostgreSQL (via pgAdmin)

1. Open pgAdmin, connect to your local server.
2. Right-click **Databases** → **Create** → **Database** → name it `privatevault`.
3. Note the connection details (host `localhost`, port `5432` unless you changed it, your postgres username/password).

## 3. Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# edit .env: set DATABASE_URL, JWT_SECRET, STORAGE_DIR, MAX_UPLOAD_MB

mkdir -p storage_data

# create tables (prototype approach)
python -c "from app.database import Base, engine; from app import models; Base.metadata.create_all(engine)"

uvicorn app.main:app --reload --port 8000
```

Visit `http://localhost:8000/docs` to see the interactive Swagger UI and test endpoints directly.

## 4. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:5173`.

## 5. Environment Variables Reference (`backend/.env`)

```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/privatevault
JWT_SECRET=replace-with-a-long-random-string
JWT_EXPIRE_MINUTES=60
STORAGE_DIR=./storage_data
MAX_UPLOAD_MB=50
CORS_ORIGIN=http://localhost:5173
```

Generate a strong `JWT_SECRET` with:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

## 6. Verifying Everything Works

1. Register a user via the frontend (or `/docs`).
2. Log in.
3. Upload a small test file.
4. Check pgAdmin: `SELECT * FROM files;` — confirm no plaintext filename/content, just metadata.
5. Check `backend/storage_data/` — open the `.bin` file in a text editor, confirm it's unreadable binary garbage.
6. Download the file from the UI, confirm it opens correctly and matches the original.

## 7. Common Issues

| Symptom | Likely cause |
|---|---|
| CORS error in browser console | `CORS_ORIGIN` in `.env` doesn't match Vite's dev URL, or `CORSMiddleware` not configured |
| `psycopg2` connection refused | Postgres not running, or wrong port/password in `DATABASE_URL` |
| Decryption fails after correct password | IV/salt not round-tripped correctly (check base64 encode/decode symmetry) |
| 401 on every request after login | JWT not being attached in `Authorization` header from the frontend fetch wrapper |
| Upload 413/500 on larger files | `MAX_UPLOAD_MB` too low, or FastAPI/uvicorn body size limits need adjusting |
