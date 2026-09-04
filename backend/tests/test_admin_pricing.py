"""Admin-editable platform ad pricing — Featured Placement's pricing tiers
(`app/models/featured_pricing_tier.py`) and the Ad Campaign manager's CPM
rate / minimum funding (`app/models/campaign_pricing_settings.py`).

See docs/decisions.md's "Admin-editable pricing" entry for the full design
writeup. Same TestClient + real-DB pattern as
tests/test_admin_categories_users.py (this feature's admin CRUD mirrors
Category's exact shape) and tests/test_featured_purchases.py /
tests/test_campaigns.py (whose own pricing-related tests this file
complements rather than duplicates — the "a purchase/campaign already
created is unaffected by a later price change" guarantee is tested end to
end there, using the real purchase/campaign-creation endpoints; this file
focuses on the admin CRUD surface itself).

**Global-settings-row caution, specific to this file**: unlike a business or
category (created fresh, uniquely named, per test), `campaign_pricing_
settings` is a *singleton* row shared by the whole session-scoped isolated
test database — which, per tests/conftest.py, persists across separate
`pytest` invocations, not just within one run. Any test here that PATCHes
it must restore the original values before finishing, or it would silently
change the baseline every other test in this suite (e.g.
tests/test_campaigns.py's minimum-funding-amount tests) assumes going
forward. The featured-pricing-tier tests don't have this problem — they
always create a fresh tier to mutate, never touching the two real seeded
tiers ("7 days"/"30 days") that other tests resolve by label.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


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


# --- Featured pricing tiers: admin CRUD ------------------------------------


def test_non_admin_cannot_manage_featured_pricing_tiers() -> None:
    token, _ = _dev_token()
    resp = client.post(
        "/api/v1/admin/featured-pricing-tiers",
        json={"label": _unique("Sneaky Tier"), "duration_days": 3, "amount_kes": "100.00"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 403

    admin_token, _ = _dev_token(role="platform_admin")
    created = client.post(
        "/api/v1/admin/featured-pricing-tiers",
        json={"label": _unique("Real Tier"), "duration_days": 3, "amount_kes": "100.00"},
        headers=_auth_headers(admin_token),
    ).json()
    resp = client.patch(
        f"/api/v1/admin/featured-pricing-tiers/{created['id']}",
        json={"is_active": False},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 403

    resp = client.get("/api/v1/admin/featured-pricing-tiers", headers=_auth_headers(token))
    assert resp.status_code == 403


def test_admin_can_create_tier_with_any_duration_and_price() -> None:
    """Fully flexible — not locked to 7/30 days (PM decision, see
    docs/decisions.md)."""
    admin_token, _ = _dev_token(role="platform_admin")
    label = _unique("Launch Special")
    resp = client.post(
        "/api/v1/admin/featured-pricing-tiers",
        json={"label": label, "duration_days": 10, "amount_kes": "750.50"},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["label"] == label
    assert body["duration_days"] == 10
    assert body["amount_kes"] == "750.50"
    assert body["is_active"] is True
    assert isinstance(body["id"], int)

    # Immediately visible on the public pricing endpoint.
    public = client.get("/api/v1/featured/pricing").json()
    assert any(item["id"] == body["id"] for item in public)


def test_admin_can_edit_and_deactivate_reactivate_a_tier() -> None:
    admin_token, _ = _dev_token(role="platform_admin")
    created = client.post(
        "/api/v1/admin/featured-pricing-tiers",
        json={"label": _unique("Edit Me"), "duration_days": 14, "amount_kes": "900.00"},
        headers=_auth_headers(admin_token),
    ).json()

    new_label = _unique("Edited Label")
    resp = client.patch(
        f"/api/v1/admin/featured-pricing-tiers/{created['id']}",
        json={"label": new_label, "duration_days": 21, "amount_kes": "1234.56"},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["label"] == new_label
    assert body["duration_days"] == 21
    assert body["amount_kes"] == "1234.56"
    assert body["is_active"] is True

    # Deactivate: disappears from the public list, still visible to admins.
    resp = client.patch(
        f"/api/v1/admin/featured-pricing-tiers/{created['id']}",
        json={"is_active": False},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False

    public_ids = {item["id"] for item in client.get("/api/v1/featured/pricing").json()}
    assert created["id"] not in public_ids

    admin_list = client.get(
        "/api/v1/admin/featured-pricing-tiers", headers=_auth_headers(admin_token)
    ).json()
    admin_ids = {item["id"] for item in admin_list}
    assert created["id"] in admin_ids

    # Reactivate: back on the public list.
    resp = client.patch(
        f"/api/v1/admin/featured-pricing-tiers/{created['id']}",
        json={"is_active": True},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200
    public_ids = {item["id"] for item in client.get("/api/v1/featured/pricing").json()}
    assert created["id"] in public_ids


def test_update_unknown_tier_id_is_404() -> None:
    admin_token, _ = _dev_token(role="platform_admin")
    resp = client.patch(
        "/api/v1/admin/featured-pricing-tiers/999999999",
        json={"is_active": False},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 404


def test_create_tier_rejects_non_positive_values() -> None:
    admin_token, _ = _dev_token(role="platform_admin")
    resp = client.post(
        "/api/v1/admin/featured-pricing-tiers",
        json={"label": _unique("Bad Tier"), "duration_days": 0, "amount_kes": "100.00"},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 422

    resp = client.post(
        "/api/v1/admin/featured-pricing-tiers",
        json={"label": _unique("Bad Tier"), "duration_days": 5, "amount_kes": "0.00"},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 422


# --- Campaign pricing settings: admin update --------------------------------


def test_non_admin_cannot_update_campaign_pricing() -> None:
    token, _ = _dev_token()
    resp = client.patch(
        "/api/v1/admin/campaign-pricing",
        json={"cpm_kes": "999.00"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 403


def test_admin_campaign_pricing_update_is_immediate_and_never_retroactive(
    fake_payment_backend,
) -> None:
    admin_token, _ = _dev_token(role="platform_admin")
    owner_token, _ = _dev_token()

    # Capture the original settings so this test can restore them at the end
    # — campaign_pricing_settings is a singleton row shared across this
    # whole (persistent-across-runs) isolated test database, see module
    # docstring.
    original = client.get("/api/v1/campaigns/pricing").json()

    # Create a business + campaign under the *current* (pre-change) rate.
    business = client.post(
        "/api/v1/businesses",
        json={
            "name": _unique("Pricing Test Biz"),
            "description": "Test business for admin pricing coverage.",
            "county": "Nairobi",
            "city": "Nairobi",
            "phone": "+254711224560",
        },
        headers=_auth_headers(owner_token),
    ).json()
    campaign = client.post(
        f"/api/v1/businesses/{business['id']}/campaigns",
        json={"name": "Pre-change campaign"},
        headers=_auth_headers(owner_token),
    ).json()
    original_cpm = Decimal(campaign["cpm_kes"])
    assert original_cpm == Decimal(original["cpm_kes"])

    try:
        new_cpm = original_cpm + Decimal("250.00")
        new_min_funding = Decimal(original["min_funding_kes"]) + Decimal("50.00")

        resp = client.patch(
            "/api/v1/admin/campaign-pricing",
            json={"cpm_kes": str(new_cpm), "min_funding_kes": str(new_min_funding)},
            headers=_auth_headers(admin_token),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert Decimal(body["cpm_kes"]) == new_cpm
        assert Decimal(body["min_funding_kes"]) == new_min_funding
        assert Decimal(body["cost_per_impression_kes"]) == new_cpm / 1000

        # Public pricing endpoint reflects the change immediately.
        live = client.get("/api/v1/campaigns/pricing").json()
        assert Decimal(live["cpm_kes"]) == new_cpm
        assert Decimal(live["min_funding_kes"]) == new_min_funding

        # The campaign created BEFORE the rate change keeps its original
        # snapshotted cpm_kes — the core "never retroactively alter an
        # existing campaign's economics" guarantee.
        unchanged = client.get(
            f"/api/v1/campaigns/{campaign['id']}", headers=_auth_headers(owner_token)
        ).json()
        assert Decimal(unchanged["cpm_kes"]) == original_cpm

        # A NEW campaign created AFTER the change snapshots the new rate.
        new_campaign = client.post(
            f"/api/v1/businesses/{business['id']}/campaigns",
            json={"name": "Post-change campaign"},
            headers=_auth_headers(owner_token),
        ).json()
        assert Decimal(new_campaign["cpm_kes"]) == new_cpm
    finally:
        # Restore the singleton settings row so no other test in this
        # (persistent) isolated test database inherits a changed baseline.
        client.patch(
            "/api/v1/admin/campaign-pricing",
            json={"cpm_kes": original["cpm_kes"], "min_funding_kes": original["min_funding_kes"]},
            headers=_auth_headers(admin_token),
        )
        restored = client.get("/api/v1/campaigns/pricing").json()
        assert restored == original


def test_campaign_funding_minimum_uses_live_settings_value(fake_payment_backend) -> None:
    """The `min_funding_kes` floor a `POST /campaigns/{id}/funding` call is
    validated against is read live, not a stale import-time constant — see
    docs/decisions.md."""
    admin_token, _ = _dev_token(role="platform_admin")
    owner_token, _ = _dev_token()
    original = client.get("/api/v1/campaigns/pricing").json()

    business = client.post(
        "/api/v1/businesses",
        json={
            "name": _unique("Funding Min Test Biz"),
            "description": "Test business for live minimum-funding coverage.",
            "county": "Nairobi",
            "city": "Nairobi",
            "phone": "+254711224560",
        },
        headers=_auth_headers(owner_token),
    ).json()
    campaign = client.post(
        f"/api/v1/businesses/{business['id']}/campaigns",
        json={"name": "Funding min test campaign"},
        headers=_auth_headers(owner_token),
    ).json()

    try:
        # Raise the minimum well above a value that used to be acceptable.
        new_min = Decimal(original["min_funding_kes"]) + Decimal("1000.00")
        client.patch(
            "/api/v1/admin/campaign-pricing",
            json={"min_funding_kes": str(new_min)},
            headers=_auth_headers(admin_token),
        )

        # An amount that satisfies the OLD minimum but not the new one 422s.
        resp = client.post(
            f"/api/v1/campaigns/{campaign['id']}/funding",
            json={"amount_kes": str(original["min_funding_kes"]), "phone": "0708374149"},
            headers=_auth_headers(owner_token),
        )
        assert resp.status_code == 422
        assert fake_payment_backend.calls == []

        # An amount that satisfies the NEW minimum succeeds.
        resp = client.post(
            f"/api/v1/campaigns/{campaign['id']}/funding",
            json={"amount_kes": str(new_min), "phone": "0708374149"},
            headers=_auth_headers(owner_token),
        )
        assert resp.status_code == 201, resp.text
    finally:
        client.patch(
            "/api/v1/admin/campaign-pricing",
            json={"cpm_kes": original["cpm_kes"], "min_funding_kes": original["min_funding_kes"]},
            headers=_auth_headers(admin_token),
        )
