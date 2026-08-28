"""Redis client factory.

Shared by the health check now; Sprint 2+ reuses this for caching, rate
limiting and OTP-code storage.
"""

from functools import lru_cache

import redis

from app.core.config import settings


@lru_cache
def get_redis_client() -> redis.Redis:
    return redis.Redis.from_url(settings.REDIS_URL, socket_connect_timeout=2, socket_timeout=2)
