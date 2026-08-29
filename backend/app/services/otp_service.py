"""OTP lifecycle: generation, storage, rate limiting, verification.

Delivery is handled entirely by app/services/otp.py's `OtpSender`; this
module owns everything else — the hashed code + expiry row in Postgres
(app/models/otp.py), and request/verify rate limiting backed by Redis
(app/db/redis.py, already used for caching elsewhere in the codebase).

Two independent limits guard against abuse, both scoped per (purpose,
destination) so one user's flood doesn't lock out another:
- **Resend cooldown** (`OTP_RESEND_COOLDOWN_SECONDS`): can't request a new
  code again immediately after the last one — stops "spam my phone" via
  rapid repeat calls.
- **Hourly cap** (`OTP_MAX_REQUESTS_PER_HOUR`): can't request more than N
  codes in a rolling hour — stops sustained abuse even across the cooldown.

Verification attempts are capped per-code (`OTP_MAX_VERIFY_ATTEMPTS`,
tracked on the OtpCode row itself via `attempt_count`) — after too many
wrong guesses the code is invalidated outright, forcing a fresh request
rather than allowing unlimited brute-force guesses against one code.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import generate_otp_code, hash_otp_code, verify_otp_code
from app.db.redis import get_redis_client
from app.models.otp import OtpChannel, OtpCode, OtpPurpose
from app.models.user import User
from app.services.otp import get_otp_sender

OTP_LENGTH = 6
OTP_TTL_MINUTES = 10
OTP_RESEND_COOLDOWN_SECONDS = 60
OTP_MAX_REQUESTS_PER_HOUR = 5
OTP_MAX_VERIFY_ATTEMPTS = 5


class OtpRateLimited(Exception):
    def __init__(self, retry_after_seconds: int, message: str) -> None:
        self.retry_after_seconds = retry_after_seconds
        super().__init__(message)


class OtpInvalidOrExpired(Exception):
    pass


def _redis_key(prefix: str, purpose: OtpPurpose, destination: str) -> str:
    return f"otp:{prefix}:{purpose.value}:{destination.lower()}"


def _check_rate_limits(purpose: OtpPurpose, destination: str) -> None:
    r = get_redis_client()
    cooldown_key = _redis_key("cooldown", purpose, destination)
    ttl = r.ttl(cooldown_key)
    if ttl and ttl > 0:
        raise OtpRateLimited(
            retry_after_seconds=int(ttl),
            message=f"Please wait {int(ttl)}s before requesting another code.",
        )

    count_key = _redis_key("count", purpose, destination)
    current = r.get(count_key)
    if current is not None and int(current) >= OTP_MAX_REQUESTS_PER_HOUR:
        window_ttl = r.ttl(count_key)
        raise OtpRateLimited(
            retry_after_seconds=int(window_ttl) if window_ttl and window_ttl > 0 else 3600,
            message="Too many code requests. Please try again later.",
        )


def _record_request(purpose: OtpPurpose, destination: str) -> None:
    r = get_redis_client()
    r.setex(_redis_key("cooldown", purpose, destination), OTP_RESEND_COOLDOWN_SECONDS, "1")
    count_key = _redis_key("count", purpose, destination)
    pipe = r.pipeline()
    pipe.incr(count_key)
    pipe.expire(count_key, 3600, nx=True)
    pipe.execute()


def request_otp(
    db: Session,
    *,
    user: User,
    purpose: OtpPurpose,
    channel: OtpChannel,
    destination: str,
) -> tuple[OtpCode, str]:
    """Rate-limit, generate, persist (hashed) and send a new OTP code.

    Returns (OtpCode row, plaintext code) — the plaintext is never stored;
    callers only echo it back to the response when settings.DEBUG is true
    (see app/api/v1/endpoints/auth.py) and always pass it to the OtpSender.
    Raises OtpRateLimited if the caller is over a request limit.
    """
    _check_rate_limits(purpose, destination)

    code = generate_otp_code(OTP_LENGTH)
    otp = OtpCode(
        user_id=user.id,
        purpose=purpose,
        channel=channel,
        destination=destination,
        code_hash=hash_otp_code(code),
        expires_at=datetime.now(UTC) + timedelta(minutes=OTP_TTL_MINUTES),
    )
    db.add(otp)
    db.commit()
    db.refresh(otp)

    get_otp_sender(channel).send(
        channel=channel, destination=destination, code=code, purpose=purpose.value
    )
    _record_request(purpose, destination)
    return otp, code


def verify_otp(
    db: Session,
    *,
    user: User,
    purpose: OtpPurpose,
    destination: str,
    code: str,
) -> OtpCode:
    """Verify `code` against the most recent live (unconsumed, unexpired)
    OTP for this user/purpose/destination. Raises OtpInvalidOrExpired on any
    failure (wrong code, expired, none found, too many prior attempts) —
    deliberately a single generic error so callers can't distinguish "no
    such code" from "wrong code" from "expired" (that distinction isn't
    useful to an end user and only helps an attacker).
    """
    stmt = (
        select(OtpCode)
        .where(
            OtpCode.user_id == user.id,
            OtpCode.purpose == purpose,
            OtpCode.destination == destination,
            OtpCode.consumed_at.is_(None),
        )
        .order_by(OtpCode.created_at.desc())
        .limit(1)
    )
    otp = db.scalar(stmt)
    if otp is None:
        raise OtpInvalidOrExpired("No pending code for this destination.")

    if otp.is_expired:
        raise OtpInvalidOrExpired("Code has expired.")

    if otp.attempt_count >= OTP_MAX_VERIFY_ATTEMPTS:
        otp.consumed_at = datetime.now(UTC)  # burn it; force a fresh request
        db.commit()
        raise OtpInvalidOrExpired("Too many incorrect attempts. Request a new code.")

    if not verify_otp_code(code, otp.code_hash):
        otp.attempt_count += 1
        db.commit()
        raise OtpInvalidOrExpired("Incorrect code.")

    otp.consumed_at = datetime.now(UTC)
    db.commit()
    db.refresh(otp)
    return otp
