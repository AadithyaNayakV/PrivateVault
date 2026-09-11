# PrivateVault — Build Plan for Claude Code

Work through these phases **in order**. Each phase should be a working, testable checkpoint before moving to the next — don't jump ahead. Reference the other docs in this folder (`01`–`05`) for the exact spec of each piece.

## Phase 0 — Scaffolding
- [ ] Create `backend/` (FastAPI project) and `frontend/` (Vite + React project) folders per `02_ARCHITECTURE.md`.
- [ ] Backend: set up `requirements.txt`, virtualenv, `.env` (from `.env.example`), `app/main.py` with a `/health` route.
- [ ] Confirm connection to the local Postgres DB created in pgAdmin (`DATABASE_URL` in `.env`).
- [ ] Frontend: `npm create vite@latest frontend -- --template react`, install `react-router-dom`.
- [ ] Confirm frontend can hit backend `/health` (watch for CORS — add `CORSMiddleware` allowing `http://localhost:5173`).

## Phase 1 — Database Layer
- [ ] Implement SQLAlchemy models from `03_DATABASE_SCHEMA.md` (`User`, `File`, `AuditLog`).
- [ ] Set up Alembic (or `Base.metadata.create_all()` for speed) and create the tables in Postgres.
- [ ] Verify tables appear correctly in pgAdmin.

## Phase 2 — Authentication
- [ ] Implement `POST /api/auth/register` (hash password with Argon2id/bcrypt, insert user).
- [ ] Implement `POST /api/auth/login` (verify hash, issue JWT).
- [ ] Implement `get_current_user` dependency (JWT verification).
- [ ] Implement `GET /api/auth/me`.
- [ ] Add rate limiting to `/auth/login` via `slowapi`.
- [ ] Add audit logging for register/login success/failure.
- [ ] Test all of the above via `/docs` (FastAPI's auto Swagger UI) before touching the frontend.

## Phase 3 — Frontend Auth UI
- [ ] `Register.jsx` and `Login.jsx` pages.
- [ ] `api/client.js` fetch wrapper that stores JWT (in memory / React context — avoid `localStorage` for the token if you want to discuss XSS trade-offs in your report; `localStorage` is acceptable for a student prototype if you note the trade-off).
- [ ] Route protection: redirect to `/login` if no valid token.
- [ ] End-to-end test: register → login → see empty Vault page.

## Phase 4 — Client-Side Encryption Module
- [ ] Implement `crypto/deriveKey.js`, `crypto/encryptFile.js`, `crypto/decryptFile.js` exactly per `05_ENCRYPTION_DESIGN.md`.
- [ ] Write a small standalone test page/script: encrypt a file, immediately decrypt it in-browser, confirm byte-for-byte match — **before** wiring up the network calls. This isolates crypto bugs from network/backend bugs.

## Phase 5 — Upload Flow
- [ ] Backend: `POST /api/files/upload` per `04_API_SPEC.md` — UUID storage key, disk write, DB row, audit log, size limit, rate limit.
- [ ] Frontend: `FileUploader.jsx` — file picker → prompt for encryption password → `encryptFile()` → `POST` multipart with ciphertext + iv + salt + metadata.
- [ ] Test: upload a file, confirm a `.bin` appears in `storage_data/`, confirm it is NOT human-readable (`cat`/`less` it — it should be garbage bytes), confirm the DB row is correct in pgAdmin.

## Phase 6 — List & Download Flow
- [ ] Backend: `GET /api/files` (owner-filtered), `GET /api/files/{id}/metadata`, `GET /api/files/{id}/download` with ownership check.
- [ ] Frontend: `FileList.jsx` shows the current user's files; clicking one prompts for the encryption password, fetches ciphertext + metadata, decrypts, triggers browser download.
- [ ] Test: full round trip — upload a file, log out, log back in, download it, confirm it matches the original byte-for-byte.

## Phase 7 — Authorization Hardening
- [ ] Manually test: log in as User A, try to `GET /api/files/{id}/download` for a file owned by User B (use `/docs` with a raw ID) → confirm `403`.
- [ ] Confirm the backend never reads `owner_id`/`user_id` from any request body — grep the codebase to check.
- [ ] Add a test case (pytest) asserting cross-user access returns 403.

## Phase 8 — Integrity Verification Demo
- [ ] Manually flip a byte in a stored `.bin` file (simulate tampering/corruption).
- [ ] Confirm that decrypting it in the browser throws an error (AES-GCM auth tag mismatch) rather than silently returning garbage — this is your integrity-protection proof for the report.

## Phase 9 — Rate Limiting & Audit Log Review
- [ ] Confirm repeated failed logins get rate-limited (429 after N attempts).
- [ ] Add a simple `GET /api/audit-logs` (admin-only or self-only) to visually inspect the log in your demo.

## Phase 10 — Polish
- [ ] Loading states, error toasts, empty states in the UI.
- [ ] File size/type display, delete button (`DELETE /api/files/{id}`).
- [ ] `.gitignore`: `storage_data/`, `.env`, `node_modules/`, `__pycache__/`.
- [ ] README with setup instructions (see `07_SETUP_GUIDE.md`).

## Phase 11 — Report/Demo Prep
- [ ] Write up the security model using the terminology from `01_PROJECT_OVERVIEW.md` §5 (plaintext/ciphertext/encryption-at-rest/in-transit/authentication/authorization/integrity).
- [ ] Prepare a live demo script: register → login → upload → show ciphertext is unreadable on disk → show DB has no plaintext → download → decrypt → cross-user 403 demo → tampered-file demo.
- [ ] List "future enhancements" (per-file keys / Option B from `05_ENCRYPTION_DESIGN.md` §5, recovery keys, S3/MinIO backend, refresh tokens) to show awareness of the fuller design without over-scoping the prototype.

---

**Tip for working with Claude Code:** paste one phase at a time as your prompt (e.g. "Implement Phase 2 from 06_BUILD_PLAN.md, referencing 04_API_SPEC.md for the exact routes") rather than asking for the whole app at once — it'll produce more correct, reviewable code per step.
