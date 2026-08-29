from fastapi import APIRouter

from app.api.v1.endpoints import admin, auth_dev, businesses, categories, health, products

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(categories.router)
api_router.include_router(auth_dev.router)
api_router.include_router(businesses.router)
api_router.include_router(products.router)
api_router.include_router(admin.router)

# Sprint 3+ adds: real auth (registration/OTP/login), videos, search,
# ads/analytics routers here.
