"""Rutas para gestión de webhooks."""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...models.webhook import WebhookEvent
from ...services.webhook_service import get_webhook_service, emit_webhook_event

router = APIRouter()


# === Schemas ===

class WebhookSubscriptionCreate(BaseModel):
    """Schema para crear suscripción."""

    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    event_type: str
    target_url: str = Field(..., max_length=512)
    secret: Optional[str] = Field(None, max_length=255)
    headers: Optional[Dict[str, str]] = None


class WebhookSubscriptionUpdate(BaseModel):
    """Schema para actualizar suscripción."""

    name: Optional[str] = Field(None, max_length=255)
    target_url: Optional[str] = Field(None, max_length=512)
    secret: Optional[str] = Field(None, max_length=255)
    headers: Optional[Dict[str, str]] = None
    active: Optional[bool] = None


class WebhookDeliveryResponse(BaseModel):
    """Schema para respuesta de entrega."""

    id: int
    event_type: str
    status: str
    attempt_count: int
    response_status: Optional[int]
    error_message: Optional[str]
    created_at: str
    delivered_at: Optional[str]


class WebhookSubscriptionResponse(BaseModel):
    """Schema para respuesta de suscripción."""

    id: int
    name: str
    description: Optional[str]
    event_type: str
    target_url: str
    active: bool
    created_at: str
    last_triggered_at: Optional[str]
    success_count: int
    failure_count: int

    class Config:
        from_attributes = True


# === Routes ===

@router.get("/events", response_model=List[str])
async def list_webhook_events():
    """Lista todos los eventos disponibles para suscripción."""
    return [event.value for event in WebhookEvent]


@router.post("", response_model=WebhookSubscriptionResponse, status_code=status.HTTP_201_CREATED)
async def create_webhook(
    subscription: WebhookSubscriptionCreate,
    db: Session = Depends(get_db),
):
    """Crea una nueva suscripción a webhooks."""
    service = get_webhook_service(db)

    try:
        new_subscription = service.create_subscription(
            name=subscription.name,
            description=subscription.description,
            event_type=subscription.event_type,
            target_url=subscription.target_url,
            secret=subscription.secret,
            headers=subscription.headers,
        )
        return new_subscription
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("", response_model=List[WebhookSubscriptionResponse])
async def list_webhooks(
    active: Optional[bool] = None,
    event_type: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Lista suscripciones de webhooks."""
    query = db.query(type(get_webhook_service(db).get_subscriptions_for_event("")[0]))

    if active is not None:
        query = query.filter(type(get_webhook_service(db).get_subscriptions_for_event("")[0]).active == active)

    if event_type is not None:
        query = query.filter(type(get_webhook_service(db).get_subscriptions_for_event("")[0]).event_type == event_type)

    subscriptions = query.all()
    return subscriptions


@router.get("/{subscription_id}", response_model=WebhookSubscriptionResponse)
async def get_webhook(
    subscription_id: int,
    db: Session = Depends(get_db),
):
    """Obtiene detalles de una suscripción."""
    service = get_webhook_service(db)

    # Obtener suscripción directamente
    subscription = db.query(type(service.get_subscriptions_for_event("")[0])).filter(
        type(service.get_subscriptions_for_event("")[0]).id == subscription_id
    ).first()

    if not subscription:
        raise HTTPException(status_code=404, detail="Suscripción no encontrada")

    return subscription


@router.put("/{subscription_id}", response_model=WebhookSubscriptionResponse)
async def update_webhook(
    subscription_id: int,
    update: WebhookSubscriptionUpdate,
    db: Session = Depends(get_db),
):
    """Actualiza una suscripción existente."""
    service = get_webhook_service(db)

    updated = service.update_subscription(
        subscription_id=subscription_id,
        name=update.name,
        target_url=update.target_url,
        secret=update.secret,
        headers=update.headers,
        active=update.active,
    )

    if not updated:
        raise HTTPException(status_code=404, detail="Suscripción no encontrada")

    return updated


@router.delete("/{subscription_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_webhook(
    subscription_id: int,
    db: Session = Depends(get_db),
):
    """Elimina una suscripción."""
    service = get_webhook_service(db)

    if not service.delete_subscription(subscription_id):
        raise HTTPException(status_code=404, detail="Suscripción no encontrada")

    return None


@router.get("/{subscription_id}/deliveries", response_model=List[WebhookDeliveryResponse])
async def get_webhook_deliveries(
    subscription_id: int,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """Obtiene historial de entregas para una suscripción."""
    service = get_webhook_service(db)

    deliveries = service.get_deliveries(subscription_id, limit)
    return deliveries


@router.post("/test", status_code=status.HTTP_202_ACCEPTED)
async def test_webhook(
    target_url: str,
    secret: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Envía un webhook de prueba a la URL especificada.

    Útil para verificar que el endpoint receptor funciona correctamente.
    """
    service = get_webhook_service(db)

    # Crear suscripción temporal
    temp_subscription = service.create_subscription(
        name="Test webhook",
        event_type="test.ping",
        target_url=target_url,
        secret=secret,
    )

    # Enviar evento de prueba
    payload = {
        "message": "This is a test webhook from Gordo AI Engine",
        "timestamp": "2025-04-06T00:00:00Z",
    }

    await service.send_webhook(temp_subscription, payload, "test.ping")

    # Eliminar suscripción temporal
    service.delete_subscription(temp_subscription.id)

    return {"status": "test_sent", "target_url": target_url}
