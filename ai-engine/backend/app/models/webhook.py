"""Modelos para sistema de webhooks."""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, JSON, Text, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum

from ..core.database import Base


class WebhookEvent(str, enum.Enum):
    """Eventos disponibles para suscripción."""

    # Pipeline events
    PIPELINE_CREATED = "pipeline.created"
    PIPELINE_UPDATED = "pipeline.updated"
    PIPELINE_DELETED = "pipeline.deleted"

    # Job events
    JOB_STARTED = "job.started"
    JOB_COMPLETED = "job.completed"
    JOB_FAILED = "job.failed"
    JOB_CANCELLED = "job.cancelled"

    # Approval events
    APPROVAL_PENDING = "approval.pending"
    APPROVAL_APPROVED = "approval.approved"
    APPROVAL_REJECTED = "approval.rejected"


class WebhookSubscription(Base):
    """Suscripción a eventos del sistema."""

    __tablename__ = "webhook_subscriptions"

    id = Column(Integer, primary_key=True, index=True)

    # Configuración
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    # Evento y target
    event_type = Column(String(50), nullable=False, index=True)
    target_url = Column(String(512), nullable=False)

    # Seguridad
    secret = Column(String(255), nullable=True)  # Para firmar payloads
    headers = Column(JSON, nullable=True)  # Headers custom

    # Estado
    active = Column(Boolean, default=True)

    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    created_by = Column(Integer, index=True)

    # Estadísticas
    last_triggered_at = Column(DateTime(timezone=True), nullable=True)
    success_count = Column(Integer, default=0)
    failure_count = Column(Integer, default=0)

    # Relaciones
    deliveries = relationship(
        "WebhookDelivery",
        back_populates="subscription",
        cascade="all, delete-orphan",
    )


class WebhookDeliveryStatus(str, enum.Enum):
    """Estados de entrega de webhook."""

    PENDING = "pending"
    SUCCESS = "success"
    FAILED = "failed"
    RETRYING = "retrying"


class WebhookDelivery(Base):
    """Registro de intentos de entrega de webhooks."""

    __tablename__ = "webhook_deliveries"

    id = Column(Integer, primary_key=True, index=True)
    subscription_id = Column(
        Integer, ForeignKey("webhook_subscriptions.id"), index=True, nullable=False
    )

    # Datos del evento
    event_type = Column(String(50), nullable=False)
    payload = Column(JSON, nullable=False)

    # Estado
    status = Column(String(20), default=WebhookDeliveryStatus.PENDING)

    # Intentos
    attempt_count = Column(Integer, default=0)
    max_attempts = Column(Integer, default=5)
    next_retry_at = Column(DateTime(timezone=True), nullable=True)

    # Resultado
    response_status = Column(Integer, nullable=True)
    response_body = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)

    # Timing
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    delivered_at = Column(DateTime(timezone=True), nullable=True)

    # Relaciones
    subscription = relationship("WebhookSubscription", back_populates="deliveries")
