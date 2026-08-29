"""Real registration / OTP verification / login / password reset.

Replaces reliance on app/api/v1/endpoints/auth_dev.py's DEBUG-only stub for
everything except quick manual testing of *other* endpoints (see that
module's docstring — it stays, DEBUG-gated, until the team is done using it).

Login method decision (see docs/decisions.md for the full write-up): password
is the primary login credential. OTP is used to *prove contact ownership* at
registration (and to authorize a password reset) but is not, today, an
alternate way to log in day-to-day — that's a reasonable Phase 1b addition
once a real SMS provider with acceptable deliverability/cost is in place.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.security import (
    create_access_token,
    hash_password,
    verify_password,
)
from app.db.session import get_db
from app.models.otp import OtpChannel, OtpPurpose
from app.models.user import User
from app.schemas.auth import (
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    OtpDebugInfo,
    OtpRequestRequest,
    OtpRequestResponse,
    OtpVerifyRequest,
    OtpVerifyResponse,
    RegisterRequest,
    RegisterResponse,
    ResetPasswordRequest,
    TokenResponse,
    UserRead,
)
from app.services.otp_service import (
    OTP_TTL_MINUTES,
    OtpInvalidOrExpired,
    OtpRateLimited,
    request_otp,
    verify_otp,
)

router = APIRouter()


def _find_user_by_identity(db: Session, *, email: str | None, phone: str | None) -> User | None:
    user = None
    if email:
        user = db.scalar(select(User).where(User.email == email))
    if user is None and phone:
        user = db.scalar(select(User).where(User.phone == phone))
    return user


def _channel_and_destination(*, email: str | None, phone: str | None) -> tuple[OtpChannel, str]:
    """OtpRequestRequest/OtpVerifyRequest/etc. already reject "both provided"
    at the schema layer, so for those this just picks whichever one is set.

    RegisterRequest is different: it allows both email AND phone on one
    account (there's no "exactly one" constraint there), so this also has to
    handle the both-present case — and naively preferring phone (the
    Kenya-market default) breaks registration for real users whenever SMS
    isn't actually configured for delivery yet, since a "sent" code that
    never reaches anyone is a dead end with no way to recover in the UI. See
    docs/decisions.md for the incident this came from.

    When both are present, prefer whichever channel has a real (non-console)
    delivery provider configured; if both or neither do, fall back to the
    phone-first default."""
    if phone and email:
        email_is_real = settings.OTP_EMAIL_PROVIDER != "console"
        phone_is_real = settings.OTP_SMS_PROVIDER != "console"
        if email_is_real and not phone_is_real:
            return OtpChannel.EMAIL, email
        return OtpChannel.PHONE, phone
    if phone:
        return OtpChannel.PHONE, phone
    return OtpChannel.EMAIL, email  # type: ignore[return-value]


def _debug_otp_info(code: str, destination: str) -> OtpDebugInfo | None:
    if not settings.DEBUG:
        return None
    return OtpDebugInfo(code=code, destination=destination, expires_in_seconds=OTP_TTL_MINUTES * 60)


@router.post(
    "/auth/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["auth"],
)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> RegisterResponse:
    if payload.email and db.scalar(select(User).where(User.email == payload.email)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )
    if payload.phone and db.scalar(select(User).where(User.phone == payload.phone)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this phone number already exists.",
        )

    user = User(
        email=payload.email,
        phone=payload.phone,
        full_name=payload.full_name,
        role=payload.role,
        hashed_password=hash_password(payload.password),
        is_verified=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Verify whichever contact method was provided; if both were given,
    # phone is primary for the Kenya market (see docs/decisions.md).
    channel, destination = _channel_and_destination(email=user.email, phone=user.phone)
    _otp, code = request_otp(
        db, user=user, purpose=OtpPurpose.REGISTRATION, channel=channel, destination=destination
    )

    return RegisterResponse(
        user=UserRead.model_validate(user),
        message=(
            f"Registered. Enter the verification code sent to your {channel.value} "
            f"({destination}) to activate your account."
        ),
        otp=_debug_otp_info(code, destination),
    )


@router.post("/auth/otp/request", response_model=OtpRequestResponse, tags=["auth"])
def request_otp_code(
    payload: OtpRequestRequest, db: Session = Depends(get_db)
) -> OtpRequestResponse:
    """(Re)send a code for the given purpose. For REGISTRATION/LOGIN this
    404s if no account exists yet (you must register first). For
    PASSWORD_RESET, use POST /auth/password/forgot instead — it always
    returns 200 so a caller can't use it to enumerate registered accounts."""
    if payload.purpose is OtpPurpose.PASSWORD_RESET:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Use POST /auth/password/forgot to request a password-reset code.",
        )

    user = _find_user_by_identity(db, email=payload.email, phone=payload.phone)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No account found.")

    channel, destination = _channel_and_destination(email=payload.email, phone=payload.phone)
    try:
        _otp, code = request_otp(
            db, user=user, purpose=payload.purpose, channel=channel, destination=destination
        )
    except OtpRateLimited as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
            headers={"Retry-After": str(exc.retry_after_seconds)},
        ) from exc

    return OtpRequestResponse(
        message=f"Code sent to your {channel.value}.", otp=_debug_otp_info(code, destination)
    )


@router.post("/auth/otp/verify", response_model=OtpVerifyResponse, tags=["auth"])
def verify_otp_code_endpoint(
    payload: OtpVerifyRequest, db: Session = Depends(get_db)
) -> OtpVerifyResponse:
    user = _find_user_by_identity(db, email=payload.email, phone=payload.phone)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No account found.")

    _channel, destination = _channel_and_destination(email=payload.email, phone=payload.phone)
    try:
        verify_otp(
            db,
            user=user,
            purpose=payload.purpose,
            destination=destination,
            code=payload.code,
        )
    except OtpInvalidOrExpired as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    if payload.purpose is OtpPurpose.REGISTRATION:
        user.is_verified = True
        db.commit()
        db.refresh(user)

    return OtpVerifyResponse(message="Code verified.", user=UserRead.model_validate(user))


@router.post("/auth/login", response_model=TokenResponse, tags=["auth"])
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = _find_user_by_identity(db, email=payload.email, phone=payload.phone)
    generic_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials."
    )
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise generic_error
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled.")
    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Please verify your account with the code sent at registration "
                "before logging in."
            ),
        )

    token = create_access_token(subject=str(user.id))
    return TokenResponse(access_token=token, user=UserRead.model_validate(user))


@router.post("/auth/password/forgot", response_model=ForgotPasswordResponse, tags=["auth"])
def forgot_password(
    payload: ForgotPasswordRequest, db: Session = Depends(get_db)
) -> ForgotPasswordResponse:
    """Always responds 200 with a generic message, whether or not an account
    exists for the given identity — prevents using this endpoint to check
    which emails/phones are registered."""
    user = _find_user_by_identity(db, email=payload.email, phone=payload.phone)
    generic_message = "If an account exists for that email/phone, a reset code has been sent."
    if user is None:
        return ForgotPasswordResponse(message=generic_message)

    channel, destination = _channel_and_destination(email=payload.email, phone=payload.phone)
    try:
        _otp, code = request_otp(
            db,
            user=user,
            purpose=OtpPurpose.PASSWORD_RESET,
            channel=channel,
            destination=destination,
        )
    except OtpRateLimited:
        # Still return the generic message — don't leak rate-limit state
        # for what a caller can't tell is a real account or not.
        return ForgotPasswordResponse(message=generic_message)

    return ForgotPasswordResponse(message=generic_message, otp=_debug_otp_info(code, destination))


@router.post("/auth/password/reset", response_model=TokenResponse, tags=["auth"])
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = _find_user_by_identity(db, email=payload.email, phone=payload.phone)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code."
        )

    _channel, destination = _channel_and_destination(email=payload.email, phone=payload.phone)
    try:
        verify_otp(
            db,
            user=user,
            purpose=OtpPurpose.PASSWORD_RESET,
            destination=destination,
            code=payload.code,
        )
    except OtpInvalidOrExpired as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    user.hashed_password = hash_password(payload.new_password)
    db.commit()
    db.refresh(user)

    token = create_access_token(subject=str(user.id))
    return TokenResponse(access_token=token, user=UserRead.model_validate(user))


@router.get("/auth/me", response_model=UserRead, tags=["auth"])
def read_current_user(current_user: User = Depends(get_current_user)) -> User:
    return current_user
