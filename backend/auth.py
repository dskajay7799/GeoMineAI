import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, Header
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import User

SECRET_KEY = os.environ.get(
    "GEOMINE_SECRET_KEY",
    "change-this-secret-key-in-production",
)
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 12

ROLES = ["Admin", "Editor", "Viewer"]


# ============================================================
# PASSWORD HASHING (PBKDF2 - no extra native dependency needed)
# ============================================================

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), bytes.fromhex(salt), 100_000
    )
    return f"{salt}${digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt, digest_hex = stored_hash.split("$")
    except ValueError:
        return False

    expected_digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), bytes.fromhex(salt), 100_000
    )
    return hmac.compare_digest(expected_digest.hex(), digest_hex)


# ============================================================
# JWT TOKENS
# ============================================================

def create_access_token(user: User) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS)

    payload = {
        "sub": str(user.id),
        "username": user.username,
        "role": user.role,
        "exp": expire,
    }

    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None


# ============================================================
# DEPENDENCIES
# ============================================================

def get_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = authorization.split(" ", 1)[1]
    payload = decode_access_token(token)

    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    user = db.query(User).filter(User.id == int(payload["sub"])).first()

    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Account not found or disabled")

    return user


def require_roles(*allowed_roles: str):
    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail="You do not have permission to perform this action",
            )
        return current_user

    return dependency