from fastapi import APIRouter

from app.api.v1.endpoints import (
    admin,
    auth,
    auth_dev,
    businesses,
    campaigns,
    categories,
    featured_purchases,
    health,
    payments,
    products,
    videos,
)

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(categories.router)
api_router.include_router(auth.router)
api_router.include_router(auth_dev.router)
api_router.include_router(businesses.router)
api_router.include_router(products.router)
api_router.include_router(videos.router)
api_router.include_router(admin.router)
api_router.include_router(featured_purchases.router)
api_router.include_router(campaigns.router)
api_router.include_router(payments.router)

# Sprint 4+ adds: search, ads/analytics routers here.
