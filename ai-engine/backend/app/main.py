"""Aplicación principal FastAPI."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.config import settings
from .api import router as api_router


def create_application() -> FastAPI:
    """Factory para crear la aplicación FastAPI."""

    application = FastAPI(
        title=settings.PROJECT_NAME,
        version=settings.VERSION,
        openapi_url=f"{settings.API_V1_PREFIX}/openapi.json",
    )

    # CORS
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Routers
    application.include_router(api_router, prefix=settings.API_V1_PREFIX)

    @application.get("/health")
    async def health_check():
        return {"status": "healthy", "version": settings.VERSION}

    return application


app = create_application()
