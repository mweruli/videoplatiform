"""Pytest bootstrap: guarantee the test suite NEVER touches the shared
dev/demo Postgres database (or the shared dev Redis instance), no matter how
pytest is invoked.

Root cause this fixes (see docs/decisions.md, "Isolated test database"):
`app/db/session.py` builds its engine from `settings.DATABASE_URL` eagerly at
import time, and test modules do `from app.main import app` at module level.
With no conftest.py, whatever `DATABASE_URL` happens to be set in the calling
process wins — and inside the backend container that's the compose-injected
URL pointing at the real `milestech` database that `app/db/seed_demo.py`
seeds for the PM's demo. Running `docker compose exec backend pytest` was
therefore writing "Test-<hash>" businesses/products/users straight into the
demo data.

The fix: this file is guaranteed by pytest to be imported before any test
module in this directory (conftest.py collection happens before test
collection), so it rewrites `DATABASE_URL` in `os.environ` to an isolated
`<dbname>_test` database *before* `app.core.config.settings` (and therefore
`app.db.session`'s module-level engine) is ever constructed. This is
invocation-agnostic by construction: a bare venv `pytest`, `docker compose
exec backend pytest`, and CI's own ephemeral-Postgres job all go through this
same file and all land on the isolated database — nobody has to remember to
set an env var by hand.
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import pytest

DEFAULT_DEV_DATABASE_URL = "postgresql+psycopg://milestech:milestech@localhost:5433/milestech"


def _test_database_url() -> str:
    """Derive the isolated test DB URL.

    Priority:
    1. `TEST_DATABASE_URL`, if the caller set one explicitly (escape hatch —
       e.g. pointing tests at a dedicated test Postgres instance entirely).
    2. Whatever `DATABASE_URL` is already set to (compose/CI/.env), with
       `_test` appended to the database name — same server, sibling database.
    3. The hardcoded dev default (matches docker-compose.yml / .env.example)
       with `_test` appended, so tests behave identically even in a fresh
       checkout with zero env configuration.
    """
    explicit = os.environ.get("TEST_DATABASE_URL")
    if explicit:
        return explicit

    base = os.environ.get("DATABASE_URL", DEFAULT_DEV_DATABASE_URL)
    parts = urlsplit(base)
    db_name = parts.path.lstrip("/")
    if not db_name.endswith("_test"):
        parts = parts._replace(path=f"/{db_name}_test")
    return urlunsplit(parts)


def _test_redis_url() -> str:
    """Redis isn't Postgres-isolated by a second database name, but Redis
    ships 16 logical DBs (0-15) on a single instance for exactly this kind of
    isolation. OTP request/verify flows write real rate-limit keys
    (`otp:ratelimit:<purpose>:<destination>`) to Redis — same pollution risk
    as Postgres, just lower-stakes since keys are namespaced by randomised
    per-test destinations and expire on their own TTL. Route tests to DB 15
    (rarely used) instead of the dev default DB 0 so they can't collide with
    or rate-limit-throttle real interactive dev/demo usage on the same Redis
    instance."""
    explicit = os.environ.get("TEST_REDIS_URL")
    if explicit:
        return explicit
    base = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    parts = urlsplit(base)
    return urlunsplit(parts._replace(path="/15"))


_TEST_DB_URL = _test_database_url()
_TEST_REDIS_URL = _test_redis_url()

# This MUST happen before anything under `app.*` is imported anywhere in the
# process (including by other conftest.py files or plugins) — pytest imports
# this conftest.py before collecting test modules in this directory, so this
# assignment always wins the race against test files' module-level
# `from app.main import app`. Do not move this below an `app` import.
os.environ["DATABASE_URL"] = _TEST_DB_URL
os.environ["REDIS_URL"] = _TEST_REDIS_URL


def _ensure_test_database_exists(test_db_url: str) -> None:
    """`CREATE DATABASE` the isolated test DB if it doesn't exist yet.

    Connects to Postgres's always-present `postgres` maintenance database
    (never the app's own default DB) so this works on a completely fresh
    Postgres instance too. `CREATE DATABASE` can't run inside a transaction
    block, hence the explicit autocommit connection.
    """
    import psycopg
    from sqlalchemy.engine import make_url

    url = make_url(test_db_url)
    target_db = url.database

    conn = psycopg.connect(
        host=url.host,
        port=url.port or 5432,
        user=url.username,
        password=url.password or "",
        dbname="postgres",
        autocommit=True,
    )
    try:
        exists = conn.execute(
            "SELECT 1 FROM pg_database WHERE datname = %s", (target_db,)
        ).fetchone()
        if not exists:
            # Identifier, not a value -- can't be parameterized. Safe because
            # target_db is derived from our own DATABASE_URL/TEST_DATABASE_URL
            # config, never from request/user input.
            conn.execute(f'CREATE DATABASE "{target_db}"')
    finally:
        conn.close()


def _migrate_test_database(test_db_url: str) -> None:
    """Run Alembic migrations against the isolated test DB, up to head."""
    from alembic import command
    from alembic.config import Config

    backend_dir = Path(__file__).resolve().parents[1]
    alembic_cfg = Config(str(backend_dir / "alembic.ini"))
    # Explicit, rather than relying solely on alembic/env.py picking up the
    # patched DATABASE_URL from settings — makes the isolation guarantee
    # visible right here instead of depending on wiring in another file.
    alembic_cfg.set_main_option("script_location", str(backend_dir / "alembic"))
    alembic_cfg.set_main_option("sqlalchemy.url", test_db_url)
    command.upgrade(alembic_cfg, "head")


@pytest.fixture(scope="session", autouse=True)
def _isolated_test_database() -> None:
    """Session-wide, runs once before any test: make sure the isolated test
    database exists and is migrated to head. Autouse so no test file needs to
    remember to request it."""
    print(f"\n[conftest] Isolated test database: {_TEST_DB_URL}")
    print(f"[conftest] Isolated test Redis: {_TEST_REDIS_URL}")
    _ensure_test_database_exists(_TEST_DB_URL)
    _migrate_test_database(_TEST_DB_URL)


@pytest.fixture()
def fake_payment_backend(monkeypatch: pytest.MonkeyPatch):
    """Installs a fake `PaymentBackend` in place of the real Daraja-calling
    one, for tests of app/api/v1/endpoints/featured_purchases.py.

    This mirrors the shape of this codebase's other pluggable-backend
    factories (`get_otp_sender()`, `get_video_backend()`,
    `get_storage_backend()`) — see app/services/mpesa.py's module docstring
    — but as of writing this is the first test in the suite that actually
    needs a fake instance of one of them, since no existing test faked
    get_otp_sender()/get_video_backend() (see docs/decisions.md's Phase 1b
    design-pass entry). `get_payment_backend` isn't a FastAPI dependency
    (it's called directly as a plain function inside the endpoint module),
    so this patches it at the import site
    (`app.api.v1.endpoints.featured_purchases.get_payment_backend`) rather
    than via `app.dependency_overrides`.

    Returns the `FakePaymentBackend` instance so a test can inspect
    `.calls` (what the endpoint actually sent) or set `.next_error` to
    simulate a synchronous Daraja failure (e.g. `MpesaError("boom")`).
    """
    import app.api.v1.endpoints.featured_purchases as featured_purchases_module
    from app.services.mpesa import StkPushResult

    class FakePaymentBackend:
        def __init__(self) -> None:
            self.calls: list[dict] = []
            self.next_error: Exception | None = None
            self._counter = 0

        def initiate_stk_push(
            self, *, phone: str, amount: int, account_reference: str, transaction_desc: str
        ) -> StkPushResult:
            self.calls.append(
                {
                    "phone": phone,
                    "amount": amount,
                    "account_reference": account_reference,
                    "transaction_desc": transaction_desc,
                }
            )
            if self.next_error is not None:
                raise self.next_error
            self._counter += 1
            return StkPushResult(
                merchant_request_id=f"fake-merchant-{uuid.uuid4().hex[:12]}",
                checkout_request_id=f"fake-checkout-{uuid.uuid4().hex[:12]}",
                response_code="0",
                response_description="Success. Request accepted for processing.",
                customer_message="Success. Request accepted for processing.",
            )

    backend = FakePaymentBackend()
    monkeypatch.setattr(featured_purchases_module, "get_payment_backend", lambda: backend)
    return backend
