from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator


# ---- Auth ----

class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10)

    @field_validator("password")
    @classmethod
    def password_has_number(cls, v: str) -> str:
        if not any(c.isdigit() for c in v):
            raise ValueError("password must contain at least one number")
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: str

    model_config = {"from_attributes": True}


class UserMeOut(BaseModel):
    id: int
    email: str
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


# ---- Files ----

class FileOut(BaseModel):
    id: int
    encrypted_name: str | None
    mime_type: str | None
    original_size_bytes: int
    created_at: datetime

    model_config = {"from_attributes": True}


class FileUploadOut(BaseModel):
    id: int
    storage_key: str
    created_at: datetime

    model_config = {"from_attributes": True}


class FileMetadataOut(BaseModel):
    iv: str
    salt: str
    kdf_iterations: int
    mime_type: str | None
    encrypted_name: str | None

    model_config = {"from_attributes": True}


# ---- Audit ----

class AuditLogOut(BaseModel):
    id: int
    event_type: str
    file_id: int | None
    ip_address: str | None
    detail: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
