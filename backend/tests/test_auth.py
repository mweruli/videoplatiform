"""End-to-end tests for real registration/OTP/login/password-reset (the
replacement for app/api/v1/endpoints/auth_dev.py's DEBUG-only stub).

Runs against a real Postgres + Redis (see .github/workflows/ci.yml /
docker-compose) via TestClient — same pattern as test_businesses_products.py.
Relies on settings.DEBUG being true (the CI/dev default) so OTP codes are
echoed back in responses instead of only being "sent" via the console OTP
sender — see app/services/otp.py.

Uses randomised emails/phones per test so re-runs against a shared dev
database, and Redis-backed rate limiting keyed by destination, don't collide
with previous runs.
"""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _unique_email() -> str:
    return f"auth-test-{uuid.uuid4().hex[:12]}@example.com"


def _unique_phone() -> str:
    # +2547 + 8 digits derived from a UUID, kept within the E.164-ish shape
    # app/utils/phone.py accepts.
    return f"+2547{uuid.uuid4().int % 10**8:08d}"


def _register(**overrides) -> dict:
    payload = {"email": _unique_email(), "password": "SuperSecret123"}
    payload.update(overrides)
    resp = client.post("/api/v1/auth/register", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_register_returns_debug_otp_and_creates_unverified_user() -> None:
    body = _register()
    assert body["user"]["is_verified"] is False
    assert body["otp"] is not None
    assert len(body["otp"]["code"]) == 6


def test_register_requires_email_or_phone() -> None:
    resp = client.post("/api/v1/auth/register", json={"password": "SuperSecret123"})
    assert resp.status_code == 422


def test_register_rejects_short_password() -> None:
    resp = client.post(
        "/api/v1/auth/register", json={"email": _unique_email(), "password": "short"}
    )
    assert resp.status_code == 422


def test_register_rejects_staff_role_self_selection() -> None:
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": _unique_email(), "password": "SuperSecret123", "role": "platform_admin"},
    )
    assert resp.status_code == 422


def test_register_duplicate_email_conflicts() -> None:
    email = _unique_email()
    _register(email=email)
    resp = client.post(
        "/api/v1/auth/register", json={"email": email, "password": "SuperSecret123"}
    )
    assert resp.status_code == 409


def test_full_register_verify_login_cycle() -> None:
    email = _unique_email()
    body = _register(email=email)
    code = body["otp"]["code"]

    # Can't log in before verifying.
    resp = client.post(
        "/api/v1/auth/login", json={"email": email, "password": "SuperSecret123"}
    )
    assert resp.status_code == 403

    # Wrong code is rejected without consuming the real one.
    resp = client.post(
        "/api/v1/auth/otp/verify",
        json={"email": email, "code": "000000", "purpose": "registration"},
    )
    assert resp.status_code == 400

    resp = client.post(
        "/api/v1/auth/otp/verify",
        json={"email": email, "code": code, "purpose": "registration"},
    )
    assert resp.status_code == 200
    assert resp.json()["user"]["is_verified"] is True

    # A consumed code can't be reused.
    resp = client.post(
        "/api/v1/auth/otp/verify",
        json={"email": email, "code": code, "purpose": "registration"},
    )
    assert resp.status_code == 400

    # Now login works, and the token is a real bearer token usable against
    # existing RBAC-gated endpoints.
    resp = client.post(
        "/api/v1/auth/login", json={"email": email, "password": "SuperSecret123"}
    )
    assert resp.status_code == 200
    token = resp.json()["access_token"]

    resp = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["email"] == email

    # Wrong password still rejected post-verification.
    resp = client.post("/api/v1/auth/login", json={"email": email, "password": "WrongPass123"})
    assert resp.status_code == 401


def test_register_and_verify_with_phone() -> None:
    phone = _unique_phone()
    body = _register(email=None, phone=phone)
    assert body["user"]["phone"] == phone
    code = body["otp"]["code"]

    resp = client.post(
        "/api/v1/auth/otp/verify", json={"phone": phone, "code": code, "purpose": "registration"}
    )
    assert resp.status_code == 200

    resp = client.post("/api/v1/auth/login", json={"phone": phone, "password": "SuperSecret123"})
    assert resp.status_code == 200


def test_otp_resend_is_rate_limited() -> None:
    phone = _unique_phone()
    _register(email=None, phone=phone)

    resp = client.post(
        "/api/v1/auth/otp/request", json={"phone": phone, "purpose": "registration"}
    )
    assert resp.status_code == 429
    assert "Retry-After" in resp.headers


def test_login_with_unknown_identity_is_401() -> None:
    resp = client.post(
        "/api/v1/auth/login", json={"email": _unique_email(), "password": "whatever123"}
    )
    assert resp.status_code == 401


def test_forgot_password_is_generic_for_unknown_account() -> None:
    resp = client.post(
        "/api/v1/auth/password/forgot", json={"email": _unique_email()}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["otp"] is None  # no account -> nothing actually issued
    assert "If an account exists" in body["message"]


def test_password_reset_full_cycle() -> None:
    email = _unique_email()
    body = _register(email=email)
    verify_code = body["otp"]["code"]
    client.post(
        "/api/v1/auth/otp/verify",
        json={"email": email, "code": verify_code, "purpose": "registration"},
    )

    resp = client.post("/api/v1/auth/password/forgot", json={"email": email})
    assert resp.status_code == 200
    reset_code = resp.json()["otp"]["code"]

    # Wrong code rejected.
    resp = client.post(
        "/api/v1/auth/password/reset",
        json={"email": email, "code": "111111", "new_password": "BrandNewPass123"},
    )
    assert resp.status_code == 400

    resp = client.post(
        "/api/v1/auth/password/reset",
        json={"email": email, "code": reset_code, "new_password": "BrandNewPass123"},
    )
    assert resp.status_code == 200
    assert "access_token" in resp.json()

    # Old password no longer works, new one does.
    resp = client.post("/api/v1/auth/login", json={"email": email, "password": "SuperSecret123"})
    assert resp.status_code == 401

    resp = client.post(
        "/api/v1/auth/login", json={"email": email, "password": "BrandNewPass123"}
    )
    assert resp.status_code == 200


def test_dev_token_still_gated_by_debug_and_unaffected_by_real_auth() -> None:
    """auth_dev.py stays available in DEBUG (settings.DEBUG defaults True in
    tests/dev) purely as a quick-testing shortcut; this just documents it
    still works side by side with real auth, issuing tokens real endpoints
    accept identically."""
    resp = client.post("/api/v1/dev/token", json={"email": _unique_email()})
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    resp = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
