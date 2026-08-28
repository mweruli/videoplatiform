from pydantic import BaseModel


class DependencyStatus(BaseModel):
    status: str  # "ok" | "error"
    detail: str | None = None


class HealthResponse(BaseModel):
    status: str  # "ok" | "degraded"
    environment: str
    database: DependencyStatus
    redis: DependencyStatus
