"""M-Pesa Daraja STK Push abstraction (OAuth token fetch/caching, STK Push
initiation, STK callback parsing) for Phase 1b's self-serve featured
placement — see app/models/featured_purchase.py and docs/decisions.md.

Why an ABC with one real subclass: this mirrors app/services/storage.py's
`StorageBackend` / app/services/otp.py's `OtpSender` / app/services/video.py's
`VideoBackend` pattern exactly — calling code depends only on the
`PaymentBackend` interface and asks `get_payment_backend()` for an instance,
so a future non-M-Pesa rail (e.g. a card processor, or "BunnyPay") is a new
`PaymentBackend` subclass + a `PAYMENT_PROVIDER` setting branch in
`get_payment_backend()`, not a rewrite of every caller.

One deliberate difference from those other three services: Daraja
sandbox-vs-production is NOT modeled as two subclasses. Unlike Cloudflare
Stream vs. Bunny Stream (genuinely different SDKs/APIs), sandbox and
production Daraja are the *same* API family — same endpoints, same request/
response shapes — differing only in base URL and which shortcode/credentials
are live. That's a `settings.MPESA_ENV` branch inside one class
(`DarajaMpesaBackend._base_url`), not a second class. Modeling it as two
classes would be duplicating identical logic for a difference that's really
just a config value — exactly the kind of speculative complexity this
codebase's established services deliberately avoid elsewhere.

Real, verified Daraja sandbox credentials already exist in backend/.env
(MPESA_CONSUMER_KEY/MPESA_CONSUMER_SECRET are the PM's real sandbox app;
MPESA_SHORTCODE=174379/MPESA_PASSKEY are Safaricom's universal public
sandbox test values, not secret, shared by every Daraja sandbox app) — both
OAuth token generation and STK Push were confirmed working against
https://sandbox.safaricom.co.ke before this service was written, and again
through this exact module as part of building it (see docs/decisions.md's
verification note).

IMPORTANT — callback reachability: MPESA_CALLBACK_BASE_URL is
`http://localhost:8000` in local dev. Safaricom's sandbox calls this URL
asynchronously from Safaricom's own servers to deliver the STK Push result
— it cannot reach `localhost` on a developer's machine. Testing the FULL
round-trip (initiate -> approve on phone -> callback arrives -> purchase
flips to completed) locally requires pointing MPESA_CALLBACK_BASE_URL at
something publicly reachable first (the already-hosted
https://miles-tech-api.onrender.com works fine even for sandbox testing).
Without that, `initiate_stk_push()` still works and a real STK prompt still
reaches the test phone, but the callback endpoint (once built) will never
be hit — don't mistake that for a bug in this module.
"""

from __future__ import annotations

import base64
import logging
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

import httpx

from app.core.config import settings
from app.db.redis import get_redis_client

logger = logging.getLogger("app.mpesa")

_NAIROBI_TZ = ZoneInfo("Africa/Nairobi")

# Daraja's STK Push endpoint validates the request's Timestamp against
# roughly "now" in the timezone the Shortcode/Passkey were issued for
# (Kenya) — using UTC or the server's local tz here can produce a Password
# that Safaricom rejects as stale/invalid depending on server tz, so this is
# computed explicitly against Africa/Nairobi rather than datetime.now().
_TIMESTAMP_FORMAT = "%Y%m%d%H%M%S"

_REDIS_TOKEN_KEY_PREFIX = "mpesa:oauth_token"
# Daraja access tokens are valid ~3600s; refresh a bit early so a request
# straddling the expiry boundary never gets handed an about-to-die token.
_TOKEN_TTL_SAFETY_MARGIN_SECONDS = 60


class MpesaError(Exception):
    """Raised for any Daraja request that fails outright (bad credentials,
    network error, non-zero ResponseCode, malformed response/callback).
    Callers (the future purchase-initiation endpoint) should translate this
    into a 502, not let it become an unhandled 500 — the failure is on
    Safaricom's/the network's side, not the caller's request shape."""


@dataclass
class StkPushResult:
    """What a successful STK Push *initiation* call returns. This is NOT the
    payment result — Daraja accepting the push only means the prompt was
    sent to the phone; the actual outcome arrives later via callback (see
    `parse_stk_callback` below). `checkout_request_id` is what correlates
    that later callback back to this purchase."""

    merchant_request_id: str
    checkout_request_id: str
    response_code: str
    response_description: str
    customer_message: str


@dataclass
class StkCallbackResult:
    """Parsed shape of Safaricom's STK Push callback body. `amount`/
    `mpesa_receipt_number`/`transaction_date`/`phone_number` are only
    present when `result_code == 0` (Daraja omits CallbackMetadata entirely
    on failure/cancellation) — hence all four being optional."""

    merchant_request_id: str
    checkout_request_id: str
    result_code: int
    result_desc: str
    amount: Decimal | None = None
    mpesa_receipt_number: str | None = None
    transaction_date: str | None = None
    phone_number: str | None = None

    @property
    def is_success(self) -> bool:
        return self.result_code == 0


def to_msisdn(phone: str) -> str:
    """Normalise a Kenyan phone number to Daraja's required MSISDN shape:
    12 digits, no leading '+', starting with 254 (e.g. "254711224560").
    Accepts the common input shapes a caller might have on hand: "+254...",
    "0711...", "254...", with or without spaces/dashes (matches what
    app/utils/phone.py's normalize_phone already strips before this runs).
    Raises MpesaError for anything that doesn't resolve to a plausible
    Kenyan MSISDN, rather than silently sending a malformed number to
    Safaricom and getting an opaque 400 back.
    """
    digits = "".join(ch for ch in phone if ch.isdigit())
    if digits.startswith("254") and len(digits) == 12:
        return digits
    if digits.startswith("0") and len(digits) == 10:
        return "254" + digits[1:]
    if digits.startswith("7") or digits.startswith("1"):
        if len(digits) == 9:
            return "254" + digits
    raise MpesaError(f"'{phone}' does not look like a valid Kenyan MSISDN.")


class PaymentBackend:
    """Interface every payment provider implements. Not an `abc.ABC` with
    `@abstractmethod` purely because there is exactly one real
    implementation today and this file's docstring already states the
    contract — kept as a plain base class with NotImplementedError stubs so
    a future second provider has an unambiguous shape to match, same
    information either way."""

    def initiate_stk_push(
        self,
        *,
        phone: str,
        amount: int,
        account_reference: str,
        transaction_desc: str,
    ) -> StkPushResult:
        raise NotImplementedError


class DarajaMpesaBackend(PaymentBackend):
    """Safaricom Daraja M-Pesa Express (STK Push). Sandbox vs. production is
    a `settings.MPESA_ENV` switch, not a subclass — see module docstring."""

    _BASE_URLS = {
        "sandbox": "https://sandbox.safaricom.co.ke",
        "production": "https://api.safaricom.co.ke",
    }

    def __init__(self) -> None:
        if not all(
            [
                settings.MPESA_CONSUMER_KEY,
                settings.MPESA_CONSUMER_SECRET,
                settings.MPESA_SHORTCODE,
                settings.MPESA_PASSKEY,
            ]
        ):
            raise RuntimeError(
                "MPESA_CONSUMER_KEY/MPESA_CONSUMER_SECRET/MPESA_SHORTCODE/MPESA_PASSKEY "
                "are not fully configured — see docs/SETUP.md and backend/.env.example."
            )
        env = settings.MPESA_ENV.lower()
        if env not in self._BASE_URLS:
            raise RuntimeError(
                f"MPESA_ENV={settings.MPESA_ENV!r} is not 'sandbox' or 'production'."
            )
        self._base_url = self._BASE_URLS[env]

    # --- OAuth ---------------------------------------------------------

    def _redis_token_key(self) -> str:
        return f"{_REDIS_TOKEN_KEY_PREFIX}:{settings.MPESA_ENV.lower()}"

    def _get_access_token(self) -> str:
        """Cached in Redis (not in-process) so every uvicorn worker/replica
        shares one token instead of each independently hitting Daraja's
        OAuth endpoint — same rationale as this codebase's existing
        Redis-backed rate limiting (app/services/otp_service.py). A cache
        miss/race just means an extra OAuth call; harmless, so no locking."""
        r = get_redis_client()
        key = self._redis_token_key()
        cached = r.get(key)
        if cached:
            return cached.decode() if isinstance(cached, bytes) else cached

        token, expires_in = self._fetch_access_token()
        ttl = max(expires_in - _TOKEN_TTL_SAFETY_MARGIN_SECONDS, 30)
        r.setex(key, ttl, token)
        return token

    def _fetch_access_token(self) -> tuple[str, int]:
        auth = (settings.MPESA_CONSUMER_KEY, settings.MPESA_CONSUMER_SECRET)
        url = f"{self._base_url}/oauth/v1/generate?grant_type=client_credentials"
        try:
            resp = httpx.get(url, auth=auth, timeout=15)
        except httpx.HTTPError as exc:
            raise MpesaError(f"Failed to reach Daraja OAuth endpoint: {exc}") from exc

        if resp.status_code != 200:
            raise MpesaError(
                f"Daraja OAuth token request failed: {resp.status_code} {resp.text}"
            )
        data = resp.json()
        token = data.get("access_token")
        if not token:
            raise MpesaError(f"Daraja OAuth response missing access_token: {data}")
        try:
            expires_in = int(data.get("expires_in", 3599))
        except (TypeError, ValueError):
            expires_in = 3599
        return token, expires_in

    # --- STK Push --------------------------------------------------------

    def _password_and_timestamp(self) -> tuple[str, str]:
        timestamp = datetime.now(_NAIROBI_TZ).strftime(_TIMESTAMP_FORMAT)
        raw = f"{settings.MPESA_SHORTCODE}{settings.MPESA_PASSKEY}{timestamp}"
        password = base64.b64encode(raw.encode()).decode()
        return password, timestamp

    def initiate_stk_push(
        self,
        *,
        phone: str,
        amount: int,
        account_reference: str,
        transaction_desc: str,
    ) -> StkPushResult:
        msisdn = to_msisdn(phone)
        password, timestamp = self._password_and_timestamp()
        callback_url = (
            f"{settings.MPESA_CALLBACK_BASE_URL.rstrip('/')}"
            f"{settings.API_V1_PREFIX}/payments/mpesa/callback"
        )
        # Daraja caps AccountReference at 12 chars and rejects longer values
        # with a 400 — truncate defensively here rather than trust every
        # caller to know that limit.
        account_reference = account_reference[:12]

        payload = {
            "BusinessShortCode": settings.MPESA_SHORTCODE,
            "Password": password,
            "Timestamp": timestamp,
            "TransactionType": "CustomerPayBillOnline",
            # Sandbox/production STK Push only accepts whole-shilling
            # integer amounts — no cents.
            "Amount": int(amount),
            "PartyA": msisdn,
            "PartyB": settings.MPESA_SHORTCODE,
            "PhoneNumber": msisdn,
            "CallBackURL": callback_url,
            "AccountReference": account_reference,
            "TransactionDesc": transaction_desc[:100],
        }

        token = self._get_access_token()
        url = f"{self._base_url}/mpesa/stkpush/v1/processrequest"
        try:
            resp = httpx.post(
                url,
                json=payload,
                headers={"Authorization": f"Bearer {token}"},
                timeout=20,
            )
        except httpx.HTTPError as exc:
            raise MpesaError(f"Failed to reach Daraja STK Push endpoint: {exc}") from exc

        data = resp.json() if resp.content else {}
        if resp.status_code != 200 or str(data.get("ResponseCode")) != "0":
            raise MpesaError(
                "Daraja STK Push request was not accepted: "
                f"HTTP {resp.status_code}, body={data}"
            )

        try:
            return StkPushResult(
                merchant_request_id=data["MerchantRequestID"],
                checkout_request_id=data["CheckoutRequestID"],
                response_code=str(data["ResponseCode"]),
                response_description=data.get("ResponseDescription", ""),
                customer_message=data.get("CustomerMessage", ""),
            )
        except KeyError as exc:
            raise MpesaError(f"Malformed Daraja STK Push response: {data}") from exc


def parse_stk_callback(payload: dict) -> StkCallbackResult:
    """Parse Safaricom's STK Push callback POST body into a plain
    dataclass. Raises MpesaError for a payload that doesn't match Daraja's
    documented `Body.stkCallback` shape at all (foreign/malformed request)
    so the callback endpoint can log-and-200 rather than 500 — see
    docs/decisions.md for why the callback endpoint must always return 200
    to Safaricom regardless of what it decides to do with the payload.
    """
    try:
        stk = payload["Body"]["stkCallback"]
        merchant_request_id = stk["MerchantRequestID"]
        checkout_request_id = stk["CheckoutRequestID"]
        result_code = int(stk["ResultCode"])
        result_desc = str(stk.get("ResultDesc", ""))
    except (KeyError, TypeError, ValueError) as exc:
        raise MpesaError(f"Malformed STK callback payload: {exc}") from exc

    items: dict[str, object] = {}
    metadata = stk.get("CallbackMetadata")
    if metadata and isinstance(metadata.get("Item"), list):
        for entry in metadata["Item"]:
            name = entry.get("Name")
            if name is not None:
                items[name] = entry.get("Value")

    amount = None
    if "Amount" in items:
        try:
            amount = Decimal(str(items["Amount"]))
        except Exception:  # noqa: BLE001 - defensive, never let a parse quirk 500 the webhook
            amount = None

    return StkCallbackResult(
        merchant_request_id=merchant_request_id,
        checkout_request_id=checkout_request_id,
        result_code=result_code,
        result_desc=result_desc,
        amount=amount,
        mpesa_receipt_number=(
            str(items["MpesaReceiptNumber"]) if "MpesaReceiptNumber" in items else None
        ),
        transaction_date=(
            str(items["TransactionDate"]) if "TransactionDate" in items else None
        ),
        phone_number=str(items["PhoneNumber"]) if "PhoneNumber" in items else None,
    )


def get_payment_backend() -> PaymentBackend:
    """Only one real provider exists today (Safaricom Daraja). This
    indirection exists so a future non-M-Pesa rail is a new PaymentBackend
    subclass + a PAYMENT_PROVIDER setting branch here — exactly mirroring
    get_otp_sender()/get_video_backend()/get_storage_backend() — not a
    rewrite of every caller. No settings-driven branch is needed yet since
    there is nothing to branch to."""
    return DarajaMpesaBackend()
