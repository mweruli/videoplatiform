"""Central application settings, loaded from environment variables / .env.

Every config value the app can consume lives here so there is exactly one
place to look. See .env.example for the full documented list with
placeholder values — nothing here should have a real secret as a default.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- App ---
    PROJECT_NAME: str = "Miles Tech Video Discovery Platform"
    ENVIRONMENT: str = "development"  # development | staging | production
    API_V1_PREFIX: str = "/api/v1"
    DEBUG: bool = True

    # --- CORS ---
    # Comma-separated list of allowed origins, e.g. "http://localhost:5173,https://app.milestech.ai"
    CORS_ORIGINS: str = "http://localhost:5173"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    # --- Database (PostgreSQL) ---
    DATABASE_URL: str = "postgresql+psycopg://milestech:milestech@localhost:5432/milestech"

    # --- Redis (cache, sessions, job queues) ---
    REDIS_URL: str = "redis://localhost:6379/0"

    # --- Auth / JWT ---
    JWT_SECRET_KEY: str = "change-me-in-env"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24h
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 30  # 30 days

    # --- OTP provider (SMS/email one-time-passcode delivery) ---
    OTP_PROVIDER: str = "africastalking"  # africastalking | twilio | console (dev)
    OTP_SENDER_ID: str = ""
    AFRICASTALKING_USERNAME: str = ""
    AFRICASTALKING_API_KEY: str = ""

    # --- Search (Meilisearch) ---
    MEILISEARCH_URL: str = "http://localhost:7700"
    MEILISEARCH_MASTER_KEY: str = "change-me-in-env"

    # --- Managed video API (Cloudflare Stream / Bunny Stream — pick one) ---
    VIDEO_API_PROVIDER: str = "cloudflare_stream"  # cloudflare_stream | bunny_stream
    CLOUDFLARE_ACCOUNT_ID: str = ""
    CLOUDFLARE_STREAM_API_TOKEN: str = ""
    BUNNY_STREAM_LIBRARY_ID: str = ""
    BUNNY_STREAM_API_KEY: str = ""

    # --- Object storage for images/docs (Cloudflare R2 or DO Spaces, S3-compatible) ---
    OBJECT_STORAGE_ENDPOINT: str = ""
    OBJECT_STORAGE_REGION: str = "auto"
    OBJECT_STORAGE_BUCKET: str = "miles-tech-media"
    OBJECT_STORAGE_ACCESS_KEY: str = ""
    OBJECT_STORAGE_SECRET_KEY: str = ""

    # --- M-Pesa Daraja (fast-follow, Weeks 13-18 — apply now, lead time is the bottleneck) ---
    MPESA_ENV: str = "sandbox"  # sandbox | production
    MPESA_CONSUMER_KEY: str = ""
    MPESA_CONSUMER_SECRET: str = ""
    MPESA_SHORTCODE: str = ""
    MPESA_PASSKEY: str = ""
    MPESA_CALLBACK_BASE_URL: str = "http://localhost:8000"

    # --- Monitoring ---
    SENTRY_DSN: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
