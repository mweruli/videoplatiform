"""End-to-end tests for the Sprint 2 business/product core: ownership CRUD,
manual verification workflow, product CRUD + moderation, and the admin
moderation queue endpoints.

Runs against a real Postgres (see .github/workflows/ci.yml / docker-compose)
via TestClient + the app's normal DB session — same pattern as
test_health.py. Uses randomised emails/names per test so re-runs against a
shared dev database don't collide with previous runs' data.
"""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import app
from app.models.category import Category

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
