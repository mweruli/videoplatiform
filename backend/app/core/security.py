"""JWT access-token issuance/verification, plus password hashing.

Originally deliberately minimal (JWT-only) to unblock Sprint 2's RBAC
dependencies (app/api/deps.py) ahead of real auth existing — see
docs/decisions.md's Sprint 2 note. Sprint 2's follow-up auth work adds
password hashing here too, since it's the same "auth crypto primitives"
concern and every caller (registration, login, password reset) needs it.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return _pwd_context.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
    try:
        return _pwd_context.verify(password, password_hash)
    except ValueError:
        # Malformed/unknown hash scheme — treat as non-matching rather than 500.
        return False


def generate_otp_code(length: int = 6) -> str:
    """Cryptographically-random numeric OTP, e.g. '048213'. Zero-padded so it
    always has exactly `length` digits (a leading zero is valid)."""
    upper_bound = 10**length
    return str(secrets.randbelow(upper_bound)).zfill(length)


def hash_otp_code(code: str) -> str:
    """OTP codes are short-lived, single-use, numeric-only, and rate-limited
    server-side, so an HMAC-SHA256 keyed by the JWT secret is sufficient
    (and much cheaper than bcrypt for a value with far less entropy than a
    user-chosen password) rather than reusing the password hasher."""
    return hmac.new(
        settings.JWT_SECRET_KEY.encode("utf-8"), code.encode("utf-8"), hashlib.sha256
    ).hexdigest()


def verify_otp_code(code: str, code_hash: str) -> bool:
    return hmac.compare_digest(hash_otp_code(code), code_hash)


def create_access_token(subject: str, extra_claims: dict[str, Any] | None = None) -> str:
    expire = datetime.now(UTC) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode: dict[str, Any] = {"sub": subject, "exp": expire, "type": "access"}
    if extra_claims:
        to_encode.update(extra_claims)
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any] | None:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return None
    if payload.get("type") != "access":
        return None
    return payload
