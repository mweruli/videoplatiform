"""Tests for Phase 1b's M-Pesa self-serve featured-placement endpoints:
app/api/v1/endpoints/featured_purchases.py (owner/admin-facing) and
app/api/v1/endpoints/payments.py (the Safaricom-facing callback), plus an
isolated unit test of app/services/featured_expiry.py's sweep functions.

Uses the `fake_payment_backend` fixture (tests/conftest.py) to avoid ever
hitting real Daraja in the test suite — see docs/decisions.md's Phase 1b
design-pass entry for why a fake PaymentBackend was needed here for the
first time in this codebase.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import app
from app.models.business import Business
from app.models.featured_purchase import FeaturedPurchase
from app.models.product import Product
from app.services.featured_expiry import (
    sweep_expired_featured_businesses,
    sweep_expired_featured_products,
)

client = TestClient(app)

CALLBACK_URL = "/api/v1/payments/mpesa/callback"


def _unique(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


def _dev_token(role: str = "general_user") -> tuple[str, dict]:
    email = f"{_unique('user')}@example.com"
    resp = client.post(
        "/api/v1/dev/token",
        json={"email": email, "full_name": "Test User", "role": role},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    return body["access_token"], body["user"]


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _get_tier_id(label: str) -> int:
    """Looks up a currently-active pricing tier's id by label via the real
    public endpoint, rather than assuming a fixed id — tiers are admin-
    editable rows now (app/models/featured_pricing_tier.py), not a fixed
    2-member enum, so a test should resolve "the 7-day tier" the same way
    the real frontend would (see docs/decisions.md's "Admin-editable
    pricing" entry)."""
    resp = client.get("/api/v1/featured/pricing")
    assert resp.status_code == 200, resp.text
    matches = [t for t in resp.json() if t["label"] == label]
    assert matches, f"No active tier labeled {label!r} found: {resp.json()}"
    return matches[0]["id"]


def _create_business(token: str, **overrides) -> dict:
    payload = {
        "name": _unique("Featured Test Biz"),
        "description": "Test business for featured-purchase endpoint coverage.",
        "county": "Nairobi",
        "city": "Nairobi",
        "phone": "+254711224560",
    }
    payload.update(overrides)
    resp = client.post("/api/v1/businesses", json=payload, headers=_auth_headers(token))
    assert resp.status_code == 201, resp.text
    return resp.json()


def _create_product(token: str, business_id: str, **overrides) -> dict:
    payload = {"name": _unique("Featured Test Product"), "price_min": "1000"}
    payload.update(overrides)
    resp = client.post(
        f"/api/v1/businesses/{business_id}/products",
        json=payload,
        headers=_auth_headers(token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _success_callback_payload(
    *, merchant_request_id: str, checkout_request_id: str, amount: int = 500
) -> dict:
    return {
        "Body": {
            "stkCallback": {
                "MerchantRequestID": merchant_request_id,
                "CheckoutRequestID": checkout_request_id,
                "ResultCode": 0,
                "ResultDesc": "The service request is processed successfully.",
                "CallbackMetadata": {
                    "Item": [
                        {"Name": "Amount", "Value": amount},
                        {"Name": "MpesaReceiptNumber", "Value": "NLJ7RT61SV"},
                        {"Name": "TransactionDate", "Value": 20260904102115},
                        {"Name": "PhoneNumber", "Value": 254708374149},
                    ]
                },
            }
        }
    }


def _failure_callback_payload(
    *, merchant_request_id: str, checkout_request_id: str, result_code: int = 1032
) -> dict:
    return {
        "Body": {
            "stkCallback": {
                "MerchantRequestID": merchant_request_id,
                "CheckoutRequestID": checkout_request_id,
                "ResultCode": result_code,
                "ResultDesc": "Request cancelled by user.",
            }
        }
    }


def _fetch_business(business_id: str) -> Business:
    with SessionLocal() as db:
        business = db.get(Business, uuid.UUID(business_id))
        assert business is not None
        db.expunge(business)
        return business


def _fetch_product(product_id: str) -> Product:
    with SessionLocal() as db:
        product = db.get(Product, uuid.UUID(product_id))
        assert product is not None
        db.expunge(product)
        return product


# --- Pricing ------------------------------------------------------------


def test_pricing_endpoint_is_public_and_lists_both_seeded_tiers() -> None:
    resp = client.get("/api/v1/featured/pricing")
    assert resp.status_code == 200
    body = resp.json()
    labels = {item["label"] for item in body}
    assert {"7 days", "30 days"}.issubset(labels)
    seven = next(item for item in body if item["label"] == "7 days")
    assert seven["duration_days"] == 7
    assert Decimal(seven["amount_kes"]) == Decimal("500.00")
    assert seven["is_active"] is True
    assert isinstance(seven["id"], int)


# --- Access control / validation ----------------------------------------


def test_purchase_initiation_requires_auth() -> None:
    token, _ = _dev_token()
    business = _create_business(token)
    resp = client.post(
        f"/api/v1/businesses/{business['id']}/featured-purchases",
        json={"tier_id": _get_tier_id("7 days"), "phone": "0708374149"},
    )
    assert resp.status_code == 401


def test_non_owner_cannot_initiate_purchase(fake_payment_backend) -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)

    other_token, _ = _dev_token()
    resp = client.post(
        f"/api/v1/businesses/{business['id']}/featured-purchases",
        json={"tier_id": _get_tier_id("7 days"), "phone": "0708374149"},
        headers=_auth_headers(other_token),
    )
    assert resp.status_code == 403
    assert fake_payment_backend.calls == []  # never even reached the payment backend


def test_unknown_tier_id_is_400(fake_payment_backend) -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)

    resp = client.post(
        f"/api/v1/businesses/{business['id']}/featured-purchases",
        json={"tier_id": 999_999_999, "phone": "0708374149"},
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 400
    assert fake_payment_backend.calls == []


def test_deactivated_tier_id_is_400(fake_payment_backend) -> None:
    """An admin shouldn't be able to sell a tier they've deactivated — see
    docs/decisions.md's "Admin-editable pricing" entry."""
    admin_token, _ = _dev_token(role="platform_admin")
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)

    created = client.post(
        "/api/v1/admin/featured-pricing-tiers",
        json={"label": _unique("Temp Tier"), "duration_days": 3, "amount_kes": "100.00"},
        headers=_auth_headers(admin_token),
    ).json()
    client.patch(
        f"/api/v1/admin/featured-pricing-tiers/{created['id']}",
        json={"is_active": False},
        headers=_auth_headers(admin_token),
    )

    resp = client.post(
        f"/api/v1/businesses/{business['id']}/featured-purchases",
        json={"tier_id": created["id"], "phone": "0708374149"},
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 400
    assert fake_payment_backend.calls == []


def test_invalid_phone_is_422(fake_payment_backend) -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)

    resp = client.post(
        f"/api/v1/businesses/{business['id']}/featured-purchases",
        json={"tier_id": _get_tier_id("7 days"), "phone": "not-a-phone"},
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 422
    assert fake_payment_backend.calls == []


def test_product_id_must_belong_to_the_business(fake_payment_backend) -> None:
    owner_token, _ = _dev_token()
    business_a = _create_business(owner_token)
    business_b = _create_business(owner_token)
    product_b = _create_product(owner_token, business_b["id"])

    resp = client.post(
        f"/api/v1/businesses/{business_a['id']}/featured-purchases",
        json={
            "tier_id": _get_tier_id("7 days"),
            "phone": "0708374149",
            "product_id": product_b["id"],
        },
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 400
    assert fake_payment_backend.calls == []


def test_synchronous_daraja_failure_creates_no_row(fake_payment_backend) -> None:
    from app.services.mpesa import MpesaError

    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    fake_payment_backend.next_error = MpesaError("Invalid CallBackURL")

    resp = client.post(
        f"/api/v1/businesses/{business['id']}/featured-purchases",
        json={"tier_id": _get_tier_id("7 days"), "phone": "0708374149"},
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 502

    with SessionLocal() as db:
        count = (
            db.query(FeaturedPurchase)
            .filter(FeaturedPurchase.business_id == uuid.UUID(business["id"]))
            .count()
        )
        assert count == 0


# --- Happy path: initiate -> poll status -> callback --------------------


def test_purchase_happy_path_completes_and_features_the_business(fake_payment_backend) -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)

    resp = client.post(
        f"/api/v1/businesses/{business['id']}/featured-purchases",
        json={"tier_id": _get_tier_id("7 days"), "phone": "0708374149"},
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 201, resp.text
    purchase = resp.json()
    assert purchase["status"] == "pending"
    assert purchase["product_id"] is None
    assert purchase["tier_label"] == "7 days"
    assert purchase["amount_kes"] == "500.00"
    assert purchase["duration_days"] == 7
    assert len(fake_payment_backend.calls) == 1
    assert fake_payment_backend.calls[0]["phone"] == "0708374149"
    assert fake_payment_backend.calls[0]["amount"] == 500

    # Owner can poll status.
    resp = client.get(
        f"/api/v1/featured-purchases/{purchase['id']}", headers=_auth_headers(owner_token)
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "pending"

    # A stranger cannot poll it.
    other_token, _ = _dev_token()
    resp = client.get(
        f"/api/v1/featured-purchases/{purchase['id']}", headers=_auth_headers(other_token)
    )
    assert resp.status_code == 403

    with SessionLocal() as db:
        row = db.get(FeaturedPurchase, uuid.UUID(purchase["id"]))
        checkout_request_id = row.checkout_request_id
        merchant_request_id = row.merchant_request_id

    before = datetime.now(UTC)
    callback_resp = client.post(
        CALLBACK_URL,
        json=_success_callback_payload(
            merchant_request_id=merchant_request_id, checkout_request_id=checkout_request_id
        ),
    )
    assert callback_resp.status_code == 200
    assert callback_resp.json() == {"ResultCode": 0, "ResultDesc": "Accepted"}

    resp = client.get(
        f"/api/v1/featured-purchases/{purchase['id']}", headers=_auth_headers(owner_token)
    )
    body = resp.json()
    assert body["status"] == "completed"
    assert body["mpesa_receipt_number"] == "NLJ7RT61SV"
    featured_until = datetime.fromisoformat(body["featured_until"])
    lower = before + timedelta(days=6, hours=23)
    upper = before + timedelta(days=7, hours=1)
    assert lower < featured_until < upper

    business_row = _fetch_business(business["id"])
    assert business_row.is_featured is True
    assert business_row.featured_until is not None


def test_purchase_can_target_a_specific_product(fake_payment_backend) -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    product = _create_product(owner_token, business["id"])

    resp = client.post(
        f"/api/v1/businesses/{business['id']}/featured-purchases",
        json={
            "tier_id": _get_tier_id("30 days"),
            "phone": "0708374149",
            "product_id": product["id"],
        },
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 201, resp.text
    purchase = resp.json()
    assert purchase["product_id"] == product["id"]

    with SessionLocal() as db:
        row = db.get(FeaturedPurchase, uuid.UUID(purchase["id"]))
        checkout_request_id = row.checkout_request_id
        merchant_request_id = row.merchant_request_id

    client.post(
        CALLBACK_URL,
        json=_success_callback_payload(
            merchant_request_id=merchant_request_id,
            checkout_request_id=checkout_request_id,
            amount=1500,
        ),
    )

    product_row = _fetch_product(product["id"])
    assert product_row.is_featured is True
    assert product_row.featured_until is not None

    # The business itself was NOT featured — only the product was the target.
    business_row = _fetch_business(business["id"])
    assert business_row.is_featured is False


def test_callback_failure_records_reason_and_does_not_feature(fake_payment_backend) -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)

    resp = client.post(
        f"/api/v1/businesses/{business['id']}/featured-purchases",
        json={"tier_id": _get_tier_id("7 days"), "phone": "0708374149"},
        headers=_auth_headers(owner_token),
    )
    purchase = resp.json()

    with SessionLocal() as db:
        row = db.get(FeaturedPurchase, uuid.UUID(purchase["id"]))
        checkout_request_id = row.checkout_request_id
        merchant_request_id = row.merchant_request_id

    callback_resp = client.post(
        CALLBACK_URL,
        json=_failure_callback_payload(
            merchant_request_id=merchant_request_id, checkout_request_id=checkout_request_id
        ),
    )
    assert callback_resp.status_code == 200
    assert callback_resp.json() == {"ResultCode": 0, "ResultDesc": "Accepted"}

    resp = client.get(
        f"/api/v1/featured-purchases/{purchase['id']}", headers=_auth_headers(owner_token)
    )
    body = resp.json()
    assert body["status"] == "failed"
    assert body["failure_reason"] == "Request cancelled by user."
    assert body["featured_until"] is None

    business_row = _fetch_business(business["id"])
    assert business_row.is_featured is False


def test_duplicate_callback_is_a_noop(fake_payment_backend) -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    resp = client.post(
        f"/api/v1/businesses/{business['id']}/featured-purchases",
        json={"tier_id": _get_tier_id("7 days"), "phone": "0708374149"},
        headers=_auth_headers(owner_token),
    )
    purchase = resp.json()

    with SessionLocal() as db:
        row = db.get(FeaturedPurchase, uuid.UUID(purchase["id"]))
        checkout_request_id = row.checkout_request_id
        merchant_request_id = row.merchant_request_id

    payload = _success_callback_payload(
        merchant_request_id=merchant_request_id, checkout_request_id=checkout_request_id
    )
    client.post(CALLBACK_URL, json=payload)

    first_business = _fetch_business(business["id"])
    first_featured_until = first_business.featured_until
    assert first_featured_until is not None

    # Safaricom retries the same callback — must not extend/reprocess again.
    second_resp = client.post(CALLBACK_URL, json=payload)
    assert second_resp.status_code == 200

    second_business = _fetch_business(business["id"])
    assert second_business.featured_until == first_featured_until


def test_callback_with_mismatched_merchant_request_id_is_rejected(fake_payment_backend) -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    resp = client.post(
        f"/api/v1/businesses/{business['id']}/featured-purchases",
        json={"tier_id": _get_tier_id("7 days"), "phone": "0708374149"},
        headers=_auth_headers(owner_token),
    )
    purchase = resp.json()

    with SessionLocal() as db:
        row = db.get(FeaturedPurchase, uuid.UUID(purchase["id"]))
        checkout_request_id = row.checkout_request_id

    callback_resp = client.post(
        CALLBACK_URL,
        json=_success_callback_payload(
            merchant_request_id="totally-wrong-merchant-id",
            checkout_request_id=checkout_request_id,
        ),
    )
    assert callback_resp.status_code == 200  # always 200 to Safaricom

    resp = client.get(
        f"/api/v1/featured-purchases/{purchase['id']}", headers=_auth_headers(owner_token)
    )
    assert resp.json()["status"] == "pending"  # untouched — mismatch rejected


def test_unknown_checkout_request_id_is_ignored_not_errored() -> None:
    resp = client.post(
        CALLBACK_URL,
        json=_success_callback_payload(
            merchant_request_id="ghost-merchant", checkout_request_id="ghost-checkout"
        ),
    )
    assert resp.status_code == 200
    assert resp.json() == {"ResultCode": 0, "ResultDesc": "Accepted"}


def test_malformed_callback_payload_returns_200_not_500() -> None:
    resp = client.post(CALLBACK_URL, json={"nonsense": True})
    assert resp.status_code == 200
    assert resp.json() == {"ResultCode": 0, "ResultDesc": "Accepted"}


def test_stacking_extends_existing_featured_until_instead_of_overwriting(
    fake_payment_backend,
) -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)

    def _buy_and_complete(tier_id: int) -> None:
        resp = client.post(
            f"/api/v1/businesses/{business['id']}/featured-purchases",
            json={"tier_id": tier_id, "phone": "0708374149"},
            headers=_auth_headers(owner_token),
        )
        purchase = resp.json()
        with SessionLocal() as db:
            row = db.get(FeaturedPurchase, uuid.UUID(purchase["id"]))
            checkout_request_id = row.checkout_request_id
            merchant_request_id = row.merchant_request_id
        client.post(
            CALLBACK_URL,
            json=_success_callback_payload(
                merchant_request_id=merchant_request_id, checkout_request_id=checkout_request_id
            ),
        )

    seven_day_tier_id = _get_tier_id("7 days")
    _buy_and_complete(seven_day_tier_id)
    after_first = _fetch_business(business["id"]).featured_until
    assert after_first is not None

    _buy_and_complete(seven_day_tier_id)
    after_second = _fetch_business(business["id"]).featured_until
    assert after_second is not None

    # Second 7-day purchase should extend ~7 more days from the FIRST
    # purchase's featured_until, not overwrite it with "now + 7 days".
    delta = after_second - after_first
    assert timedelta(days=6, hours=23) < delta < timedelta(days=7, hours=1)


# --- Purchase history -----------------------------------------------------


def test_business_purchase_history_is_owner_admin_gated_and_paginated(
    fake_payment_backend,
) -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    for _ in range(2):
        client.post(
            f"/api/v1/businesses/{business['id']}/featured-purchases",
            json={"tier_id": _get_tier_id("7 days"), "phone": "0708374149"},
            headers=_auth_headers(owner_token),
        )

    other_token, _ = _dev_token()
    resp = client.get(
        f"/api/v1/businesses/{business['id']}/featured-purchases",
        headers=_auth_headers(other_token),
    )
    assert resp.status_code == 403

    resp = client.get(
        f"/api/v1/businesses/{business['id']}/featured-purchases",
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2
    assert len(body["items"]) == 2


# --- Sweep-on-read expiry (isolated unit test) ---------------------------


def test_sweep_expired_featured_businesses_and_products() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    product = _create_product(owner_token, business["id"])

    yesterday = datetime.now(UTC) - timedelta(days=1)
    with SessionLocal() as db:
        biz = db.get(Business, uuid.UUID(business["id"]))
        biz.is_featured = True
        biz.featured_until = yesterday
        prod = db.get(Product, uuid.UUID(product["id"]))
        prod.is_featured = True
        prod.featured_until = yesterday
        db.commit()

    with SessionLocal() as db:
        swept_businesses = sweep_expired_featured_businesses(db)
        swept_products = sweep_expired_featured_products(db)
        assert swept_businesses >= 1
        assert swept_products >= 1

    business_row = _fetch_business(business["id"])
    assert business_row.is_featured is False
    assert business_row.featured_until is None

    product_row = _fetch_product(product["id"])
    assert product_row.is_featured is False
    assert product_row.featured_until is None


def test_sweep_does_not_touch_permanently_admin_featured_rows() -> None:
    """featured_until IS NULL for admin-permanent featuring — the sweep's
    WHERE clause explicitly never matches it (see
    app/services/featured_expiry.py's module docstring)."""
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)

    with SessionLocal() as db:
        biz = db.get(Business, uuid.UUID(business["id"]))
        biz.is_featured = True
        biz.featured_until = None
        db.commit()

    with SessionLocal() as db:
        sweep_expired_featured_businesses(db)

    business_row = _fetch_business(business["id"])
    assert business_row.is_featured is True
    assert business_row.featured_until is None


# --- Admin-editable pricing: the snapshot guarantee -----------------------
# The single most important thing this feature must never break (see
# docs/decisions.md's "Admin-editable pricing" entry): a purchase already
# made under a tier's old price/label must be completely unaffected by a
# later edit to (or deactivation of) that tier.


def test_purchase_unaffected_by_later_tier_price_change(fake_payment_backend) -> None:
    admin_token, _ = _dev_token(role="platform_admin")
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)

    tier = client.post(
        "/api/v1/admin/featured-pricing-tiers",
        json={"label": _unique("Snapshot Tier"), "duration_days": 5, "amount_kes": "300.00"},
        headers=_auth_headers(admin_token),
    ).json()

    resp = client.post(
        f"/api/v1/businesses/{business['id']}/featured-purchases",
        json={"tier_id": tier["id"], "phone": "0708374149"},
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 201, resp.text
    purchase = resp.json()
    assert purchase["tier_label"] == tier["label"]
    assert purchase["amount_kes"] == "300.00"
    assert purchase["duration_days"] == 5

    # Now the admin changes the tier's price/duration/label AND deactivates
    # it — none of this may retroactively alter the purchase already made.
    client.patch(
        f"/api/v1/admin/featured-pricing-tiers/{tier['id']}",
        json={
            "label": "Completely Different Label",
            "duration_days": 99,
            "amount_kes": "9999.00",
            "is_active": False,
        },
        headers=_auth_headers(admin_token),
    )

    resp = client.get(
        f"/api/v1/featured-purchases/{purchase['id']}", headers=_auth_headers(owner_token)
    )
    assert resp.status_code == 200
    unchanged = resp.json()
    assert unchanged["tier_label"] == tier["label"]
    assert unchanged["amount_kes"] == "300.00"
    assert unchanged["duration_days"] == 5

    # A brand new purchase against the now-deactivated tier is correctly
    # rejected — deactivating a tier only affects *future* purchases.
    resp = client.post(
        f"/api/v1/businesses/{business['id']}/featured-purchases",
        json={"tier_id": tier["id"], "phone": "0708374149"},
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 400
