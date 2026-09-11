from sqlalchemy.orm import Session

from .models import AuditLog


def log_event(
    db: Session,
    event_type: str,
    user_id: int | None = None,
    file_id: int | None = None,
    ip_address: str | None = None,
    detail: str | None = None,
) -> None:
    entry = AuditLog(
        user_id=user_id,
        event_type=event_type,
        file_id=file_id,
        ip_address=ip_address,
        detail=detail,
    )
    db.add(entry)
    db.commit()
