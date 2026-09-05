"""End-to-end tests for the Sprint 2 business/product core: ownership CRUD,
manual verification workflow, product CRUD + moderation, and the admin
moderation queue endpoints.

Runs against a real Postgres (see .github/workflows/ci.yml / docker-compose)
via TestClient + the app's normal DB session — same pattern as
test_health.py. Uses randomised emails/names per test so re-runs against a
shared dev database don't collide with previous runs' data.
"""

from __future__ import annotations

import io
import uuid
from datetime import date, timedelta
from decimal import Decimal

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import app
from app.models.business import Business
from app.models.category import Category
from app.models.product import Product
from app.models.video import Video

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


def _create_business(token: str, **overrides) -> dict:
    payload = {
        "name": _unique("AquaTank Test"),
        "description": "Rotomoulded water tanks.",
        "county": "Nairobi",
        "city": "Nairobi",
        "phone": "+254711224560",
    }
    payload.update(overrides)
    resp = client.post("/api/v1/businesses", json=payload, headers=_auth_headers(token))
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_dev_token_creates_user_and_is_idempotent() -> None:
    email = f"{_unique('user')}@example.com"
    resp1 = client.post("/api/v1/dev/token", json={"email": email})
    resp2 = client.post("/api/v1/dev/token", json={"email": email})
    assert resp1.status_code == 200
    assert resp2.status_code == 200
    assert resp1.json()["user"]["id"] == resp2.json()["user"]["id"]


def test_business_requires_auth_to_create() -> None:
    resp = client.post("/api/v1/businesses", json={"name": "No Auth Biz"})
    assert resp.status_code == 401


def test_business_create_and_owner_can_manage() -> None:
    token, user = _dev_token()
    business = _create_business(token)

    assert business["verification_status"] == "unverified"
    assert business["owner_id"] == user["id"]
    assert business["product_count"] == 0

    # Owner can fetch and patch their own business.
    resp = client.get(f"/api/v1/businesses/{business['id']}")
    assert resp.status_code == 200

    resp = client.patch(
        f"/api/v1/businesses/{business['id']}",
        json={"description": "Updated description."},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200
    assert resp.json()["description"] == "Updated description."

    # A different user cannot manage it.
    other_token, _ = _dev_token()
    resp = client.patch(
        f"/api/v1/businesses/{business['id']}",
        json={"description": "Hijacked"},
        headers=_auth_headers(other_token),
    )
    assert resp.status_code == 403


def test_business_not_visible_publicly_until_verified() -> None:
    token, _ = _dev_token()
    business = _create_business(token)

    resp = client.get("/api/v1/businesses", params={"q": business["name"]})
    assert resp.status_code == 200
    assert resp.json()["total"] == 0  # unverified, so hidden from public directory


def test_verification_workflow_full_cycle() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    business_id = business["id"]

    # Can't approve/reject before it's submitted (still unverified).
    admin_token, _ = _dev_token(role="platform_admin")
    resp = client.post(
        f"/api/v1/admin/businesses/{business_id}/approve",
        json={},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 409

    # Owner submits for review: unverified -> pending.
    resp = client.post(
        f"/api/v1/businesses/{business_id}/submit-for-verification",
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 200
    assert resp.json()["verification_status"] == "pending"

    # Non-admin/moderator cannot approve.
    resp = client.post(
        f"/api/v1/admin/businesses/{business_id}/approve",
        json={},
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 403

    # Moderator (or admin) approves: pending -> verified.
    moderator_token, _ = _dev_token(role="content_moderator")
    resp = client.post(
        f"/api/v1/admin/businesses/{business_id}/approve",
        json={"note": "Docs checked out."},
        headers=_auth_headers(moderator_token),
    )
    assert resp.status_code == 200
    assert resp.json()["verification_status"] == "verified"

    # Now it shows up in the public directory.
    resp = client.get("/api/v1/businesses", params={"q": business["name"]})
    assert resp.json()["total"] == 1


def test_verification_reject_workflow() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    client.post(
        f"/api/v1/businesses/{business['id']}/submit-for-verification",
        headers=_auth_headers(owner_token),
    )

    admin_token, _ = _dev_token(role="platform_admin")
    resp = client.post(
        f"/api/v1/admin/businesses/{business['id']}/reject",
        json={"reason": "Missing business registration certificate."},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["verification_status"] == "rejected"
    assert body["verification_note"] == "Missing business registration certificate."

    # Owner can resubmit from rejected.
    resp = client.post(
        f"/api/v1/businesses/{business['id']}/submit-for-verification",
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 200
    assert resp.json()["verification_status"] == "pending"


def test_business_reject_after_approval_hides_it_immediately() -> None:
    """A previously-verified business is a legitimate reject target (e.g. a
    policy violation found after the fact) — not just a pending one. Once
    rejected, it must disappear from the public directory right away, and an
    already-rejected business can't be rejected again (double-click safety)."""
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    client.post(
        f"/api/v1/businesses/{business['id']}/submit-for-verification",
        headers=_auth_headers(owner_token),
    )
    admin_token, _ = _dev_token(role="platform_admin")
    resp = client.post(
        f"/api/v1/admin/businesses/{business['id']}/approve",
        json={},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["verification_status"] == "verified"

    resp = client.get("/api/v1/businesses", params={"q": business["name"]})
    assert resp.json()["total"] == 1

    resp = client.post(
        f"/api/v1/admin/businesses/{business['id']}/reject",
        json={"reason": "Policy violation discovered post-approval."},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["verification_status"] == "rejected"
    assert body["verification_note"] == "Policy violation discovered post-approval."

    resp = client.get("/api/v1/businesses", params={"q": business["name"]})
    assert resp.json()["total"] == 0  # immediately hidden from public directory

    # Rejecting an already-rejected business is a no-op 409, not a silent success.
    resp = client.post(
        f"/api/v1/admin/businesses/{business['id']}/reject",
        json={"reason": "Again"},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 409

    # Admin can reverse the rejection straight back to verified.
    resp = client.post(
        f"/api/v1/admin/businesses/{business['id']}/approve",
        json={"note": "Reviewed again, issue resolved."},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["verification_status"] == "verified"

    resp = client.get("/api/v1/businesses", params={"q": business["name"]})
    assert resp.json()["total"] == 1

    # Approving an already-verified business is a no-op 409.
    resp = client.post(
        f"/api/v1/admin/businesses/{business['id']}/approve",
        json={},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 409


def test_product_lifecycle_and_moderation() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)

    product_payload = {
        "name": _unique("5000L Tank"),
        "description": "Rotomoulded polyethylene tank.",
        "specs": {"Capacity": "5,000 Litres", "Material": "Polyethylene"},
        "price_min": "42500.00",
        "price_max": "42500.00",
        "warranty_terms": "5 Years",
        "availability_status": "in_stock",
    }
    resp = client.post(
        f"/api/v1/businesses/{business['id']}/products",
        json=product_payload,
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 201, resp.text
    product = resp.json()
    assert product["moderation_status"] == "pending"
    # Location fell back to the business's location.
    assert product["county"] == business["county"]
    assert product["business"]["id"] == business["id"]

    # Not visible in public listing yet (pending).
    resp = client.get("/api/v1/products", params={"business_id": business["id"]})
    assert resp.json()["total"] == 0

    # Owner can see it via include_unapproved.
    resp = client.get(
        "/api/v1/products",
        params={"business_id": business["id"], "include_unapproved": True},
        headers=_auth_headers(owner_token),
    )
    assert resp.json()["total"] == 1

    # Approve it.
    admin_token, _ = _dev_token(role="platform_admin")
    resp = client.post(
        f"/api/v1/admin/products/{product['id']}/approve",
        json={},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["moderation_status"] == "approved"

    # Now public.
    resp = client.get("/api/v1/products", params={"business_id": business["id"]})
    assert resp.json()["total"] == 1

    # Owner editing resets moderation to pending.
    resp = client.patch(
        f"/api/v1/products/{product['id']}",
        json={"description": "Updated copy."},
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 200
    assert resp.json()["moderation_status"] == "pending"

    resp = client.get("/api/v1/products", params={"business_id": business["id"]})
    assert resp.json()["total"] == 0


def test_removed_product_stays_gone_from_owner_view() -> None:
    """Regression test: `include_unapproved=True` used to drop the is_active
    filter along with the moderation-status one, so an owner's soft-deleted
    ("removed") product kept reappearing in their own dashboard forever,
    indistinguishable from a live pending listing. is_active must always be
    enforced regardless of include_unapproved."""
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    resp = client.post(
        f"/api/v1/businesses/{business['id']}/products",
        json={"name": _unique("Soon Removed")},
        headers=_auth_headers(owner_token),
    )
    product = resp.json()

    resp = client.get(
        "/api/v1/products",
        params={"business_id": business["id"], "include_unapproved": True},
        headers=_auth_headers(owner_token),
    )
    assert resp.json()["total"] == 1

    resp = client.delete(
        f"/api/v1/products/{product['id']}", headers=_auth_headers(owner_token)
    )
    assert resp.status_code == 204

    resp = client.get(
        "/api/v1/products",
        params={"business_id": business["id"], "include_unapproved": True},
        headers=_auth_headers(owner_token),
    )
    assert resp.json()["total"] == 0


def test_admin_product_queue_hides_soft_deleted_product() -> None:
    """Regression guard, found live on the production Admin Panel (not
    written speculatively): GET /admin/products never filtered on
    is_active, so a soft-deleted product that was still pending kept
    showing up in the moderation queue (and the Overview's combined review
    queue + KPI count) forever. A different endpoint than
    test_removed_product_stays_gone_from_owner_view's owner-view regression,
    same underlying gap - is_active must always be enforced here too."""
    owner_token, _ = _dev_token()
    admin_token, _ = _dev_token(role="platform_admin")
    business = _create_business(owner_token)
    resp = client.post(
        f"/api/v1/businesses/{business['id']}/products",
        json={"name": _unique("Soon Removed From Admin Queue")},
        headers=_auth_headers(owner_token),
    )
    product = resp.json()

    resp = client.get(
        "/api/v1/admin/products", params={"status": "pending"}, headers=_auth_headers(admin_token)
    )
    ids = [p["id"] for p in resp.json()["items"]]
    assert product["id"] in ids

    resp = client.delete(
        f"/api/v1/products/{product['id']}", headers=_auth_headers(owner_token)
    )
    assert resp.status_code == 204

    resp = client.get(
        "/api/v1/admin/products", params={"status": "pending"}, headers=_auth_headers(admin_token)
    )
    ids = [p["id"] for p in resp.json()["items"]]
    assert product["id"] not in ids


def test_admin_business_queue_hides_soft_deleted_business() -> None:
    """Business equivalent of test_admin_product_queue_hides_soft_deleted_product
    - GET /admin/businesses had the identical is_active gap."""
    owner_token, _ = _dev_token()
    admin_token, _ = _dev_token(role="platform_admin")
    business = _create_business(owner_token)
    resp = client.post(
        f"/api/v1/businesses/{business['id']}/submit-for-verification",
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 200

    resp = client.get(
        "/api/v1/admin/businesses",
        params={"status": "pending"},
        headers=_auth_headers(admin_token),
    )
    ids = [b["id"] for b in resp.json()["items"]]
    assert business["id"] in ids

    resp = client.delete(
        f"/api/v1/businesses/{business['id']}", headers=_auth_headers(owner_token)
    )
    assert resp.status_code == 204

    resp = client.get(
        "/api/v1/admin/businesses",
        params={"status": "pending"},
        headers=_auth_headers(admin_token),
    )
    ids = [b["id"] for b in resp.json()["items"]]
    assert business["id"] not in ids


def test_product_reject_and_permissions() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    resp = client.post(
        f"/api/v1/businesses/{business['id']}/products",
        json={"name": _unique("Steel Sheet")},
        headers=_auth_headers(owner_token),
    )
    product = resp.json()

    other_token, _ = _dev_token()
    resp = client.patch(
        f"/api/v1/products/{product['id']}",
        json={"name": "Hijacked"},
        headers=_auth_headers(other_token),
    )
    assert resp.status_code == 403

    admin_token, _ = _dev_token(role="platform_admin")
    resp = client.post(
        f"/api/v1/admin/products/{product['id']}/reject",
        json={"reason": "Price looks like a typo."},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["moderation_status"] == "rejected"

    # Can't reject an already-rejected product again (double-click safety).
    resp = client.post(
        f"/api/v1/admin/products/{product['id']}/reject",
        json={"reason": "Again"},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 409


def test_product_reject_after_approval_hides_it_immediately() -> None:
    """A previously-approved product is a legitimate reject target, not just
    a pending one. Rejecting it must remove it from the public listing right
    away, and re-approving from rejected is a documented, supported path."""
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    resp = client.post(
        f"/api/v1/businesses/{business['id']}/products",
        json={"name": _unique("Reject After Approve Tank")},
        headers=_auth_headers(owner_token),
    )
    product = resp.json()

    admin_token, _ = _dev_token(role="platform_admin")
    resp = client.post(
        f"/api/v1/admin/products/{product['id']}/approve",
        json={},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["moderation_status"] == "approved"

    resp = client.get("/api/v1/products", params={"business_id": business["id"]})
    assert resp.json()["total"] == 1

    resp = client.post(
        f"/api/v1/admin/products/{product['id']}/reject",
        json={"reason": "Policy violation discovered post-approval."},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["moderation_status"] == "rejected"
    assert body["moderation_note"] == "Policy violation discovered post-approval."

    resp = client.get("/api/v1/products", params={"business_id": business["id"]})
    assert resp.json()["total"] == 0  # immediately hidden from public listing

    # Admin can reverse the rejection straight back to approved.
    resp = client.post(
        f"/api/v1/admin/products/{product['id']}/approve",
        json={"note": "Issue resolved."},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["moderation_status"] == "approved"

    resp = client.get("/api/v1/products", params={"business_id": business["id"]})
    assert resp.json()["total"] == 1

    # Approving an already-approved product is a no-op 409.
    resp = client.post(
        f"/api/v1/admin/products/{product['id']}/approve",
        json={},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 409


def test_admin_queue_filters_by_status() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    client.post(
        f"/api/v1/businesses/{business['id']}/submit-for-verification",
        headers=_auth_headers(owner_token),
    )

    admin_token, _ = _dev_token(role="platform_admin")
    resp = client.get(
        "/api/v1/admin/businesses",
        params={"status": "pending"},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200
    ids = [b["id"] for b in resp.json()["items"]]
    assert business["id"] in ids

    # Non-admin/moderator is forbidden from the queue at all.
    resp = client.get(
        "/api/v1/admin/businesses",
        params={"status": "pending"},
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 403


def test_owner_cannot_set_is_featured_via_create_or_patch() -> None:
    """`is_featured` is platform-controlled (Phase 1a manual featured
    placement) — an owner including it in a create/patch body must be
    rejected outright, not silently accepted-and-ignored."""
    token, _ = _dev_token()

    resp = client.post(
        "/api/v1/businesses",
        json={"name": _unique("Sneaky Biz"), "is_featured": True},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 422

    business = _create_business(token)
    assert business["is_featured"] is False

    resp = client.patch(
        f"/api/v1/businesses/{business['id']}",
        json={"is_featured": True},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 422

    # Confirm it really is untouched.
    resp = client.get(f"/api/v1/businesses/{business['id']}")
    assert resp.json()["is_featured"] is False


def test_admin_feature_unfeature_business_and_public_filter() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    client.post(
        f"/api/v1/businesses/{business['id']}/submit-for-verification",
        headers=_auth_headers(owner_token),
    )
    admin_token, _ = _dev_token(role="platform_admin")
    client.post(
        f"/api/v1/admin/businesses/{business['id']}/approve",
        json={},
        headers=_auth_headers(admin_token),
    )

    # Non-moderator/admin cannot feature.
    resp = client.post(
        f"/api/v1/admin/businesses/{business['id']}/feature",
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 403

    resp = client.post(
        f"/api/v1/admin/businesses/{business['id']}/feature",
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["is_featured"] is True

    resp = client.get("/api/v1/businesses", params={"is_featured": True, "q": business["name"]})
    assert resp.json()["total"] == 1

    resp = client.get("/api/v1/businesses", params={"is_featured": False, "q": business["name"]})
    assert resp.json()["total"] == 0

    resp = client.post(
        f"/api/v1/admin/businesses/{business['id']}/unfeature",
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["is_featured"] is False

    resp = client.get("/api/v1/businesses", params={"is_featured": True, "q": business["name"]})
    assert resp.json()["total"] == 0


def test_owner_cannot_set_product_is_featured_via_create_or_patch() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)

    resp = client.post(
        f"/api/v1/businesses/{business['id']}/products",
        json={"name": _unique("Sneaky Product"), "is_featured": True},
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 422

    resp = client.post(
        f"/api/v1/businesses/{business['id']}/products",
        json={"name": _unique("Normal Product")},
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 201
    product = resp.json()
    assert product["is_featured"] is False

    resp = client.patch(
        f"/api/v1/products/{product['id']}",
        json={"is_featured": True},
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 422

    resp = client.get(f"/api/v1/products/{product['id']}")
    assert resp.json()["is_featured"] is False


def test_admin_feature_unfeature_product_and_public_filter() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    resp = client.post(
        f"/api/v1/businesses/{business['id']}/products",
        json={"name": _unique("Featured Candidate")},
        headers=_auth_headers(owner_token),
    )
    product = resp.json()

    admin_token, _ = _dev_token(role="platform_admin")
    client.post(
        f"/api/v1/admin/products/{product['id']}/approve",
        json={},
        headers=_auth_headers(admin_token),
    )

    resp = client.post(
        f"/api/v1/admin/products/{product['id']}/feature",
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 403

    resp = client.post(
        f"/api/v1/admin/products/{product['id']}/feature",
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["is_featured"] is True

    resp = client.get(
        "/api/v1/products", params={"business_id": business["id"], "is_featured": True}
    )
    assert resp.json()["total"] == 1

    resp = client.get(
        "/api/v1/products", params={"business_id": business["id"], "is_featured": False}
    )
    assert resp.json()["total"] == 0

    resp = client.post(
        f"/api/v1/admin/products/{product['id']}/unfeature",
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["is_featured"] is False


def test_categories_endpoint_returns_list() -> None:
    resp = client.get("/api/v1/categories")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def _two_category_ids() -> tuple[int, int]:
    """Ensure at least 2 categories exist and return their ids. The isolated
    test database (see tests/conftest.py) only runs Alembic migrations, not
    `app/db/seed.py`'s 18 launch categories, so tests can't assume any
    category rows already exist — get-or-create two fixed ones directly."""
    db = SessionLocal()
    try:
        ids = []
        for slug, name in (("test-cat-a", "Test Category A"), ("test-cat-b", "Test Category B")):
            category = db.query(Category).filter(Category.slug == slug).one_or_none()
            if category is None:
                category = Category(name=name, slug=slug)
                db.add(category)
                db.flush()
            ids.append(category.id)
        db.commit()
        return ids[0], ids[1]
    finally:
        db.close()


def test_product_can_have_multiple_categories() -> None:
    """A product must be able to carry 2+ categories (many-to-many), and be
    returned when filtering by *either* one — this replaced the old
    single-`category_id` FK (see docs/decisions.md)."""
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    cat_a, cat_b = _two_category_ids()

    resp = client.post(
        f"/api/v1/businesses/{business['id']}/products",
        json={"name": _unique("Multi-Category Widget"), "category_ids": [cat_a, cat_b]},
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 201, resp.text
    product = resp.json()
    returned_ids = {c["id"] for c in product["categories"]}
    assert returned_ids == {cat_a, cat_b}

    admin_token, _ = _dev_token(role="platform_admin")
    resp = client.post(
        f"/api/v1/admin/products/{product['id']}/approve",
        json={},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200

    # Visible when filtering by either category.
    for cat_id in (cat_a, cat_b):
        resp = client.get(
            "/api/v1/products",
            params={"business_id": business["id"], "category_id": cat_id},
        )
        assert resp.json()["total"] == 1, f"expected product under category {cat_id}"

    # A category the product isn't in shouldn't return it — pick a 3rd
    # category if one exists, otherwise skip this half of the assertion.
    resp = client.get("/api/v1/categories")
    all_categories = resp.json()
    other = next((c for c in all_categories if c["id"] not in (cat_a, cat_b)), None)
    if other is not None:
        resp = client.get(
            "/api/v1/products",
            params={"business_id": business["id"], "category_id": other["id"]},
        )
        assert resp.json()["total"] == 0

    # Updating category_ids replaces the set (PATCH semantics).
    resp = client.patch(
        f"/api/v1/products/{product['id']}",
        json={"category_ids": [cat_a]},
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 200
    assert {c["id"] for c in resp.json()["categories"]} == {cat_a}

    # Rejects unknown category ids.
    resp = client.patch(
        f"/api/v1/products/{product['id']}",
        json={"category_ids": [999999]},
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 400


# --- Core analytics: product/business view counters ------------------------


def test_product_view_count_increments_and_requires_approved() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    resp = client.post(
        f"/api/v1/businesses/{business['id']}/products",
        json={"name": _unique("Viewable Product")},
        headers=_auth_headers(owner_token),
    )
    product = resp.json()
    assert product["view_count"] == 0

    # Pending product: view endpoint 404s, same as an unapproved video.
    resp = client.post(f"/api/v1/products/{product['id']}/view")
    assert resp.status_code == 404

    admin_token, _ = _dev_token(role="platform_admin")
    client.post(
        f"/api/v1/admin/products/{product['id']}/approve",
        json={},
        headers=_auth_headers(admin_token),
    )

    resp = client.post(f"/api/v1/products/{product['id']}/view")
    assert resp.status_code == 200
    assert resp.json()["view_count"] == 1
    resp = client.post(f"/api/v1/products/{product['id']}/view")
    assert resp.json()["view_count"] == 2

    resp = client.get(f"/api/v1/products/{product['id']}")
    assert resp.json()["view_count"] == 2


def test_business_view_count_increments_and_requires_verified() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    assert business["view_count"] == 0

    # Unverified business: view endpoint 404s.
    resp = client.post(f"/api/v1/businesses/{business['id']}/view")
    assert resp.status_code == 404

    client.post(
        f"/api/v1/businesses/{business['id']}/submit-for-verification",
        headers=_auth_headers(owner_token),
    )
    admin_token, _ = _dev_token(role="platform_admin")
    client.post(
        f"/api/v1/admin/businesses/{business['id']}/approve",
        json={},
        headers=_auth_headers(admin_token),
    )

    resp = client.post(f"/api/v1/businesses/{business['id']}/view")
    assert resp.status_code == 200
    assert resp.json()["view_count"] == 1
    resp = client.post(f"/api/v1/businesses/{business['id']}/view")
    assert resp.json()["view_count"] == 2

    resp = client.get(f"/api/v1/businesses/{business['id']}")
    assert resp.json()["view_count"] == 2


# --- Core analytics: impression (search-appearance) batch endpoints -------


def test_product_impressions_batch_increments_only_public_ids() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    admin_token, _ = _dev_token(role="platform_admin")

    resp = client.post(
        f"/api/v1/businesses/{business['id']}/products",
        json={"name": _unique("Impression Product")},
        headers=_auth_headers(owner_token),
    )
    approved_product = resp.json()
    client.post(
        f"/api/v1/admin/products/{approved_product['id']}/approve",
        json={},
        headers=_auth_headers(admin_token),
    )

    resp = client.post(
        f"/api/v1/businesses/{business['id']}/products",
        json={"name": _unique("Pending Product")},
        headers=_auth_headers(owner_token),
    )
    pending_product = resp.json()

    fake_id = str(uuid.uuid4())
    resp = client.post(
        "/api/v1/products/impressions",
        json={"ids": [approved_product["id"], pending_product["id"], fake_id]},
    )
    assert resp.status_code == 200
    # Only the approved+active product actually matched and incremented.
    assert resp.json()["updated"] == 1

    resp = client.get(f"/api/v1/products/{approved_product['id']}")
    assert resp.json()["impression_count"] == 1
    resp = client.get(f"/api/v1/products/{pending_product['id']}")
    assert resp.json()["impression_count"] == 0

    # Additive across calls.
    client.post("/api/v1/products/impressions", json={"ids": [approved_product["id"]]})
    resp = client.get(f"/api/v1/products/{approved_product['id']}")
    assert resp.json()["impression_count"] == 2


def test_business_impressions_batch_increments_only_public_ids() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    admin_token, _ = _dev_token(role="platform_admin")
    client.post(
        f"/api/v1/businesses/{business['id']}/submit-for-verification",
        headers=_auth_headers(owner_token),
    )
    client.post(
        f"/api/v1/admin/businesses/{business['id']}/approve",
        json={},
        headers=_auth_headers(admin_token),
    )

    unverified_business = _create_business(owner_token)
    fake_id = str(uuid.uuid4())

    resp = client.post(
        "/api/v1/businesses/impressions",
        json={"ids": [business["id"], unverified_business["id"], fake_id]},
    )
    assert resp.status_code == 200
    assert resp.json()["updated"] == 1

    resp = client.get(f"/api/v1/businesses/{business['id']}")
    assert resp.json()["impression_count"] == 1
    resp = client.get(f"/api/v1/businesses/{unverified_business['id']}")
    assert resp.json()["impression_count"] == 0


def test_impressions_batch_validates_size() -> None:
    resp = client.post("/api/v1/products/impressions", json={"ids": []})
    assert resp.status_code == 422

    too_many = [str(uuid.uuid4()) for _ in range(101)]
    resp = client.post("/api/v1/products/impressions", json={"ids": too_many})
    assert resp.status_code == 422


# --- Core analytics: business owner stats summary ---------------------------


def test_business_stats_aggregation_and_access_control() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    admin_token, _ = _dev_token(role="platform_admin")

    resp = client.post(
        f"/api/v1/businesses/{business['id']}/products",
        json={"name": _unique("Stats Product A")},
        headers=_auth_headers(owner_token),
    )
    product_a = resp.json()
    resp = client.post(
        f"/api/v1/businesses/{business['id']}/products",
        json={"name": _unique("Stats Product B")},
        headers=_auth_headers(owner_token),
    )
    product_b = resp.json()
    resp = client.post(
        f"/api/v1/businesses/{business['id']}/products",
        json={"name": _unique("Stats Product Pending")},
        headers=_auth_headers(owner_token),
    )
    product_pending = resp.json()
    assert product_pending["moderation_status"] == "pending"

    for pid in (product_a["id"], product_b["id"]):
        resp = client.post(
            f"/api/v1/admin/products/{pid}/approve",
            json={},
            headers=_auth_headers(admin_token),
        )
        assert resp.status_code == 200

    client.post(f"/api/v1/products/{product_a['id']}/view")
    client.post(f"/api/v1/products/{product_a['id']}/view")
    client.post(f"/api/v1/products/{product_b['id']}/view")

    client.post(
        f"/api/v1/businesses/{business['id']}/submit-for-verification",
        headers=_auth_headers(owner_token),
    )
    client.post(
        f"/api/v1/admin/businesses/{business['id']}/approve",
        json={},
        headers=_auth_headers(admin_token),
    )
    client.post(f"/api/v1/businesses/{business['id']}/view")

    # A stranger cannot see another business's stats.
    other_token, _ = _dev_token()
    resp = client.get(
        f"/api/v1/businesses/{business['id']}/stats", headers=_auth_headers(other_token)
    )
    assert resp.status_code == 403

    # Owner can.
    resp = client.get(
        f"/api/v1/businesses/{business['id']}/stats", headers=_auth_headers(owner_token)
    )
    assert resp.status_code == 200
    stats = resp.json()
    assert stats["business_id"] == business["id"]
    assert stats["business_view_count"] == 1
    assert stats["total_product_views"] == 3
    assert stats["product_counts"] == {"pending": 1, "approved": 2, "rejected": 0}
    assert stats["total_video_views"] == 0
    assert stats["video_counts"] == {"pending": 0, "approved": 0, "rejected": 0}

    # Funnel fields: no impressions were ever recorded for this business or
    # its products in this test, so both conversion rates must be None (a
    # 0-impression denominator has no meaningful ratio), never a
    # ZeroDivisionError or a misleading 0.0.
    assert stats["business_impression_count"] == 0
    assert stats["business_view_conversion_rate"] is None
    assert stats["total_product_impressions"] == 0
    assert stats["product_view_conversion_rate"] is None

    # Ranked top_products: approved-only (the pending product is excluded
    # even though it exists), ordered by view_count descending.
    assert stats["top_products"] == [
        {
            "id": product_a["id"],
            "name": product_a["name"],
            "slug": product_a["slug"],
            "view_count": 2,
        },
        {
            "id": product_b["id"],
            "name": product_b["name"],
            "slug": product_b["slug"],
            "view_count": 1,
        },
    ]
    assert stats["top_videos"] == []

    # Admin/moderator can too.
    resp = client.get(
        f"/api/v1/businesses/{business['id']}/stats", headers=_auth_headers(admin_token)
    )
    assert resp.status_code == 200


_TINY_MP4_BYTES = (
    b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom"
    b"\x00\x00\x00\x08free"
)


def _upload_video(token: str, business_id: str, **form_overrides) -> dict:
    form = {"title": _unique("Stats Video")}
    form.update(form_overrides)
    resp = client.post(
        f"/api/v1/businesses/{business_id}/videos",
        data=form,
        files={"file": ("clip.mp4", io.BytesIO(_TINY_MP4_BYTES), "video/mp4")},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _set_view_count(
    model: type,
    entity_id: str,
    view_count: int,
    impression_count: int | None = None,
) -> None:
    """Direct DB override of a numeric counter for a controlled test —
    same escape-hatch pattern tests/test_campaigns.py's `_set_campaign` uses:
    real endpoints already have their own dedicated view/impression-
    increment tests elsewhere, so this just puts a row into a specific
    numeric state to test the *ranking query* over it, not the increment
    mechanism itself."""
    with SessionLocal() as db:
        row = db.get(model, uuid.UUID(entity_id))
        assert row is not None
        row.view_count = view_count
        if impression_count is not None:
            row.impression_count = impression_count
        db.commit()


def test_business_stats_top_products_top_videos_and_funnel() -> None:
    """Ranked top_products/top_videos (approved+active only, ordered by
    lifetime view_count descending — a pending row with a *higher* raw
    view_count must still be excluded) plus the funnel conversion-rate
    fields, computed over the same already-existing lifetime counters."""
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    admin_token, _ = _dev_token(role="platform_admin")
    business_id = business["id"]

    resp = client.post(
        f"/api/v1/businesses/{business_id}/products",
        json={"name": _unique("Funnel Product High")},
        headers=_auth_headers(owner_token),
    )
    product_high = resp.json()
    resp = client.post(
        f"/api/v1/businesses/{business_id}/products",
        json={"name": _unique("Funnel Product Low")},
        headers=_auth_headers(owner_token),
    )
    product_low = resp.json()
    resp = client.post(
        f"/api/v1/businesses/{business_id}/products",
        json={"name": _unique("Funnel Product Pending")},
        headers=_auth_headers(owner_token),
    )
    product_pending = resp.json()
    assert product_pending["moderation_status"] == "pending"

    for pid in (product_high["id"], product_low["id"]):
        resp = client.post(
            f"/api/v1/admin/products/{pid}/approve", json={}, headers=_auth_headers(admin_token)
        )
        assert resp.status_code == 200

    _set_view_count(Product, product_high["id"], view_count=20, impression_count=40)
    _set_view_count(Product, product_low["id"], view_count=5, impression_count=10)
    # Pending, with a raw view_count *higher* than either approved product —
    # must still never appear in top_products.
    _set_view_count(Product, product_pending["id"], view_count=100, impression_count=200)

    video_high = _upload_video(owner_token, business_id)
    video_low = _upload_video(owner_token, business_id)
    video_pending = _upload_video(owner_token, business_id)
    for vid in (video_high["id"], video_low["id"]):
        resp = client.post(
            f"/api/v1/admin/videos/{vid}/approve", json={}, headers=_auth_headers(admin_token)
        )
        assert resp.status_code == 200
    _set_view_count(Video, video_high["id"], view_count=9)
    _set_view_count(Video, video_low["id"], view_count=3)
    _set_view_count(Video, video_pending["id"], view_count=50)

    with SessionLocal() as db:
        biz = db.get(Business, uuid.UUID(business_id))
        biz.view_count = 10
        biz.impression_count = 40
        db.commit()

    resp = client.get(
        f"/api/v1/businesses/{business_id}/stats", headers=_auth_headers(owner_token)
    )
    assert resp.status_code == 200
    stats = resp.json()

    assert [p["id"] for p in stats["top_products"]] == [product_high["id"], product_low["id"]]
    assert [p["view_count"] for p in stats["top_products"]] == [20, 5]

    assert [v["id"] for v in stats["top_videos"]] == [video_high["id"], video_low["id"]]
    assert [v["view_count"] for v in stats["top_videos"]] == [9, 3]

    # total_product_views/impressions sum ALL active products regardless of
    # moderation status (matches this endpoint's pre-existing "counts/sums
    # include pending/rejected" convention) — 20+5+100 / 40+10+200.
    assert stats["total_product_views"] == 125
    assert stats["total_product_impressions"] == 250
    assert stats["product_view_conversion_rate"] == 125 / 250

    assert stats["business_view_count"] == 10
    assert stats["business_impression_count"] == 40
    assert stats["business_view_conversion_rate"] == 10 / 40


def test_business_stats_timeseries_zero_fill_and_seeded_real_days(monkeypatch) -> None:
    """Seeds a few genuinely different calendar days of `*_daily_stats` rows
    via the real upsert functions (app/services/daily_stats.py), not raw
    SQL — those functions always write to *today*'s row, so a few different
    days are simulated by monkeypatching their internal `_today()` for the
    duration of each write (same technique freezegun would provide, without
    adding a new dependency for one test module). Confirms the timeseries
    endpoint returns real seeded days correctly, AND that a day with
    genuinely no activity in between is a real zero row, not an absent one."""
    from app.services import daily_stats as daily_stats_module

    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    business_id = business["id"]

    resp = client.post(
        f"/api/v1/businesses/{business_id}/products",
        json={"name": _unique("Timeseries Product")},
        headers=_auth_headers(owner_token),
    )
    product = resp.json()

    today = date.today()
    day_a = today - timedelta(days=6)
    day_b = today - timedelta(days=2)
    gap_day = today - timedelta(days=4)  # strictly between day_a and day_b

    monkeypatch.setattr(daily_stats_module, "_today", lambda: day_a)
    with SessionLocal() as db:
        daily_stats_module.record_business_view_daily(db, uuid.UUID(business_id))
        daily_stats_module.record_business_view_daily(db, uuid.UUID(business_id))
        daily_stats_module.record_business_impressions_daily(db, [uuid.UUID(business_id)])
        daily_stats_module.record_product_view_daily(db, uuid.UUID(product["id"]))
        db.commit()

    monkeypatch.setattr(daily_stats_module, "_today", lambda: day_b)
    with SessionLocal() as db:
        daily_stats_module.record_business_view_daily(db, uuid.UUID(business_id))
        db.commit()

    resp = client.get(
        f"/api/v1/businesses/{business_id}/stats/timeseries?days=10",
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 200, resp.text
    rows = resp.json()
    assert len(rows) == 10
    assert [r["date"] for r in rows] == sorted(r["date"] for r in rows)

    by_date = {r["date"]: r for r in rows}

    row_a = by_date[str(day_a)]
    assert row_a["business_views"] == 2
    assert row_a["business_impressions"] == 1
    assert row_a["total_product_views"] == 1

    row_b = by_date[str(day_b)]
    assert row_b["business_views"] == 1
    assert row_b["business_impressions"] == 0

    # Zero-fill: a day with no activity at all is present with real zeros
    # (a real row, not an absent key) — every field individually, rather
    # than an exact-dict match, since `campaign_spend_kes`'s Decimal string
    # form ("0" vs "0.00") depends on how many real rows have contributed a
    # NUMERIC(12,2)-typed value elsewhere in the series, not something this
    # test should have to predict exactly.
    gap_row = by_date[str(gap_day)]
    assert gap_row["date"] == str(gap_day)
    assert gap_row["business_views"] == 0
    assert gap_row["business_impressions"] == 0
    assert gap_row["total_product_views"] == 0
    assert gap_row["total_product_impressions"] == 0
    assert gap_row["total_video_views"] == 0
    assert gap_row["campaign_impression_count"] == 0
    assert gap_row["campaign_click_count"] == 0
    assert Decimal(gap_row["campaign_spend_kes"]) == Decimal("0")


def test_business_stats_timeseries_is_owner_admin_gated() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)

    other_token, _ = _dev_token()
    resp = client.get(
        f"/api/v1/businesses/{business['id']}/stats/timeseries",
        headers=_auth_headers(other_token),
    )
    assert resp.status_code == 403

    admin_token, _ = _dev_token(role="platform_admin")
    resp = client.get(
        f"/api/v1/businesses/{business['id']}/stats/timeseries",
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200


# --- Recommendations: related-products fallback chain -----------------------


def _new_category() -> int:
    """A brand-new category with a unique slug, unlike `_two_category_ids`'s
    fixed test-cat-a/b — needed for tests that assert an *exact* related-set
    match, since fixed categories accumulate products across every test that
    reuses them within the same test-DB session (tests aren't per-test
    isolated, only per-session — see tests/conftest.py)."""
    db = SessionLocal()
    try:
        category = Category(name=_unique("Fallback Test Category"), slug=_unique("fallback-cat"))
        db.add(category)
        db.commit()
        db.refresh(category)
        return category.id
    finally:
        db.close()


def test_related_products_fallback_prefers_category_over_business() -> None:
    """No curated related_products: same-category should win over
    same-business when both are available — see _related_products_fallback's
    docstring in app/api/v1/endpoints/products.py for the exact chain."""
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    other_owner_token, _ = _dev_token()
    other_business = _create_business(other_owner_token)
    admin_token, _ = _dev_token(role="platform_admin")
    cat_a = _new_category()

    resp = client.post(
        f"/api/v1/businesses/{business['id']}/products",
        json={"name": _unique("Target Product"), "category_ids": [cat_a]},
        headers=_auth_headers(owner_token),
    )
    target = resp.json()

    # Same business, but shares no category with the target.
    resp = client.post(
        f"/api/v1/businesses/{business['id']}/products",
        json={"name": _unique("Sibling No Category")},
        headers=_auth_headers(owner_token),
    )
    sibling = resp.json()

    # Different business, but shares the target's category.
    resp = client.post(
        f"/api/v1/businesses/{other_business['id']}/products",
        json={"name": _unique("Cross-business Same Category"), "category_ids": [cat_a]},
        headers=_auth_headers(other_owner_token),
    )
    cross_business_match = resp.json()

    for pid in (sibling["id"], cross_business_match["id"]):
        resp = client.post(
            f"/api/v1/admin/products/{pid}/approve",
            json={},
            headers=_auth_headers(admin_token),
        )
        assert resp.status_code == 200

    resp = client.get(f"/api/v1/products/{target['id']}")
    assert resp.status_code == 200
    related_ids = {p["id"] for p in resp.json()["related_products"]}
    assert related_ids == {cross_business_match["id"]}


def test_related_products_fallback_to_business_when_no_category_match() -> None:
    """Tier 2 of the fallback chain: no categories at all (so tier 1 can't
    apply) still falls back to same-business, not straight to empty."""
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    admin_token, _ = _dev_token(role="platform_admin")

    resp = client.post(
        f"/api/v1/businesses/{business['id']}/products",
        json={"name": _unique("Target No Category")},
        headers=_auth_headers(owner_token),
    )
    target = resp.json()

    resp = client.post(
        f"/api/v1/businesses/{business['id']}/products",
        json={"name": _unique("Sibling Product")},
        headers=_auth_headers(owner_token),
    )
    sibling = resp.json()
    client.post(
        f"/api/v1/admin/products/{sibling['id']}/approve",
        json={},
        headers=_auth_headers(admin_token),
    )

    resp = client.get(f"/api/v1/products/{target['id']}")
    assert resp.status_code == 200
    related_ids = {p["id"] for p in resp.json()["related_products"]}
    assert related_ids == {sibling["id"]}
