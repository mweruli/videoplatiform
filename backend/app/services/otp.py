"""OTP delivery abstraction (SMS/email one-time-passcode sending).

Why this exists: no real SMS/email provider account is provisioned yet (see
docs/SETUP.md) and `settings.OTP_PROVIDER` defaults to `console`. Rather than
bake "print to logs" into the auth endpoints directly, all calling code
depends only on the `OtpSender` interface below and asks `get_otp_sender()`
for an instance — exactly the same shape as app/services/storage.py's
`StorageBackend` / `get_storage_backend()`. Swapping in a real provider later
(Africa's Talking for SMS given the Kenya market, or any SMTP/email API) is a
matter of implementing one more `OtpSender` subclass and flipping
`OTP_PROVIDER` in the environment — no endpoint code changes.

`ConsoleOtpSender` (dev-only) logs the code server-side; the auth endpoints
additionally echo the code back in the HTTP response when `settings.DEBUG`
is true, so the whole register -> verify -> login loop is testable end to
end today without a live phone/inbox. Neither of those "debug leak" paths
run when `OTP_PROVIDER` is a real provider and/or `DEBUG` is false.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod

from app.core.config import settings
from app.models.otp import OtpChannel

logger = logging.getLogger("app.otp")


class OtpSender(ABC):
    @abstractmethod
    def send(self, *, channel: OtpChannel, destination: str, code: str, purpose: str) -> None:
        """Deliver `code` to `destination` over `channel`. Raise on failure —
        callers are responsible for translating that into a user-facing
        error; this layer only knows about delivery, not HTTP."""


class ConsoleOtpSender(OtpSender):
    """Dev-only: logs the code instead of sending it anywhere. Never used
    unless OTP_PROVIDER=console (the local dev default — see .env.example)."""

    def send(self, *, channel: OtpChannel, destination: str, code: str, purpose: str) -> None:
        logger.info(
            "[console-otp] purpose=%s channel=%s destination=%s code=%s",
            purpose,
            channel.value,
            destination,
            code,
        )


class AfricasTalkingOtpSender(OtpSender):
    """SMS delivery via Africa's Talking — the suggested default provider for
    the Kenya market (see docs/decisions.md's Sprint 1 note), account not
    provisioned yet. Scaffolded so wiring it up later is "fill in
    AFRICASTALKING_USERNAME/API_KEY and implement this method", not a
    redesign of the auth flow. Only handles the PHONE channel; email would
    need a separate sender (SES/Postmark/etc.) selected per-channel by
    get_otp_sender() once that's needed.
    """

    def send(self, *, channel: OtpChannel, destination: str, code: str, purpose: str) -> None:
        if channel is not OtpChannel.PHONE:
            raise NotImplementedError(
                "AfricasTalkingOtpSender only handles SMS (OtpChannel.PHONE); "
                "email OTP delivery needs a separate provider."
            )
        if not settings.AFRICASTALKING_USERNAME or not settings.AFRICASTALKING_API_KEY:
            raise RuntimeError(
                "AFRICASTALKING_USERNAME/AFRICASTALKING_API_KEY are not configured — "
                "see docs/SETUP.md. Set OTP_PROVIDER=console for local dev."
            )
        # Real implementation goes here once the account exists, e.g.:
        #   import africastalking
        #   africastalking.initialize(
        #       settings.AFRICASTALKING_USERNAME, settings.AFRICASTALKING_API_KEY
        #   )
        #   sms = africastalking.SMS
        #   sms.send(
        #       f"Your Miles Tech verification code is {code}",
        #       [destination],
        #       sender_id=settings.OTP_SENDER_ID or None,
        #   )
        raise NotImplementedError(
            "Africa's Talking SMS sending is not implemented yet — no account provisioned. "
            "See docs/SETUP.md and app/services/otp.py."
        )


def get_otp_sender() -> OtpSender:
    provider = settings.OTP_PROVIDER.lower()
    if provider == "africastalking":
        return AfricasTalkingOtpSender()
    if provider == "console":
        return ConsoleOtpSender()
    # Unknown/unconfigured provider name: fail safe to console rather than
    # 500ing every auth request, but loudly, so misconfiguration is visible.
    logger.warning(
        "Unknown OTP_PROVIDER=%r, falling back to console sender.", settings.OTP_PROVIDER
    )
    return ConsoleOtpSender()
