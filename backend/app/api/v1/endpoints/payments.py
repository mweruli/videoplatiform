"""The Safaricom-facing M-Pesa STK Push callback webhook.

Kept in its own file, separate from app/api/v1/endpoints/featured_purchases.py
— this endpoint is unauthenticated (no bearer token, no user session;
Safaricom's servers call it directly) and not part of the owner-facing API
surface, same reasoning admin.py is already split out by audience rather than
resource.

Validation posture (see docs/decisions.md's "Phase 1b design pass" entry for
the full writeup, deliberately not over-engineered): Daraja STK callbacks
carry no cryptographic signature and no shared secret — the correlation
surface is exactly `CheckoutRequestID` + `MerchantRequestID`, both
Safaricom-generated, unguessable, and never exposed to any client. This
handler:
1. Parses the payload with `mpesa.parse_stk_callback()` — logs and returns
   200 (never 500) on a malformed/foreign payload.
2. Looks up the `FeaturedPurchase` by `checkout_request_id`, and requires its
   `merchant_request_id` to match too — a right-checkout/wrong-merchant
   payload is logged as a rejected anomaly, not processed.
3. If no matching row, or the row is no longer PENDING (a duplicate/retried
   callback — Safaricom does retry), logs and returns 200 without
   reprocessing — idempotent by construction.
4. On `result_code == 0`: COMPLETED + `mpesa_receipt_number` + `featured_until`
   (extending from the later of `now()` or the target's existing
   `featured_until` — see `_extend_featured_until` below) + flips the
   target's `is_featured=True`. On non-zero: FAILED + `failure_reason`.

Always returns HTTP 200 with `{"ResultCode": 0, "ResultDesc": "Accepted"}`
regardless of internal outcome — Daraja's documented callback-ack contract.
A business-logic `failed` purchase is a legitimate terminal state, not a
delivery failure; returning anything but 200 makes Safaricom retry-storm the
endpoint.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.business import Business
from app.models.featured_purchase import FeaturedPurchase, FeaturedPurchaseStatus
from app.models.product import Product
from app.services.mpesa import MpesaError, StkCallbackResult, parse_stk_callback

logger = logging.getLogger("app.payments")

router = APIRouter()

_ACK = {"ResultCode": 0, "ResultDesc": "Accepted"}


def _extend_featured_until(current: datetime | None, duration_days: int) -> datetime:
    """Stacking/extension rule (decided in docs/decisions.md, not
    re-derived): a new completed purchase extends from the LATER of now() or
    the target's existing `featured_until`, not a flat overwrite — a
    business buying a second 7-day slot while 3 days remain on the first
    should get 10 days remaining, not 7."""
    now = datetime.now(UTC)
    base = current if (current is not None and current > now) else now
    return base + timedelta(days=duration_days)


def _apply_completed_purchase(purchase: FeaturedPurchase, result: StkCallbackResult) -> None:
    target: Business | Product = purchase.product if purchase.product_id else purchase.business
    new_until = _extend_featured_until(target.featured_until, purchase.duration_days)

    purchase.status = FeaturedPurchaseStatus.COMPLETED
    purchase.mpesa_receipt_number = result.mpesa_receipt_number
    purchase.featured_until = new_until

    target.featured_until = new_until
    target.is_featured = True


@router.post("/payments/mpesa/callback", tags=["payments"])
def mpesa_stk_callback(payload: dict, db: Session = Depends(get_db)) -> dict:
    try:
        result = parse_stk_callback(payload)
    except MpesaError:
        logger.warning("Malformed/foreign M-Pesa STK callback payload: %r", payload)
        return _ACK

    purchase = db.scalar(
        select(FeaturedPurchase).where(
            FeaturedPurchase.checkout_request_id == result.checkout_request_id
        )
    )
    if purchase is None:
        logger.warning(
            "M-Pesa STK callback for unknown CheckoutRequestID=%s", result.checkout_request_id
        )
        return _ACK

    if purchase.merchant_request_id != result.merchant_request_id:
        logger.warning(
            "M-Pesa STK callback MerchantRequestID mismatch for purchase %s "
            "(checkout_request_id=%s): expected %s, got %s — rejected as an anomaly.",
            purchase.id,
            result.checkout_request_id,
            purchase.merchant_request_id,
            result.merchant_request_id,
        )
        return _ACK

    if purchase.status != FeaturedPurchaseStatus.PENDING:
        logger.info(
            "Ignoring duplicate/retried M-Pesa STK callback for purchase %s (status=%s).",
            purchase.id,
            purchase.status.value,
        )
        return _ACK

    if result.amount is not None and result.amount != purchase.amount_kes:
        # Monitoring signal, not a gate — rejecting outright on a rounding/
        # currency artifact risks stranding a legitimate payment.
        logger.warning(
            "M-Pesa STK callback amount %s differs from purchase %s's recorded amount %s.",
            result.amount,
            purchase.id,
            purchase.amount_kes,
        )

    purchase.result_code = result.result_code
    if result.is_success:
        _apply_completed_purchase(purchase, result)
    else:
        purchase.status = FeaturedPurchaseStatus.FAILED
        purchase.failure_reason = result.result_desc

    db.commit()
    return _ACK
