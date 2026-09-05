"""Tests for Phase 1b's self-serve advertiser campaign manager:
app/api/v1/endpoints/campaigns.py (owner/admin-facing), the campaign-related
admin moderation additions in app/api/v1/endpoints/admin.py, the
CampaignFunding extension of the shared M-Pesa callback
(app/api/v1/endpoints/payments.py), and the `active_campaign` wiring on
BusinessRead/ProductRead (app/api/v1/endpoints/businesses.py / products.py).

Uses the `fake_payment_backend` fixture (tests/conftest.py, extended this
round to also patch app.api.v1.endpoints.campaigns.get_payment_backend) to
avoid ever hitting real Daraja in the test suite — same pattern as
tests/test_featured_purchases.py.

See docs/decisions.md's "Phase 1b design pass: self-serve advertiser
campaign manager" entry (and its same-day billing-rate-bug follow-up) for
the full design this exercises — the state-machine transition table,
funding/moderation-independence rules, and the atomic-deduction/enum
`.name`-vs-`.value` bug are all documented there, not re-derived here.
"""

from __future__ import annotations

import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from decimal import Decimal

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import app
from app.models.campaign import Campaign, CampaignStatus
from app.models.campaign_funding import CampaignFunding
from app.models.category import Category

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


def _current_cpm_kes() -> Decimal:
    """Reads the *live* CPM rate off the public pricing endpoint rather than
    a hardcoded constant — `app/core/campaign_pricing.py`'s old `CPM_KES`
    constant no longer exists; pricing is DB-backed and admin-editable now
    (app/models/campaign_pricing_settings.py). Tests that assert a freshly
    created campaign snapshots "the current rate" must read that same live
    value, not a stale import-time constant."""
    resp = client.get("/api/v1/campaigns/pricing")
    assert resp.status_code == 200, resp.text
    return Decimal(resp.json()["cpm_kes"])


def _create_business(token: str, **overrides) -> dict:
    payload = {
        "name": _unique("Campaign Test Biz"),
        "description": "Test business for campaign endpoint coverage.",
        "county": "Nairobi",
        "city": "Nairobi",
        "phone": "+254711224560",
    }
    payload.update(overrides)
    resp = client.post("/api/v1/businesses", json=payload, headers=_auth_headers(token))
    assert resp.status_code == 201, resp.text
    return resp.json()


def _create_product(token: str, business_id: str, **overrides) -> dict:
    payload = {"name": _unique("Campaign Test Product"), "price_min": "1000"}
    payload.update(overrides)
    resp = client.post(
        f"/api/v1/businesses/{business_id}/products",
        json=payload,
        headers=_auth_headers(token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _create_campaign(token: str, business_id: str, **overrides) -> dict:
    payload = {"name": _unique("Campaign")}
    payload.update(overrides)
    resp = client.post(
        f"/api/v1/businesses/{business_id}/campaigns",
        json=payload,
        headers=_auth_headers(token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _category_id() -> int:
    db = SessionLocal()
    try:
        category = db.query(Category).filter(Category.slug == "test-cat-campaigns").one_or_none()
        if category is None:
            category = Category(name="Test Category Campaigns", slug="test-cat-campaigns")
            db.add(category)
            db.flush()
        db.commit()
        return category.id
    finally:
        db.close()


def _set_campaign(campaign_id: str, **fields) -> None:
    """Direct DB manipulation to put a campaign into a specific state for a
    controlled test (e.g. a specific budget/cpm/status combination for
    billing/exhaustion tests) — bypasses the full moderation/funding flow on
    purpose, same escape hatch tests/test_featured_purchases.py uses via
    SessionLocal for its sweep tests."""
    with SessionLocal() as db:
        campaign = db.get(Campaign, uuid.UUID(campaign_id))
        assert campaign is not None
        for field, value in fields.items():
            setattr(campaign, field, value)
        db.commit()


def _fetch_campaign(campaign_id: str) -> Campaign:
    with SessionLocal() as db:
        campaign = db.get(Campaign, uuid.UUID(campaign_id))
        assert campaign is not None
        db.expunge(campaign)
        return campaign


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


def _complete_funding(campaign_id: str, token: str, amount_kes: int = 200) -> dict:
    """Initiate + complete a funding transaction via the real endpoints +
    callback, returning the completed CampaignFunding JSON body."""
    resp = client.post(
        f"/api/v1/campaigns/{campaign_id}/funding",
        json={"amount_kes": amount_kes, "phone": "0708374149"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 201, resp.text
    funding = resp.json()
    with SessionLocal() as db:
        row = db.get(CampaignFunding, uuid.UUID(funding["id"]))
        checkout_request_id = row.checkout_request_id
        merchant_request_id = row.merchant_request_id
    callback_resp = client.post(
        CALLBACK_URL,
        json=_success_callback_payload(
            merchant_request_id=merchant_request_id,
            checkout_request_id=checkout_request_id,
            amount=amount_kes,
        ),
    )
    assert callback_resp.status_code == 200
    return funding


# --- Pricing --------------------------------------------------------------


def test_pricing_endpoint_is_public() -> None:
    resp = client.get("/api/v1/campaigns/pricing")
    assert resp.status_code == 200
    body = resp.json()
    cpm = Decimal(body["cpm_kes"])
    assert Decimal(body["cost_per_impression_kes"]) == cpm / 1000
    assert Decimal(body["min_funding_kes"]) > 0


# --- Create -----------------------------------------------------------------


def test_create_campaign_requires_auth() -> None:
    token, _ = _dev_token()
    business = _create_business(token)
    resp = client.post(
        f"/api/v1/businesses/{business['id']}/campaigns", json={"name": "XX"}
    )
    assert resp.status_code == 401


def test_non_owner_cannot_create_campaign() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    other_token, _ = _dev_token()
    resp = client.post(
        f"/api/v1/businesses/{business['id']}/campaigns",
        json={"name": "XX"},
        headers=_auth_headers(other_token),
    )
    assert resp.status_code == 403


def test_create_campaign_happy_path_starts_pending_review_zero_budget() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"], name="My Campaign")

    assert campaign["status"] == "pending_review"
    assert Decimal(campaign["budget_kes"]) == Decimal("0")
    assert Decimal(campaign["spent_kes"]) == Decimal("0")
    assert Decimal(campaign["remaining_kes"]) == Decimal("0")
    assert Decimal(campaign["cpm_kes"]) == _current_cpm_kes()
    assert campaign["product"] is None
    assert campaign["business_id"] == business["id"]


def test_create_campaign_can_target_a_specific_product() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    product = _create_product(owner_token, business["id"])
    campaign = _create_campaign(owner_token, business["id"], product_id=product["id"])
    assert campaign["product"]["id"] == product["id"]


def test_create_campaign_product_id_must_belong_to_the_business() -> None:
    owner_token, _ = _dev_token()
    business_a = _create_business(owner_token)
    business_b = _create_business(owner_token)
    product_b = _create_product(owner_token, business_b["id"])

    resp = client.post(
        f"/api/v1/businesses/{business_a['id']}/campaigns",
        json={"name": "XX", "product_id": product_b["id"]},
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 400


def test_create_campaign_unknown_category_id_is_400() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    resp = client.post(
        f"/api/v1/businesses/{business['id']}/campaigns",
        json={"name": "XX", "category_id": 999999},
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 400


def test_create_campaign_with_targeting() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    category_id = _category_id()
    campaign = _create_campaign(
        owner_token, business["id"], category_id=category_id, county="Kisumu"
    )
    assert campaign["category"]["id"] == category_id
    assert campaign["county"] == "Kisumu"


# --- Get / list -------------------------------------------------------------


def test_get_campaign_is_owner_admin_gated() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])

    other_token, _ = _dev_token()
    resp = client.get(
        f"/api/v1/campaigns/{campaign['id']}", headers=_auth_headers(other_token)
    )
    assert resp.status_code == 403

    admin_token, _ = _dev_token(role="platform_admin")
    resp = client.get(
        f"/api/v1/campaigns/{campaign['id']}", headers=_auth_headers(admin_token)
    )
    assert resp.status_code == 200


def test_list_business_campaigns_is_owner_admin_gated_and_paginated() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    _create_campaign(owner_token, business["id"])
    _create_campaign(owner_token, business["id"])

    other_token, _ = _dev_token()
    resp = client.get(
        f"/api/v1/businesses/{business['id']}/campaigns", headers=_auth_headers(other_token)
    )
    assert resp.status_code == 403

    resp = client.get(
        f"/api/v1/businesses/{business['id']}/campaigns", headers=_auth_headers(owner_token)
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2
    assert len(body["items"]) == 2


# --- PATCH / re-review-on-edit ----------------------------------------------


def test_patch_campaign_requires_ownership() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])

    other_token, _ = _dev_token()
    resp = client.patch(
        f"/api/v1/campaigns/{campaign['id']}",
        json={"name": "New name"},
        headers=_auth_headers(other_token),
    )
    assert resp.status_code == 403


def test_patch_campaign_cannot_change_target() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])
    # product_id isn't even a field on CampaignUpdate — sending it is either
    # ignored (extra field) or 422 depending on pydantic's extra-field
    # policy; either way it must not change the target.
    client.patch(
        f"/api/v1/campaigns/{campaign['id']}",
        json={"name": "Renamed"},
        headers=_auth_headers(owner_token),
    )
    row = _fetch_campaign(campaign["id"])
    assert row.product_id is None


def test_patch_completed_campaign_is_409() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])
    resp = client.post(
        f"/api/v1/campaigns/{campaign['id']}/complete", headers=_auth_headers(owner_token)
    )
    assert resp.status_code == 200
    resp = client.patch(
        f"/api/v1/campaigns/{campaign['id']}",
        json={"name": "New name"},
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 409


def test_patch_active_campaign_resets_to_pending_review(fake_payment_backend) -> None:
    owner_token, _ = _dev_token()
    admin_token, _ = _dev_token(role="platform_admin")
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])
    _complete_funding(campaign["id"], owner_token)
    resp = client.post(
        f"/api/v1/admin/campaigns/{campaign['id']}/approve", headers=_auth_headers(admin_token)
    )
    assert resp.json()["status"] == "active"

    resp = client.patch(
        f"/api/v1/campaigns/{campaign['id']}",
        json={"name": "Edited while active"},
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "pending_review"
    assert resp.json()["moderation_note"] is None


def test_patch_by_admin_does_not_reset_status(fake_payment_backend) -> None:
    owner_token, _ = _dev_token()
    admin_token, _ = _dev_token(role="platform_admin")
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])
    _complete_funding(campaign["id"], owner_token)
    client.post(
        f"/api/v1/admin/campaigns/{campaign['id']}/approve", headers=_auth_headers(admin_token)
    )

    resp = client.patch(
        f"/api/v1/campaigns/{campaign['id']}",
        json={"name": "Admin edit"},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "active"


def test_patch_pending_review_campaign_does_not_force_a_status_change() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])
    resp = client.patch(
        f"/api/v1/campaigns/{campaign['id']}",
        json={"county": "Mombasa"},
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "pending_review"
    assert resp.json()["county"] == "Mombasa"


# --- Pause / resume / complete state machine --------------------------------


def test_pause_requires_active_status() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])
    # Still PENDING_REVIEW — cannot pause.
    resp = client.post(
        f"/api/v1/campaigns/{campaign['id']}/pause", headers=_auth_headers(owner_token)
    )
    assert resp.status_code == 409


def test_pause_and_resume_happy_path() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])
    _set_campaign(campaign["id"], status=CampaignStatus.ACTIVE, budget_kes=Decimal("100"))

    resp = client.post(
        f"/api/v1/campaigns/{campaign['id']}/pause", headers=_auth_headers(owner_token)
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "paused"

    # Cannot pause again from PAUSED.
    resp = client.post(
        f"/api/v1/campaigns/{campaign['id']}/pause", headers=_auth_headers(owner_token)
    )
    assert resp.status_code == 409

    resp = client.post(
        f"/api/v1/campaigns/{campaign['id']}/resume", headers=_auth_headers(owner_token)
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "active"

    # Cannot resume again from ACTIVE.
    resp = client.post(
        f"/api/v1/campaigns/{campaign['id']}/resume", headers=_auth_headers(owner_token)
    )
    assert resp.status_code == 409


def test_resume_requires_paused_status() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])
    # Still PENDING_REVIEW — cannot resume.
    resp = client.post(
        f"/api/v1/campaigns/{campaign['id']}/resume", headers=_auth_headers(owner_token)
    )
    assert resp.status_code == 409


def test_complete_allowed_from_every_non_completed_state_409_from_completed() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)

    for initial_status in (
        CampaignStatus.PENDING_REVIEW,
        CampaignStatus.REJECTED,
        CampaignStatus.APPROVED,
        CampaignStatus.ACTIVE,
        CampaignStatus.PAUSED,
        CampaignStatus.EXHAUSTED,
    ):
        campaign = _create_campaign(owner_token, business["id"])
        _set_campaign(campaign["id"], status=initial_status)
        resp = client.post(
            f"/api/v1/campaigns/{campaign['id']}/complete", headers=_auth_headers(owner_token)
        )
        assert resp.status_code == 200, f"failed from {initial_status}"
        assert resp.json()["status"] == "completed"

        # Double-click: 409 from COMPLETED.
        resp = client.post(
            f"/api/v1/campaigns/{campaign['id']}/complete", headers=_auth_headers(owner_token)
        )
        assert resp.status_code == 409


def test_complete_requires_ownership() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])
    other_token, _ = _dev_token()
    resp = client.post(
        f"/api/v1/campaigns/{campaign['id']}/complete", headers=_auth_headers(other_token)
    )
    assert resp.status_code == 403


# --- Admin moderation: approve/reject state machine -------------------------


def test_approve_requires_pending_review_or_rejected() -> None:
    owner_token, _ = _dev_token()
    admin_token, _ = _dev_token(role="platform_admin")
    business = _create_business(owner_token)

    for blocked_status in (
        CampaignStatus.APPROVED,
        CampaignStatus.ACTIVE,
        CampaignStatus.PAUSED,
        CampaignStatus.EXHAUSTED,
        CampaignStatus.COMPLETED,
    ):
        campaign = _create_campaign(owner_token, business["id"])
        _set_campaign(campaign["id"], status=blocked_status)
        resp = client.post(
            f"/api/v1/admin/campaigns/{campaign['id']}/approve",
            headers=_auth_headers(admin_token),
        )
        assert resp.status_code == 409, f"should not approve from {blocked_status}"


def test_approve_from_pending_review_unfunded_lands_on_approved() -> None:
    owner_token, _ = _dev_token()
    admin_token, _ = _dev_token(role="platform_admin")
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])

    resp = client.post(
        f"/api/v1/admin/campaigns/{campaign['id']}/approve", headers=_auth_headers(admin_token)
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "approved"


def test_approve_from_rejected_unfunded_lands_on_approved() -> None:
    owner_token, _ = _dev_token()
    admin_token, _ = _dev_token(role="platform_admin")
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])
    client.post(
        f"/api/v1/admin/campaigns/{campaign['id']}/reject",
        json={"reason": "policy issue"},
        headers=_auth_headers(admin_token),
    )
    resp = client.post(
        f"/api/v1/admin/campaigns/{campaign['id']}/approve", headers=_auth_headers(admin_token)
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "approved"


def test_reject_requires_rejectable_status() -> None:
    owner_token, _ = _dev_token()
    admin_token, _ = _dev_token(role="platform_admin")
    business = _create_business(owner_token)

    for ok_status in (
        CampaignStatus.PENDING_REVIEW,
        CampaignStatus.APPROVED,
        CampaignStatus.ACTIVE,
        CampaignStatus.PAUSED,
        CampaignStatus.EXHAUSTED,
    ):
        campaign = _create_campaign(owner_token, business["id"])
        _set_campaign(campaign["id"], status=ok_status)
        resp = client.post(
            f"/api/v1/admin/campaigns/{campaign['id']}/reject",
            json={"reason": "policy issue"},
            headers=_auth_headers(admin_token),
        )
        assert resp.status_code == 200, f"should reject from {ok_status}"
        assert resp.json()["status"] == "rejected"
        assert resp.json()["moderation_note"] == "policy issue"

    for blocked_status in (CampaignStatus.REJECTED, CampaignStatus.COMPLETED):
        campaign = _create_campaign(owner_token, business["id"])
        _set_campaign(campaign["id"], status=blocked_status)
        resp = client.post(
            f"/api/v1/admin/campaigns/{campaign['id']}/reject",
            json={"reason": "policy issue"},
            headers=_auth_headers(admin_token),
        )
        assert resp.status_code == 409, f"should not reject from {blocked_status}"


def test_admin_endpoints_require_moderator_role() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])

    resp = client.post(
        f"/api/v1/admin/campaigns/{campaign['id']}/approve", headers=_auth_headers(owner_token)
    )
    assert resp.status_code == 403

    resp = client.get("/api/v1/admin/campaigns", headers=_auth_headers(owner_token))
    assert resp.status_code == 403


def test_admin_list_campaigns_filters_by_status_and_business() -> None:
    owner_token, _ = _dev_token()
    moderator_token, _ = _dev_token(role="content_moderator")
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])

    resp = client.get(
        "/api/v1/admin/campaigns",
        params={"status": "pending_review", "business_id": business["id"]},
        headers=_auth_headers(moderator_token),
    )
    assert resp.status_code == 200
    ids = [c["id"] for c in resp.json()["items"]]
    assert campaign["id"] in ids

    resp = client.get(
        "/api/v1/admin/campaigns",
        params={"status": "active"},
        headers=_auth_headers(moderator_token),
    )
    ids = [c["id"] for c in resp.json()["items"]]
    assert campaign["id"] not in ids


def test_admin_campaign_queue_hides_campaign_whose_business_is_soft_deleted() -> None:
    """Regression guard for the exact `is_active`-filtering bug already found
    and fixed for admin_list_businesses/products/videos (docs/decisions.md)
    — campaigns have no `is_active` of their own, but the admin queue must
    still filter on the *target's* is_active."""
    owner_token, _ = _dev_token()
    moderator_token, _ = _dev_token(role="content_moderator")
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])

    resp = client.get(
        "/api/v1/admin/campaigns",
        params={"status": "pending_review"},
        headers=_auth_headers(moderator_token),
    )
    assert campaign["id"] in [c["id"] for c in resp.json()["items"]]

    resp = client.delete(
        f"/api/v1/businesses/{business['id']}", headers=_auth_headers(owner_token)
    )
    assert resp.status_code == 204

    resp = client.get(
        "/api/v1/admin/campaigns",
        params={"status": "pending_review"},
        headers=_auth_headers(moderator_token),
    )
    assert campaign["id"] not in [c["id"] for c in resp.json()["items"]]


def test_admin_campaign_queue_hides_campaign_whose_product_target_is_soft_deleted() -> None:
    owner_token, _ = _dev_token()
    moderator_token, _ = _dev_token(role="content_moderator")
    business = _create_business(owner_token)
    product = _create_product(owner_token, business["id"])
    campaign = _create_campaign(owner_token, business["id"], product_id=product["id"])

    resp = client.get(
        "/api/v1/admin/campaigns",
        params={"status": "pending_review"},
        headers=_auth_headers(moderator_token),
    )
    assert campaign["id"] in [c["id"] for c in resp.json()["items"]]

    resp = client.delete(
        f"/api/v1/products/{product['id']}", headers=_auth_headers(owner_token)
    )
    assert resp.status_code == 204

    resp = client.get(
        "/api/v1/admin/campaigns",
        params={"status": "pending_review"},
        headers=_auth_headers(moderator_token),
    )
    assert campaign["id"] not in [c["id"] for c in resp.json()["items"]]


# --- Funding initiation ------------------------------------------------------


def test_funding_requires_auth(fake_payment_backend) -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])
    resp = client.post(
        f"/api/v1/campaigns/{campaign['id']}/funding",
        json={"amount_kes": 500, "phone": "0708374149"},
    )
    assert resp.status_code == 401
    assert fake_payment_backend.calls == []


def test_non_owner_cannot_fund_campaign(fake_payment_backend) -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])
    other_token, _ = _dev_token()
    resp = client.post(
        f"/api/v1/campaigns/{campaign['id']}/funding",
        json={"amount_kes": 500, "phone": "0708374149"},
        headers=_auth_headers(other_token),
    )
    assert resp.status_code == 403
    assert fake_payment_backend.calls == []


def test_funding_amount_below_minimum_is_422(fake_payment_backend) -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])
    resp = client.post(
        f"/api/v1/campaigns/{campaign['id']}/funding",
        json={"amount_kes": 50, "phone": "0708374149"},
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 422
    assert fake_payment_backend.calls == []


def test_funding_invalid_phone_is_422(fake_payment_backend) -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])
    resp = client.post(
        f"/api/v1/campaigns/{campaign['id']}/funding",
        json={"amount_kes": 500, "phone": "not-a-phone"},
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 422
    assert fake_payment_backend.calls == []


def test_funding_blocked_on_completed_campaign(fake_payment_backend) -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])
    client.post(
        f"/api/v1/campaigns/{campaign['id']}/complete", headers=_auth_headers(owner_token)
    )
    resp = client.post(
        f"/api/v1/campaigns/{campaign['id']}/funding",
        json={"amount_kes": 500, "phone": "0708374149"},
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 409
    assert fake_payment_backend.calls == []


def test_funding_allowed_while_paused_or_exhausted_or_rejected(fake_payment_backend) -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    for allowed_status in (
        CampaignStatus.PAUSED,
        CampaignStatus.EXHAUSTED,
        CampaignStatus.REJECTED,
        CampaignStatus.APPROVED,
        CampaignStatus.ACTIVE,
    ):
        campaign = _create_campaign(owner_token, business["id"])
        _set_campaign(campaign["id"], status=allowed_status)
        resp = client.post(
            f"/api/v1/campaigns/{campaign['id']}/funding",
            json={"amount_kes": 500, "phone": "0708374149"},
            headers=_auth_headers(owner_token),
        )
        assert resp.status_code == 201, f"funding should be allowed from {allowed_status}"


def test_synchronous_daraja_failure_creates_no_funding_row(fake_payment_backend) -> None:
    from app.services.mpesa import MpesaError

    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])
    fake_payment_backend.next_error = MpesaError("Invalid CallBackURL")

    resp = client.post(
        f"/api/v1/campaigns/{campaign['id']}/funding",
        json={"amount_kes": 500, "phone": "0708374149"},
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 502

    with SessionLocal() as db:
        count = (
            db.query(CampaignFunding)
            .filter(CampaignFunding.campaign_id == uuid.UUID(campaign["id"]))
            .count()
        )
        assert count == 0


def test_funding_poll_is_owner_admin_gated(fake_payment_backend) -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])
    resp = client.post(
        f"/api/v1/campaigns/{campaign['id']}/funding",
        json={"amount_kes": 500, "phone": "0708374149"},
        headers=_auth_headers(owner_token),
    )
    funding = resp.json()
    assert funding["status"] == "pending"

    other_token, _ = _dev_token()
    resp = client.get(
        f"/api/v1/campaign-fundings/{funding['id']}", headers=_auth_headers(other_token)
    )
    assert resp.status_code == 403

    resp = client.get(
        f"/api/v1/campaign-fundings/{funding['id']}", headers=_auth_headers(owner_token)
    )
    assert resp.status_code == 200


def test_funding_history_is_owner_admin_gated_and_paginated(fake_payment_backend) -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])
    for _ in range(2):
        client.post(
            f"/api/v1/campaigns/{campaign['id']}/funding",
            json={"amount_kes": 500, "phone": "0708374149"},
            headers=_auth_headers(owner_token),
        )

    other_token, _ = _dev_token()
    resp = client.get(
        f"/api/v1/campaigns/{campaign['id']}/fundings", headers=_auth_headers(other_token)
    )
    assert resp.status_code == 403

    resp = client.get(
        f"/api/v1/campaigns/{campaign['id']}/fundings", headers=_auth_headers(owner_token)
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2


# --- Funding via the callback: completion + funding/moderation independence -


def test_funding_callback_completes_and_increments_budget(fake_payment_backend) -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])

    funding = _complete_funding(campaign["id"], owner_token, amount_kes=500)
    resp = client.get(
        f"/api/v1/campaign-fundings/{funding['id']}", headers=_auth_headers(owner_token)
    )
    body = resp.json()
    assert body["status"] == "completed"
    assert body["mpesa_receipt_number"] == "NLJ7RT61SV"

    row = _fetch_campaign(campaign["id"])
    assert row.budget_kes == Decimal("500.00")
    # Still PENDING_REVIEW — funding alone never bypasses moderation.
    assert row.status == CampaignStatus.PENDING_REVIEW


def test_funding_callback_failure_records_reason(fake_payment_backend) -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])

    resp = client.post(
        f"/api/v1/campaigns/{campaign['id']}/funding",
        json={"amount_kes": 500, "phone": "0708374149"},
        headers=_auth_headers(owner_token),
    )
    funding = resp.json()
    with SessionLocal() as db:
        row = db.get(CampaignFunding, uuid.UUID(funding["id"]))
        checkout_request_id = row.checkout_request_id
        merchant_request_id = row.merchant_request_id

    callback_resp = client.post(
        CALLBACK_URL,
        json=_failure_callback_payload(
            merchant_request_id=merchant_request_id, checkout_request_id=checkout_request_id
        ),
    )
    assert callback_resp.status_code == 200

    resp = client.get(
        f"/api/v1/campaign-fundings/{funding['id']}", headers=_auth_headers(owner_token)
    )
    body = resp.json()
    assert body["status"] == "failed"

    campaign_row = _fetch_campaign(campaign["id"])
    assert campaign_row.budget_kes == Decimal("0")


def test_pre_funded_then_approved_lands_on_active(fake_payment_backend) -> None:
    """Fund a campaign while it's still PENDING_REVIEW, then approve it —
    should land straight on ACTIVE, not APPROVED, since it already has
    funding headroom (docs/decisions.md's funding/moderation-independence
    rule)."""
    owner_token, _ = _dev_token()
    admin_token, _ = _dev_token(role="platform_admin")
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])

    _complete_funding(campaign["id"], owner_token, amount_kes=500)
    assert _fetch_campaign(campaign["id"]).status == CampaignStatus.PENDING_REVIEW

    resp = client.post(
        f"/api/v1/admin/campaigns/{campaign['id']}/approve", headers=_auth_headers(admin_token)
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "active"


def test_approved_then_funded_lands_on_active(fake_payment_backend) -> None:
    """Reverse order: approve first (unfunded, lands on APPROVED), then fund
    — should flip straight to ACTIVE via apply_campaign_funding()."""
    owner_token, _ = _dev_token()
    admin_token, _ = _dev_token(role="platform_admin")
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])

    resp = client.post(
        f"/api/v1/admin/campaigns/{campaign['id']}/approve", headers=_auth_headers(admin_token)
    )
    assert resp.json()["status"] == "approved"

    _complete_funding(campaign["id"], owner_token, amount_kes=500)
    assert _fetch_campaign(campaign["id"]).status == CampaignStatus.ACTIVE


def test_funding_a_paused_campaign_does_not_override_the_pause(fake_payment_backend) -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])
    _set_campaign(
        campaign["id"],
        status=CampaignStatus.PAUSED,
        budget_kes=Decimal("100"),
        spent_kes=Decimal("0"),
    )

    _complete_funding(campaign["id"], owner_token, amount_kes=500)
    assert _fetch_campaign(campaign["id"]).status == CampaignStatus.PAUSED


def test_funding_an_exhausted_campaign_revives_it_to_active(fake_payment_backend) -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])
    _set_campaign(
        campaign["id"],
        status=CampaignStatus.EXHAUSTED,
        budget_kes=Decimal("100"),
        spent_kes=Decimal("100"),
    )

    _complete_funding(campaign["id"], owner_token, amount_kes=500)
    assert _fetch_campaign(campaign["id"]).status == CampaignStatus.ACTIVE


def test_funding_a_rejected_campaign_does_not_activate_it(fake_payment_backend) -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])
    _set_campaign(campaign["id"], status=CampaignStatus.REJECTED)

    _complete_funding(campaign["id"], owner_token, amount_kes=500)
    assert _fetch_campaign(campaign["id"]).status == CampaignStatus.REJECTED


# --- Impression billing + auto-exhaustion -----------------------------------


def test_impressions_bill_active_campaign_and_ignore_inactive_ones() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    active_campaign = _create_campaign(owner_token, business["id"])
    _set_campaign(
        active_campaign["id"],
        status=CampaignStatus.ACTIVE,
        cpm_kes=Decimal("1000.00"),
        budget_kes=Decimal("100.00"),
        spent_kes=Decimal("0"),
    )
    paused_campaign = _create_campaign(owner_token, business["id"])
    _set_campaign(
        paused_campaign["id"],
        status=CampaignStatus.PAUSED,
        cpm_kes=Decimal("1000.00"),
        budget_kes=Decimal("100.00"),
        spent_kes=Decimal("0"),
    )

    resp = client.post(
        "/api/v1/campaigns/impressions",
        json={"ids": [active_campaign["id"], paused_campaign["id"], str(uuid.uuid4())]},
    )
    assert resp.status_code == 200
    assert resp.json()["updated"] == 1

    active_row = _fetch_campaign(active_campaign["id"])
    assert active_row.impression_count == 1
    assert active_row.spent_kes == Decimal("1.00")  # cpm 1000/1000 = 1.00/impression

    paused_row = _fetch_campaign(paused_campaign["id"])
    assert paused_row.impression_count == 0
    assert paused_row.spent_kes == Decimal("0")


def test_impressions_auto_exhaust_and_further_impressions_bill_zero() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])
    # cpm_kes=1000 -> 1.00 KES/impression; budget for exactly 5 impressions.
    _set_campaign(
        campaign["id"],
        status=CampaignStatus.ACTIVE,
        cpm_kes=Decimal("1000.00"),
        budget_kes=Decimal("5.00"),
        spent_kes=Decimal("0"),
    )

    for _ in range(5):
        resp = client.post(
            "/api/v1/campaigns/impressions", json={"ids": [campaign["id"]]}
        )
        assert resp.json()["updated"] == 1

    row = _fetch_campaign(campaign["id"])
    assert row.spent_kes == Decimal("5.00")
    assert row.budget_kes == Decimal("5.00")
    assert row.status == CampaignStatus.EXHAUSTED
    assert row.impression_count == 5

    # A further impression against the now-exhausted campaign bills 0.
    resp = client.post("/api/v1/campaigns/impressions", json={"ids": [campaign["id"]]})
    assert resp.json()["updated"] == 0
    row_after = _fetch_campaign(campaign["id"])
    assert row_after.spent_kes == Decimal("5.00")
    assert row_after.impression_count == 5


def test_impressions_bill_each_campaigns_own_snapshotted_cpm_not_the_global_constant() -> None:
    """Regression guard for the exact billing-rate bug documented in
    docs/decisions.md's same-day follow-up entry: an earlier implementation
    billed the module-level COST_PER_IMPRESSION_KES constant directly
    instead of each row's own snapshotted cpm_kes. Two campaigns created
    under different "historical" rates must each be billed correctly in the
    same batch call."""
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    cheap_campaign = _create_campaign(owner_token, business["id"])
    _set_campaign(
        cheap_campaign["id"],
        status=CampaignStatus.ACTIVE,
        cpm_kes=Decimal("100.00"),  # 0.10 KES/impression
        budget_kes=Decimal("10.00"),
        spent_kes=Decimal("0"),
    )
    expensive_campaign = _create_campaign(owner_token, business["id"])
    _set_campaign(
        expensive_campaign["id"],
        status=CampaignStatus.ACTIVE,
        cpm_kes=Decimal("2000.00"),  # 2.00 KES/impression
        budget_kes=Decimal("10.00"),
        spent_kes=Decimal("0"),
    )

    resp = client.post(
        "/api/v1/campaigns/impressions",
        json={"ids": [cheap_campaign["id"], expensive_campaign["id"]]},
    )
    assert resp.json()["updated"] == 2

    assert _fetch_campaign(cheap_campaign["id"]).spent_kes == Decimal("0.10")
    assert _fetch_campaign(expensive_campaign["id"]).spent_kes == Decimal("2.00")


def test_concurrent_impressions_never_overspend_the_budget() -> None:
    """Regression test for the atomic-deduction race condition documented in
    docs/decisions.md — the design pass's own bug (enum `.name` vs `.value`
    in the SQL CASE) "would have been caught by exactly such a test existing
    already". Fires real concurrent HTTP requests (not sequential calls, not
    a direct service-layer call) at the batch impressions endpoint against a
    campaign funded for exactly 10 impressions, from 30 threads."""
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])
    _set_campaign(
        campaign["id"],
        status=CampaignStatus.ACTIVE,
        cpm_kes=Decimal("1000.00"),  # 1.00 KES/impression
        budget_kes=Decimal("10.00"),  # exactly 10 impressions' worth
        spent_kes=Decimal("0"),
    )

    def _fire() -> int:
        resp = client.post(
            "/api/v1/campaigns/impressions", json={"ids": [campaign["id"]]}
        )
        assert resp.status_code == 200
        return resp.json()["updated"]

    with ThreadPoolExecutor(max_workers=30) as pool:
        results = list(pool.map(lambda _: _fire(), range(30)))

    assert sum(results) == 10

    row = _fetch_campaign(campaign["id"])
    assert row.impression_count == 10
    assert row.spent_kes == Decimal("10.00")
    assert row.budget_kes == Decimal("10.00")
    assert row.status == CampaignStatus.EXHAUSTED


# --- Clicks: analytics-only, never billed -----------------------------------


def test_clicks_increment_click_count_but_never_spend() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])
    _set_campaign(
        campaign["id"],
        status=CampaignStatus.ACTIVE,
        cpm_kes=Decimal("1000.00"),
        budget_kes=Decimal("10.00"),
        spent_kes=Decimal("0"),
    )

    resp = client.post("/api/v1/campaigns/clicks", json={"ids": [campaign["id"]]})
    assert resp.status_code == 200
    assert resp.json()["updated"] == 1

    row = _fetch_campaign(campaign["id"])
    assert row.click_count == 1
    assert row.spent_kes == Decimal("0")
    assert row.impression_count == 0


def test_clicks_ignore_inactive_campaigns() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])  # PENDING_REVIEW

    resp = client.post("/api/v1/campaigns/clicks", json={"ids": [campaign["id"]]})
    assert resp.json()["updated"] == 0
    assert _fetch_campaign(campaign["id"]).click_count == 0


# --- active_campaign exposure on BusinessRead/ProductRead -------------------


def test_business_scoped_active_campaign_appears_only_on_the_business() -> None:
    owner_token, _ = _dev_token()
    admin_token, _ = _dev_token(role="platform_admin")
    business = _create_business(owner_token)
    product = _create_product(owner_token, business["id"])
    campaign = _create_campaign(owner_token, business["id"])
    category_id = _category_id()
    _set_campaign(
        campaign["id"],
        status=CampaignStatus.ACTIVE,
        category_id=category_id,
        county="Nairobi",
        budget_kes=Decimal("100"),
    )

    # Direct GET by id works regardless of verification status (see
    # get_business's own docstring), so no need to verify the business for
    # this assertion.
    resp = client.get(f"/api/v1/businesses/{business['id']}")
    body = resp.json()
    assert body["active_campaign"] is not None
    assert body["active_campaign"]["campaign_id"] == campaign["id"]
    assert body["active_campaign"]["category_id"] == category_id
    assert body["active_campaign"]["county"] == "Nairobi"

    # The public LIST only shows VERIFIED businesses — verify it first so
    # the county-filtered list assertion below has something to match.
    client.post(
        f"/api/v1/businesses/{business['id']}/submit-for-verification",
        headers=_auth_headers(owner_token),
    )
    client.post(
        f"/api/v1/admin/businesses/{business['id']}/approve", headers=_auth_headers(admin_token)
    )
    resp = client.get("/api/v1/businesses", params={"county": "Nairobi"})
    matching = [b for b in resp.json()["items"] if b["id"] == business["id"]]
    assert len(matching) == 1
    assert matching[0]["active_campaign"]["campaign_id"] == campaign["id"]

    # Must NOT leak onto the business's own product.
    resp = client.get(f"/api/v1/products/{product['id']}")
    assert resp.json()["active_campaign"] is None


def test_product_scoped_active_campaign_appears_only_on_the_product() -> None:
    owner_token, _ = _dev_token()
    admin_token, _ = _dev_token(role="platform_admin")
    business = _create_business(owner_token)
    product = _create_product(owner_token, business["id"])
    client.post(
        f"/api/v1/admin/products/{product['id']}/approve", headers=_auth_headers(admin_token)
    )
    campaign = _create_campaign(owner_token, business["id"], product_id=product["id"])
    _set_campaign(campaign["id"], status=CampaignStatus.ACTIVE, budget_kes=Decimal("100"))

    resp = client.get(f"/api/v1/products/{product['id']}")
    body = resp.json()
    assert body["active_campaign"] is not None
    assert body["active_campaign"]["campaign_id"] == campaign["id"]

    resp = client.get("/api/v1/products", params={"business_id": business["id"]})
    matching = [p for p in resp.json()["items"] if p["id"] == product["id"]]
    assert len(matching) == 1
    assert matching[0]["active_campaign"]["campaign_id"] == campaign["id"]

    # Must NOT leak onto the parent business.
    resp = client.get(f"/api/v1/businesses/{business['id']}")
    assert resp.json()["active_campaign"] is None


def test_non_active_campaign_status_never_exposed_as_active_campaign() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])

    for non_active_status in (
        CampaignStatus.PENDING_REVIEW,
        CampaignStatus.APPROVED,
        CampaignStatus.REJECTED,
        CampaignStatus.PAUSED,
        CampaignStatus.EXHAUSTED,
        CampaignStatus.COMPLETED,
    ):
        _set_campaign(campaign["id"], status=non_active_status)
        resp = client.get(f"/api/v1/businesses/{business['id']}")
        assert resp.json()["active_campaign"] is None, f"leaked for {non_active_status}"


# --- Phase 1b analytics read endpoints: campaign timeseries + projection ----
#
# See docs/decisions.md's "core analytics: daily timeseries layer" entry
# (and its 2026-09-05 read-endpoint follow-up) for the full design these
# exercise. `record_campaign_impressions_daily`/`record_campaign_clicks_daily`
# (app/services/daily_stats.py) always write to *today*'s row — to seed a
# few genuinely different calendar days (not just repeated today-writes),
# these tests monkeypatch that module's `_today()` for the duration of each
# write, same "use the real upsert functions, not raw SQL" instruction the
# task brief gave explicitly. This is still the real, production write path
# — only the notion of "what day is it" is faked, exactly like freezegun
# would, without adding a new dependency for one test module.


def _seed_campaign_daily_spend(monkeypatch, campaign_id: str, day: date, cost_kes: Decimal) -> None:
    """Seeds exactly one impression's worth of spend (`cost_kes`) into
    `campaign_daily_stats` for `day`, via the real
    `record_campaign_impressions_daily` upsert function."""
    from app.services import daily_stats as daily_stats_module

    monkeypatch.setattr(daily_stats_module, "_today", lambda: day)
    with SessionLocal() as db:
        daily_stats_module.record_campaign_impressions_daily(
            db, {uuid.UUID(campaign_id): cost_kes}
        )
        db.commit()


def test_campaign_stats_timeseries_zero_fills_and_projects_budget_exhaustion(
    monkeypatch,
) -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])
    _set_campaign(campaign["id"], budget_kes=Decimal("1000"), spent_kes=Decimal("300"))

    today = date.today()
    # Trailing 7 days (today back 6 days): KES 50/day spend -> avg 50/day.
    for n in range(7):
        _seed_campaign_daily_spend(
            monkeypatch, campaign["id"], today - timedelta(days=n), Decimal("50")
        )
    # Outside the trailing-7 window but inside the requested 30-day range:
    # a much bigger spend day that must NOT pull the trailing average up.
    old_day = today - timedelta(days=15)
    _seed_campaign_daily_spend(monkeypatch, campaign["id"], old_day, Decimal("500"))

    resp = client.get(
        f"/api/v1/campaigns/{campaign['id']}/stats/timeseries?days=30",
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["campaign_id"] == campaign["id"]
    assert len(body["days"]) == 30

    by_date = {d["date"]: d for d in body["days"]}
    assert Decimal(by_date[str(today)]["spend_kes"]) == Decimal("50")
    assert by_date[str(today)]["impressions"] == 1
    assert Decimal(by_date[str(old_day)]["spend_kes"]) == Decimal("500")

    # Zero-fill: a day with genuinely no activity (between the trailing
    # window and old_day) is a real row, not an absent one.
    gap_day = today - timedelta(days=10)
    gap_row = by_date[str(gap_day)]
    assert gap_row["impressions"] == 0
    assert gap_row["clicks"] == 0
    assert Decimal(gap_row["spend_kes"]) == Decimal("0")

    # remaining_kes = 1000 - 300 = 700; trailing-7-day avg = 350/7 = 50/day
    # (old_day's 500 must be excluded from the trailing average);
    # projected_days_remaining = 700 / 50 = 14.0.
    assert Decimal(body["remaining_kes"]) == Decimal("700")
    assert Decimal(body["avg_daily_spend_kes"]) == Decimal("50")
    assert body["projected_days_remaining"] == 14.0


def test_campaign_stats_timeseries_no_recent_spend_projection_is_null() -> None:
    """A campaign with budget remaining but zero spend in the trailing
    window has no meaningful "days until exhausted" — must be `None`, never
    a ZeroDivisionError or `Infinity`."""
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])
    _set_campaign(campaign["id"], budget_kes=Decimal("500"), spent_kes=Decimal("100"))

    resp = client.get(
        f"/api/v1/campaigns/{campaign['id']}/stats/timeseries?days=30",
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body["days"]) == 30
    assert all(Decimal(d["spend_kes"]) == Decimal("0") for d in body["days"])
    assert Decimal(body["avg_daily_spend_kes"]) == Decimal("0")
    assert body["projected_days_remaining"] is None
    # remaining_kes is still real/reported even with no projection.
    assert Decimal(body["remaining_kes"]) == Decimal("400")


def test_campaign_stats_timeseries_already_exhausted_with_recent_spend_is_zero_days() -> None:
    """budget fully spent + real recent spend -> a real, sane 0.0, not a
    negative number or None."""
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])
    _set_campaign(campaign["id"], budget_kes=Decimal("100"), spent_kes=Decimal("100"))

    with SessionLocal() as db:
        from app.services.daily_stats import record_campaign_impressions_daily

        record_campaign_impressions_daily(db, {uuid.UUID(campaign["id"]): Decimal("25")})
        db.commit()

    resp = client.get(
        f"/api/v1/campaigns/{campaign['id']}/stats/timeseries?days=7",
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert Decimal(body["remaining_kes"]) == Decimal("0")
    assert Decimal(body["avg_daily_spend_kes"]) > Decimal("0")
    assert body["projected_days_remaining"] == 0.0


def test_campaign_stats_timeseries_is_owner_admin_gated() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    campaign = _create_campaign(owner_token, business["id"])

    other_token, _ = _dev_token()
    resp = client.get(
        f"/api/v1/campaigns/{campaign['id']}/stats/timeseries",
        headers=_auth_headers(other_token),
    )
    assert resp.status_code == 403

    admin_token, _ = _dev_token(role="platform_admin")
    resp = client.get(
        f"/api/v1/campaigns/{campaign['id']}/stats/timeseries",
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200
