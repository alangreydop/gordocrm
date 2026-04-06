"""Configuración de Celery para tareas asíncronas."""

from celery import Celery
from ..core.config import settings


def make_celery() -> Celery:
    """Crea y configura la instancia de Celery."""

    celery_app = Celery(
        "gordo_ai_engine",
        broker=settings.CELERY_BROKER_URL,
        backend=settings.CELERY_RESULT_BACKEND,
    )

    # Configuración de tareas
    celery_app.conf.update(
        task_serializer="json",
        accept_content=["json"],
        result_serializer="json",
        timezone="UTC",
        enable_utc=True,
        task_track_started=True,
        task_time_limit=settings.TASK_TIMEOUT,
        worker_prefetch_multiplier=1,  # Fair scheduling
        task_routes={
            "app.services.pipeline_executor.*": {"queue": "pipelines"},
            "app.services.node_executors.*": {"queue": "nodes"},
        },
    )

    return celery_app


celery_app = make_celery()
