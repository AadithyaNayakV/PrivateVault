# PrivateVault — API Specification (FastAPI)

Base URL (dev): `http://localhost:8000/api`

Auth: JWT bearer token in `Authorization: Bearer <token>` header, issued at login.

---

## Auth Routes

### `POST /api/auth/register`

Request:
```json
{
  "email": "student@example.com",
  "password": "AccountPassword123!"
}
```

Response `201`:
```json
{ "id": 1, "email": "student@example.com" }
```

Errors: `409` if email already exists, `422` on validation failure.

Backend steps:
1. Validate email format + password strength (min length, etc.) via Pydantic.
2. Check email uniqueness.
3. Hash password with Argon2id/bcrypt.
4. Insert user row.
5. Audit log `REGISTER`.

---

### `POST /api/auth/login`

Request:
```json
{ "email": "student@example.com", "password": "AccountPassword123!" }
```

Response `200`:
```json
{ "access_token": "eyJhbGciOi...", "token_type": "bearer", "expires_in": 3600 }
```

Errors: `401` on bad credentials (generic message — don't reveal whether email exists).

Backend steps:
1. Look up user by email.
2. Verify password hash.
3. Rate-limit this endpoint (e.g. `slowapi`, 5 attempts / minute / IP).
4. On success, issue JWT with `sub=user_id`, `exp`.
5. Audit log `LOGIN_SUCCESS` or `LOGIN_FAILED`.

---

### `GET /api/auth/me`

Requires auth. Returns the current user's profile (no password hash).

```json
{ "id": 1, "email": "student@example.com", "created_at": "2026-09-01T10:00:00Z" }
```

---

### `POST /api/auth/logout`

If using JWT (stateless), this can simply be a client-side token discard. If you implement server-side session/refresh tokens, invalidate them here.

---

## File Routes

All routes below require `Authorization: Bearer <token>`.

### `POST /api/files/upload`

`multipart/form-data`:

| Field | Type | Notes |
|---|---|---|
| `file` | binary | the AES-256-GCM ciphertext blob |
| `iv` | string (base64) | 12-byte IV used for this file |
| `salt` | string (base64) | 16-byte salt used for PBKDF2 |
| `kdf_iterations` | int | iterations used |
| `encrypted_name` | string | original filename, itself encrypted client-side (or plain string if you accept that trade-off) |
| `mime_type` | string | e.g. `application/pdf` |
| `original_size_bytes` | int | size of plaintext, for display purposes |

Response `201`:
```json
{
  "id": 104,
  "storage_key": "7e2c1a4d-9f3e-4a11-9c2b-....bin",
  "created_at": "2026-09-11T09:00:00Z"
}
```

Backend steps:
1. Authenticate via JWT → get `current_user.id`.
2. Enforce `MAX_UPLOAD_MB` limit.
3. Rate-limit uploads per user.
4. Generate a server-side UUID as `storage_key` — **never** trust a client-supplied path/filename for disk storage.
5. Stream the file to `storage_data/<storage_key>.bin`.
6. Insert `files` row with `owner_id = current_user.id`.
7. Audit log `UPLOAD`.

---

### `GET /api/files`

Response `200`:
```json
[
  {
    "id": 104,
    "encrypted_name": "…",
    "mime_type": "application/pdf",
    "original_size_bytes": 245760,
    "created_at": "2026-09-11T09:00:00Z"
  }
]
```

Backend steps:
1. Authenticate.
2. `SELECT * FROM files WHERE owner_id = current_user.id` — **always** filter server-side, never rely on the frontend to only display "your" files.

---

### `GET /api/files/{id}/download`

Response `200`: raw ciphertext bytes, plus headers or a companion JSON with `iv`, `salt`, `kdf_iterations`, `encrypted_name` (or fetch metadata separately via `/metadata` below).

Backend steps:
1. Authenticate.
2. Look up file by `id`.
3. **Critical check:** `if file.owner_id != current_user.id: raise HTTPException(403)`.
4. Stream ciphertext bytes from disk.
5. Audit log `DOWNLOAD` on success, `DOWNLOAD_DENIED` on ownership failure.

---

### `GET /api/files/{id}/metadata`

Returns `iv`, `salt`, `kdf_iterations`, `mime_type`, `encrypted_name` — used by the frontend to re-derive the key and decrypt after fetching ciphertext. Same ownership check as above.

---

### `DELETE /api/files/{id}`

Backend steps:
1. Authenticate.
2. Check ownership (403 if not owner).
3. Delete disk file + DB row (or soft-delete if you want an undo window).
4. Audit log `DELETE`.

---

## Security Rules That Apply To Every Route

1. **Never trust an `owner_id` or `user_id` field in a request body.** Always derive identity from the verified JWT.
2. **Always re-check ownership server-side** on every file operation, even if the frontend already filtered the list.
3. **Generic error messages** on auth failures — don't leak whether an email exists.
4. **Rate limit** `/auth/login` and `/files/upload` at minimum.
5. **Validate file size** before writing to disk (reject oversized uploads early).
6. **Log security events** (`LOGIN_FAILED`, `DOWNLOAD_DENIED`, etc.) — these are your evidence of the authorization layer working, useful for your assignment writeup/demo.

## Example FastAPI Dependency for Auth (sketch)

```python
from fastapi import Depends, HTTPException, Header
from jose import jwt, JWTError

def get_current_user(authorization: str = Header(...), db=Depends(get_db)):
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing token")
    token = authorization.removeprefix("Bearer ")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except JWTError:
        raise HTTPException(401, "Invalid token")
    user = db.query(User).get(int(payload["sub"]))
    if not user:
        raise HTTPException(401, "User not found")
    return user
```
