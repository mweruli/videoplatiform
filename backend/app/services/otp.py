"""OTP delivery abstraction (SMS/email one-time-passcode sending).

Why this exists: rather than bake "print to logs" (or a specific provider's
SDK) into the auth endpoints directly, all calling code depends only on the
`OtpSender` interface below and asks `get_otp_sender(channel)` for an
instance — exactly the same shape as app/services/storage.py's
`StorageBackend` / `get_storage_backend()`. The sender is chosen
independently per channel: `settings.OTP_SMS_PROVIDER` (`africastalking` |
`console`) picks the PHONE sender, `settings.OTP_EMAIL_PROVIDER` (`smtp` |
`console`) picks the EMAIL sender — see `get_otp_sender()` below. Swapping a
channel's provider is a matter of implementing one more `OtpSender` subclass
and flipping that channel's `OTP_*_PROVIDER` in the environment — no
endpoint code changes.

`ConsoleOtpSender` (dev-only) logs the code server-side; the auth endpoints
additionally echo the code back in the HTTP response when `settings.DEBUG`
is true, so the whole register -> verify -> login loop is testable end to
end today without a live phone/inbox or SMTP account. Neither of those
"debug leak" paths run when a channel's provider is real and/or `DEBUG` is
false.
"""

from __future__ import annotations

import logging
import smtplib
from abc import ABC, abstractmethod
from email.message import EmailMessage

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
    """Dev-only: logs the code instead of sending it anywhere. Used whenever
    a channel's provider setting (OTP_SMS_PROVIDER / OTP_EMAIL_PROVIDER) is
    `console` — the local dev default for both channels, see .env.example."""

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
    redesign of the auth flow. Only handles the PHONE channel — email is
    handled by SmtpOtpSender, selected independently by get_otp_sender().
    """

    def send(self, *, channel: OtpChannel, destination: str, code: str, purpose: str) -> None:
        if channel is not OtpChannel.PHONE:
            raise NotImplementedError(
                "AfricasTalkingOtpSender only handles SMS (OtpChannel.PHONE); "
                "email OTP delivery uses SmtpOtpSender."
            )
        if not settings.AFRICASTALKING_USERNAME or not settings.AFRICASTALKING_API_KEY:
            raise RuntimeError(
                "AFRICASTALKING_USERNAME/AFRICASTALKING_API_KEY are not configured — "
                "see docs/SETUP.md. Set OTP_SMS_PROVIDER=console for local dev."
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


_PURPOSE_COPY: dict[str, tuple[str, str]] = {
    "registration": (
        "Verify your Miles Tech account",
        "to verify your phone/email and activate your Miles Tech account",
    ),
    "login": (
        "Your Miles Tech login code",
        "to sign in to your Miles Tech account",
    ),
    "password_reset": (
        "Reset your Miles Tech password",
        "to reset your Miles Tech account password",
    ),
}


class SmtpOtpSender(OtpSender):
    """Email delivery via SMTP (real account provisioned on the cael.co.ke
    mail server — SMS isn't subscribed yet, so email is the only real
    delivery channel today; see docs/decisions.md). Only handles the EMAIL
    channel — phone/SMS is handled by AfricasTalkingOtpSender, selected
    independently by get_otp_sender().
    """

    def send(self, *, channel: OtpChannel, destination: str, code: str, purpose: str) -> None:
        if channel is not OtpChannel.EMAIL:
            raise NotImplementedError(
                "SmtpOtpSender only handles email (OtpChannel.EMAIL); "
                "phone OTP delivery uses AfricasTalkingOtpSender."
            )
        if not settings.SMTP_HOST or not settings.SMTP_USERNAME or not settings.SMTP_PASSWORD:
            raise RuntimeError(
                "SMTP_HOST/SMTP_USERNAME/SMTP_PASSWORD are not configured — "
                "see docs/SETUP.md. Set OTP_EMAIL_PROVIDER=console for local dev."
            )

        # Deferred import: app.services.otp_service imports get_otp_sender
        # from this module at module load time, so importing OTP_TTL_MINUTES
        # from otp_service at *this* module's load time would be a circular
        # import. By the time send() actually runs, otp_service is already
        # fully loaded (it's the one calling us), so a local import is safe.
        from app.services.otp_service import OTP_TTL_MINUTES

        subject_prefix, action_phrase = _PURPOSE_COPY.get(
            purpose, ("Your Miles Tech verification code", "to continue on Miles Tech")
        )

        message = EmailMessage()
        message["Subject"] = subject_prefix
        from_email = settings.SMTP_FROM_EMAIL or settings.SMTP_USERNAME
        message["From"] = f"{settings.SMTP_FROM_NAME} <{from_email}>"
        message["To"] = destination
        message.set_content(
            f"Your Miles Tech verification code is: {code}\n\n"
            f"Enter this code {action_phrase}.\n\n"
            f"This code expires in {OTP_TTL_MINUTES} minutes and can only be used once.\n\n"
            "If you didn't request this code, you can safely ignore this email — "
            "no action will be taken on your account.\n\n"
            "— Miles Tech"
        )

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as smtp:
            if settings.SMTP_USE_TLS:
                smtp.starttls()
            smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            smtp.send_message(message)


def get_otp_sender(channel: OtpChannel) -> OtpSender:
    """Pick the sender for `channel` independently: PHONE is governed by
    `settings.OTP_SMS_PROVIDER` (africastalking | console), EMAIL by
    `settings.OTP_EMAIL_PROVIDER` (smtp | console). Falls back to console
    (loudly, via a warning log) on any unrecognised provider name rather
    than 500ing every auth request."""
    if channel is OtpChannel.PHONE:
        provider = settings.OTP_SMS_PROVIDER.lower()
        if provider == "africastalking":
            return AfricasTalkingOtpSender()
        if provider == "console":
            return ConsoleOtpSender()
        logger.warning(
            "Unknown OTP_SMS_PROVIDER=%r, falling back to console sender.",
            settings.OTP_SMS_PROVIDER,
        )
        return ConsoleOtpSender()

    provider = settings.OTP_EMAIL_PROVIDER.lower()
    if provider == "smtp":
        return SmtpOtpSender()
    if provider == "console":
        return ConsoleOtpSender()
    logger.warning(
        "Unknown OTP_EMAIL_PROVIDER=%r, falling back to console sender.",
        settings.OTP_EMAIL_PROVIDER,
    )
    return ConsoleOtpSender()
