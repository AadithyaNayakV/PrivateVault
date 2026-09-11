from sqlalchemy import (
    BigInteger,
    Column,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Text,
    TIMESTAMP,
)
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
