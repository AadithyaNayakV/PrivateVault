from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import schemas
from ..deps import get_current_user, get_db
from ..models import AuditLog, User

router = APIRouter(prefix="/api", tags=["audit"])


@router.get("/audit-logs", response_model=list[schemas.AuditLogOut])
def list_my_audit_logs(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return (
        db.query(AuditLog)
        .filter(AuditLog.user_id == current_user.id)
        .order_by(AuditLog.created_at.desc())
        .limit(200)
        .all()
    )
