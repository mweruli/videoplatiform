from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.endpoints.health import health_check
from app.api.v1.router import api_router
from app.core.config import settings

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="API-first backend for the Miles Tech video discovery, product search & ad platform.",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Versioned API surface — everything the Backend Engineer builds lives under /api/v1/*.
app.include_router(api_router, prefix=settings.API_V1_PREFIX)

# Unprefixed /health as well, for load balancers / uptime monitors / the
# frontend placeholder page that just wants a quick liveness+dependency check.
app.add_api_route("/health", health_check, tags=["health"])


@app.get("/")
def root() -> dict[str, str]:
    return {
        "name": settings.PROJECT_NAME,
        "status": "running",
        "docs": "/docs",
        "health": "/health",
    }
