from fastapi import APIRouter, Depends, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from .. import schemas
from ..audit import log_event
from ..config import settings
from ..deps import get_client_ip, get_current_user, get_db
from ..models import File, User
from ..rate_limit import limiter
from ..storage.local_storage import delete_ciphertext, read_ciphertext, save_ciphertext

router = APIRouter(prefix="/api/files", tags=["files"])


@router.post("/upload", response_model=schemas.FileUploadOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def upload_file(
    request: Request,
    file: UploadFile,
    iv: str = Form(...),
    salt: str = Form(...),
    kdf_iterations: int = Form(...),
    encrypted_name: str = Form(""),
    mime_type: str = Form(""),
    original_size_bytes: int = Form(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        storage_key, encrypted_size = await save_ciphertext(file, settings.max_upload_bytes)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds max upload size of {settings.max_upload_mb}MB",
        )

    db_file = File(
        owner_id=current_user.id,
        storage_key=storage_key,
        encrypted_name=encrypted_name,
        mime_type=mime_type,
        original_size_bytes=original_size_bytes,
        encrypted_size_bytes=encrypted_size,
        iv=iv,
        salt=salt,
        kdf_iterations=kdf_iterations,
    )
    db.add(db_file)
    db.commit()
    db.refresh(db_file)

    log_event(
        db,
        "UPLOAD",
        user_id=current_user.id,
        file_id=db_file.id,
        ip_address=get_client_ip(request),
    )
    return db_file


@router.get("", response_model=list[schemas.FileOut])
def list_files(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(File).filter(File.owner_id == current_user.id).order_by(File.created_at.desc()).all()


def _get_owned_file_or_403(db: Session, file_id: int, current_user: User, request: Request) -> File:
    db_file = db.get(File, file_id)
    if not db_file or db_file.owner_id != current_user.id:
        # file_id must reference an existing row (or be NULL) — never log the
        # raw path param, since it may not correspond to any file at all.
        log_event(
            db,
            "DOWNLOAD_DENIED",
            user_id=current_user.id,
            file_id=db_file.id if db_file else None,
            ip_address=get_client_ip(request),
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to access this file")
    return db_file


@router.get("/{file_id}/metadata", response_model=schemas.FileMetadataOut)
def get_file_metadata(
    file_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db_file = _get_owned_file_or_403(db, file_id, current_user, request)
    return db_file


@router.get("/{file_id}/download")
def download_file(
    file_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db_file = _get_owned_file_or_403(db, file_id, current_user, request)
    ciphertext = read_ciphertext(db_file.storage_key)

    log_event(
        db,
        "DOWNLOAD",
        user_id=current_user.id,
        file_id=db_file.id,
        ip_address=get_client_ip(request),
    )
    return Response(content=ciphertext, media_type="application/octet-stream")


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_file(
    file_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db_file = db.get(File, file_id)
    if not db_file or db_file.owner_id != current_user.id:
        log_event(
            db,
            "DOWNLOAD_DENIED",
            user_id=current_user.id,
            file_id=db_file.id if db_file else None,
            ip_address=get_client_ip(request),
            detail="delete attempt",
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to access this file")

    log_event(
        db,
        "DELETE",
        user_id=current_user.id,
        file_id=file_id,
        ip_address=get_client_ip(request),
    )

    delete_ciphertext(db_file.storage_key)
    db.delete(db_file)
    db.commit()
    return None
