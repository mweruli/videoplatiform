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
2. Looks up a `FeaturedPurchase` by `checkout_request_id`; if none matches,
   looks up a `CampaignFunding` by the same id (one shared webhook URL for
   both features — see app/models/campaign_funding.py's module docstring for
   why `checkout_request_id` is a safe shared lookup key: it's
   Safaricom-generated and globally unique per STK push regardless of which
   table's row initiated it). Either way, requires the matched row's
   `merchant_request_id` to also match — a right-checkout/wrong-merchant
   payload is logged as a rejected anomaly, not processed.
3. If neither matches, or the matched row is no longer PENDING (a
   duplicate/retried callback — Safaricom does retry), logs and returns 200
   without reprocessing — idempotent by construction.
4. On `result_code == 0`:
   - `FeaturedPurchase`: COMPLETED + `mpesa_receipt_number` + `featured_until`
     (extending from the later of `now()` or the target's existing
     `featured_until` — see `_extend_featured_until` below) + flips the
     target's `is_featured=True`.
   - `CampaignFunding`: COMPLETED + `mpesa_receipt_number`, then
     `campaign_billing.apply_campaign_funding()` (increments the campaign's
     `budget_kes` and flips it to ACTIVE if it was APPROVED/EXHAUSTED and now
     has funding headroom — see that function's docstring for the full
     funding/moderation-independence rules, not re-derived here).
   On non-zero result code, both: FAILED + `failure_reason`.

Always returns HTTP 200 with `{"ResultCode": 0, "ResultDesc": "Accepted"}`
regardless of internal outcome — Daraja's documented callback-ack contract.
A business-logic `failed` purchase/funding is a legitimate terminal state,
not a delivery failure; returning anything but 200 makes Safaricom
retry-storm the endpoint.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.business import Business
from app.models.campaign_funding import CampaignFunding, CampaignFundingStatus
from app.models.featured_purchase import FeaturedPurchase, FeaturedPurchaseStatus
from app.models.product import Product
from app.services.campaign_billing import apply_campaign_funding
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


def _handle_featured_purchase_callback(
    db: Session, purchase: FeaturedPurchase, result: StkCallbackResult
) -> None:
    if purchase.merchant_request_id != result.merchant_request_id:
        logger.warning(
            "M-Pesa STK callback MerchantRequestID mismatch for featured purchase %s "
            "(checkout_request_id=%s): expected %s, got %s — rejected as an anomaly.",
            purchase.id,
            result.checkout_request_id,
            purchase.merchant_request_id,
            result.merchant_request_id,
        )
        return

    if purchase.status != FeaturedPurchaseStatus.PENDING:
        logger.info(
            "Ignoring duplicate/retried M-Pesa STK callback for featured purchase %s (status=%s).",
            purchase.id,
            purchase.status.value,
        )
        return

    if result.amount is not None and result.amount != purchase.amount_kes:
        # Monitoring signal, not a gate — rejecting outright on a rounding/
        # currency artifact risks stranding a legitimate payment.
        logger.warning(
            "M-Pesa STK callback amount %s differs from featured purchase %s's recorded amount %s.",
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


def _handle_campaign_funding_callback(
    db: Session, funding: CampaignFunding, result: StkCallbackResult
) -> None:
    """Campaign-funding equivalent of `_handle_featured_purchase_callback`
    (same merchant-request-id cross-check, duplicate-callback idempotency,
    and amount-mismatch-is-a-warning-not-a-gate posture) — the one real
    difference is what happens on success: instead of flipping a
    business/product's `is_featured` flag directly, it delegates to
    `campaign_billing.apply_campaign_funding()`, which encodes the
    funding/moderation-independence rules (increments `budget_kes`, and only
    flips the campaign to ACTIVE if it was APPROVED/EXHAUSTED and now has
    funding headroom — see that function's docstring, not re-derived here)."""
    if funding.merchant_request_id != result.merchant_request_id:
        logger.warning(
            "M-Pesa STK callback MerchantRequestID mismatch for campaign funding %s "
            "(checkout_request_id=%s): expected %s, got %s — rejected as an anomaly.",
            funding.id,
            result.checkout_request_id,
            funding.merchant_request_id,
            result.merchant_request_id,
        )
        return

    if funding.status != CampaignFundingStatus.PENDING:
        logger.info(
            "Ignoring duplicate/retried M-Pesa STK callback for campaign funding %s (status=%s).",
            funding.id,
            funding.status.value,
        )
        return

    if result.amount is not None and result.amount != funding.amount_kes:
        logger.warning(
            "M-Pesa STK callback amount %s differs from campaign funding %s's recorded amount %s.",
            result.amount,
            funding.id,
            funding.amount_kes,
        )

    funding.result_code = result.result_code
    if result.is_success:
        funding.status = CampaignFundingStatus.COMPLETED
        funding.mpesa_receipt_number = result.mpesa_receipt_number
        apply_campaign_funding(funding.campaign, funding.amount_kes)
    else:
        funding.status = CampaignFundingStatus.FAILED
        funding.failure_reason = result.result_desc

    db.commit()


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
    if purchase is not None:
        _handle_featured_purchase_callback(db, purchase, result)
        return _ACK

    # No FeaturedPurchase matched — look up a CampaignFunding by the same
    # checkout_request_id before giving up. Shared webhook URL, not a second
    # Safaricom-facing endpoint — see this file's module docstring and
    # app/models/campaign_funding.py's for why that's safe (checkout_request_id
    # is Safaricom-generated and globally unique regardless of which table's
    # row initiated the STK push).
    funding = db.scalar(
        select(CampaignFunding).where(
            CampaignFunding.checkout_request_id == result.checkout_request_id
        )
    )
    if funding is not None:
        _handle_campaign_funding_callback(db, funding, result)
        return _ACK

    logger.warning(
        "M-Pesa STK callback for unknown CheckoutRequestID=%s (no FeaturedPurchase or "
        "CampaignFunding matched)",
        result.checkout_request_id,
    )
    return _ACK
