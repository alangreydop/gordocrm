"""Configuración central del AI Engine."""

import os
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    """Configuración de la aplicación."""

    # App
    PROJECT_NAME: str = "Grande&Gordo AI Engine"
    VERSION: str = "0.1.0"
    API_V1_PREFIX: str = "/api/v1"

    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/gordo_ai"
    )

    # Redis/Celery
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    CELERY_BROKER_URL: str = REDIS_URL
    CELERY_RESULT_BACKEND: str = REDIS_URL

    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-secret-key-change-in-prod")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # APIs Externas
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    KIE_API_KEY: str = os.getenv("KIE_API_KEY", "")
    KLING_API_KEY: str = os.getenv("KLING_API_KEY", "")  # Video generation

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:5173",
        "http://localhost:8000",
        "http://localhost:4321",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:4321",
        "http://127.0.0.1:8787",  # CRM Cloudflare Workers
        "https://gordocrm-api-production.alangreydop.workers.dev",  # CRM Production
    ]

    # CRM Integration
    CRM_WEBHOOK_URL: str = os.getenv(
        "CRM_WEBHOOK_URL", "http://127.0.0.1:8787/api/portal/webhooks"
    )
    WEBHOOK_SECRET: str = os.getenv("WEBHOOK_SECRET", "gordo-ai-engine-secret-key-2026")

    # Pipeline
    PIPELINE_STORAGE_PATH: str = os.getenv(
        "PIPELINE_STORAGE_PATH", "./pipelines"
    )
    MAX_RETRIES: int = 3
    TASK_TIMEOUT: int = 3600  # 1 hour

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
