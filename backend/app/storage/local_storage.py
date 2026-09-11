import os
import uuid
from pathlib import Path

from fastapi import UploadFile

from ..config import settings

STORAGE_DIR = Path(settings.storage_dir).resolve()
STORAGE_DIR.mkdir(parents=True, exist_ok=True)


def _path_for_key(storage_key: str) -> Path:
    path = (STORAGE_DIR / storage_key).resolve()
    if STORAGE_DIR not in path.parents and path != STORAGE_DIR:
        raise ValueError("invalid storage key")
    return path


async def save_ciphertext(upload: UploadFile, max_bytes: int) -> tuple[str, int]:
    """Streams an uploaded ciphertext blob to disk under a fresh server-generated UUID.

    Returns (storage_key, size_bytes). Raises ValueError if the size exceeds max_bytes.
    """
    storage_key = f"{uuid.uuid4()}.bin"
    dest = _path_for_key(storage_key)

    size = 0
    chunk_size = 1024 * 1024
    try:
        with open(dest, "wb") as out:
            while True:
                chunk = await upload.read(chunk_size)
                if not chunk:
                    break
                size += len(chunk)
                if size > max_bytes:
                    raise ValueError("file too large")
                out.write(chunk)
    except Exception:
        if dest.exists():
            os.remove(dest)
        raise

    return storage_key, size


def read_ciphertext(storage_key: str) -> bytes:
    path = _path_for_key(storage_key)
    with open(path, "rb") as f:
        return f.read()


def delete_ciphertext(storage_key: str) -> None:
    path = _path_for_key(storage_key)
    if path.exists():
        os.remove(path)
