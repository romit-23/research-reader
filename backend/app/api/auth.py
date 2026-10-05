from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database.session import get_db
from app.database.models import User
from app.schemas.schemas import UserCreate, UserLogin, UserResponse, TokenResponse
from app.core.security import get_password_hash, verify_password, create_access_token
from app.core.deps import get_current_user
from app.core.config import ADMIN_EMAILS

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: UserCreate, db: Session = Depends(get_db)):
    email_clean = payload.email.strip().lower()

    # Check if user already exists
    existing = db.query(User).filter(User.email == email_clean).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists."
        )

    # First user or explicit admin email gets admin privileges
    is_admin = False
    if ADMIN_EMAILS and email_clean in ADMIN_EMAILS:
        is_admin = True
    elif db.query(User).count() == 0:
        is_admin = True

    hashed_pw = get_password_hash(payload.password)
    user = User(
        email=email_clean,
        username=payload.username.strip(),
        hashed_password=hashed_pw,
        is_admin=is_admin,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": user.id, "email": user.email})
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user)
    )

@router.post("/login", response_model=TokenResponse)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    email_clean = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email_clean).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )

    # Sync admin status if email is in ADMIN_EMAILS
    if ADMIN_EMAILS and email_clean in ADMIN_EMAILS and not user.is_admin:
        user.is_admin = True
        db.commit()
        db.refresh(user)

    token = create_access_token({"sub": user.id, "email": user.email})
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user)
    )

@router.get("/me", response_model=UserResponse)
def get_me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if ADMIN_EMAILS and current_user.email.lower() in ADMIN_EMAILS and not current_user.is_admin:
        current_user.is_admin = True
        db.commit()
        db.refresh(current_user)
    return current_user
