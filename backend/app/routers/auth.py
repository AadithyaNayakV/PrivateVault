from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import schemas
from ..audit import log_event
from ..database import Base, engine
from ..deps import get_client_ip, get_current_user, get_db
from ..models import User
from ..rate_limit import limiter
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=schemas.UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: schemas.UserRegister, request: Request, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(email=payload.email, password_hash=hash_password(payload.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    db.refresh(user)

    log_event(db, "REGISTER", user_id=user.id, ip_address=get_client_ip(request))
    return user


@router.post("/login", response_model=schemas.TokenOut)
@limiter.limit("5/minute")
def login(payload: schemas.UserLogin, request: Request, db: Session = Depends(get_db)):
    generic_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
    )

    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        log_event(
            db,
            "LOGIN_FAILED",
            user_id=user.id if user else None,
            ip_address=get_client_ip(request),
            detail=f"email={payload.email}",
        )
        raise generic_error

    token, expires_in = create_access_token(user.id)
    log_event(db, "LOGIN_SUCCESS", user_id=user.id, ip_address=get_client_ip(request))
    return schemas.TokenOut(access_token=token, expires_in=expires_in)


@router.get("/me", response_model=schemas.UserMeOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(current_user: User = Depends(get_current_user)):
    # Stateless JWT: nothing to invalidate server-side. Client discards the token.
    return None
