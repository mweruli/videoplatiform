"""Health check endpoint.

Reports real connectivity to Postgres and Redis (not stubs) so `docker
compose up` gives an honest signal that the local stack is wired correctly.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.redis import get_redis_client
from app.db.session import get_db
from app.schemas.health import DependencyStatus, HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health_check(db: Session = Depends(get_db)) -> HealthResponse:
    db_status = DependencyStatus(status="ok")
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001 - surface any DB failure in the response
        db_status = DependencyStatus(status="error", detail=str(exc))

    redis_status = DependencyStatus(status="ok")
    try:
        get_redis_client().ping()
    except Exception as exc:  # noqa: BLE001 - surface any Redis failure in the response
        redis_status = DependencyStatus(status="error", detail=str(exc))

    overall = "ok" if db_status.status == "ok" and redis_status.status == "ok" else "degraded"

    return HealthResponse(
        status=overall,
        environment=settings.ENVIRONMENT,
        database=db_status,
        redis=redis_status,
    )
