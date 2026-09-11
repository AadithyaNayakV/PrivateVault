# PrivateVault — Database Schema (PostgreSQL)

Run these in pgAdmin's Query Tool against your `privatevault` database, or let Alembic generate them from the SQLAlchemy models.

## 1. `users` table

```sql
CREATE TABLE users (
    id            BIGSERIAL PRIMARY KEY,
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

- `password_hash` is the Argon2id/bcrypt hash of the **account password** only.
- The encryption password is NEVER stored anywhere, in any form.

## 2. `files` table

```sql
CREATE TABLE files (
    id                        BIGSERIAL PRIMARY KEY,
    owner_id                  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    storage_key               TEXT NOT NULL UNIQUE,   -- UUID filename on disk, e.g. 7e2c1a4d....bin
    encrypted_name            TEXT,                    -- original filename, itself encrypted client-side (optional but recommended)
    mime_type                 TEXT,
    original_size_bytes       BIGINT NOT NULL,
    encrypted_size_bytes      BIGINT NOT NULL,
    iv                        TEXT NOT NULL,            -- base64, 12 bytes
    salt                      TEXT NOT NULL,            -- base64, 16 bytes, used for PBKDF2
    kdf_iterations             INTEGER NOT NULL DEFAULT 250000,
    encryption_version        SMALLINT NOT NULL DEFAULT 1,
    sha256_ciphertext         TEXT,                     -- optional extra integrity check, hex digest
    created_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_files_owner_id ON files(owner_id);
```

Notes:
- `storage_key` is what maps to the actual file in `backend/storage_data/`. It must be server-generated (`uuid4()`), never accepted from the client.
- `iv` and `salt` are not secret — they must be stored so the browser can re-derive the key and decrypt later. Storing them next to the ciphertext (in Postgres) is standard practice for AES-GCM.
- `kdf_iterations` lets you tune/upgrade PBKDF2 cost over time without breaking old files.
- `encryption_version` gives you a migration path if you later switch KDF or move to per-file wrapped keys (see `05_ENCRYPTION_DESIGN.md` §5).

## 3. `audit_logs` table

```sql
CREATE TABLE audit_logs (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT REFERENCES users(id) ON DELETE SET NULL,
    event_type  VARCHAR(50) NOT NULL,   -- e.g. 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'UPLOAD', 'DOWNLOAD', 'DOWNLOAD_DENIED', 'DELETE'
    file_id     BIGINT REFERENCES files(id) ON DELETE SET NULL,
    ip_address  VARCHAR(64),
    detail      TEXT,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);
```

## 4. Entity Relationship Summary

```
users (1) ──< (many) files
users (1) ──< (many) audit_logs
files (1) ──< (many) audit_logs   [optional file_id link]
```

## 5. What Must NEVER Appear in the Database

- Plaintext file contents
- Original unencrypted filenames (unless you deliberately accept that trade-off for a simpler prototype — document it if so)
- The encryption password, in any form
- The raw AES file key

## 6. SQLAlchemy Model Sketch (for `backend/app/models.py`)

```python
from sqlalchemy import Column, BigInteger, String, Text, TIMESTAMP, ForeignKey, SmallInteger, Integer
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(BigInteger, primary_key=True)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(Text, nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now())
    files = relationship("File", back_populates="owner", cascade="all, delete")

class File(Base):
    __tablename__ = "files"
    id = Column(BigInteger, primary_key=True)
    owner_id = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    storage_key = Column(Text, unique=True, nullable=False)
    encrypted_name = Column(Text)
    mime_type = Column(Text)
    original_size_bytes = Column(BigInteger, nullable=False)
    encrypted_size_bytes = Column(BigInteger, nullable=False)
    iv = Column(Text, nullable=False)
    salt = Column(Text, nullable=False)
    kdf_iterations = Column(Integer, default=250000)
    encryption_version = Column(SmallInteger, default=1)
    sha256_ciphertext = Column(Text)
    created_at = Column(TIMESTAMP, server_default=func.now())
    owner = relationship("User", back_populates="files")

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(BigInteger, primary_key=True)
    user_id = Column(BigInteger, ForeignKey("users.id", ondelete="SET NULL"))
    event_type = Column(String(50), nullable=False)
    file_id = Column(BigInteger, ForeignKey("files.id", ondelete="SET NULL"))
    ip_address = Column(String(64))
    detail = Column(Text)
    created_at = Column(TIMESTAMP, server_default=func.now())
```
