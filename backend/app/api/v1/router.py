from fastapi import APIRouter

from app.api.v1.endpoints import health

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])

# Sprint 2+ adds: auth, businesses, products, categories, videos, search,
# moderation, admin, ads/analytics routers here.
