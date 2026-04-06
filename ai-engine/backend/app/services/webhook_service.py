"""Servicio para envío de webhooks con retries y backoff."""

import asyncio
import hashlib
import hmac
import json
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import httpx
from sqlalchemy.orm import Session

from ..models.webhook import (
    WebhookSubscription,
    WebhookDelivery,
    WebhookDeliveryStatus,
    WebhookEvent,
)

logger = logging.getLogger(__name__)


class WebhookService:
    """Servicio para gestión y envío de webhooks."""

    def __init__(self, db: Session):
        self.db = db
        self.client = httpx.AsyncClient(timeout=30.0)

    async def close(self):
        """Cerrar el cliente HTTP."""
        await self.client.aclose()

    # ========================================================================
    # Gestión de Suscripciones
    # ========================================================================

    def get_subscriptions_for_event(self, event_type: str) -> List[WebhookSubscription]:
        """Obtiene suscripciones activas para un evento."""
        return (
            self.db.query(WebhookSubscription)
            .filter(
                WebhookSubscription.event_type == event_type,
                WebhookSubscription.active == True,
            )
            .all()
        )

    def create_subscription(
        self,
        name: str,
        event_type: str,
        target_url: str,
        secret: Optional[str] = None,
        headers: Optional[Dict[str, str]] = None,
        created_by: Optional[int] = None,
    ) -> WebhookSubscription:
        """Crea una nueva suscripción."""
        # Validar event_type
        valid_events = [e.value for e in WebhookEvent]
        if event_type not in valid_events:
            raise ValueError(
                f"Evento inválido. Válidos: {', '.join(valid_events)}"
            )

        subscription = WebhookSubscription(
            name=name,
            description=None,
            event_type=event_type,
            target_url=target_url,
            secret=secret,
            headers=headers,
            created_by=created_by,
            active=True,
        )

        self.db.add(subscription)
        self.db.commit()
        self.db.refresh(subscription)

        logger.info(f"Webhook creado: {subscription.id} para {event_type}")
        return subscription

    def update_subscription(
        self,
        subscription_id: int,
        name: Optional[str] = None,
        target_url: Optional[str] = None,
        secret: Optional[str] = None,
        headers: Optional[Dict[str, str]] = None,
        active: Optional[bool] = None,
    ) -> Optional[WebhookSubscription]:
        """Actualiza una suscripción existente."""
        subscription = (
            self.db.query(WebhookSubscription)
            .filter(WebhookSubscription.id == subscription_id)
            .first()
        )

        if not subscription:
            return None

        if name is not None:
            subscription.name = name
        if target_url is not None:
            subscription.target_url = target_url
        if secret is not None:
            subscription.secret = secret
        if headers is not None:
            subscription.headers = headers
        if active is not None:
            subscription.active = active

        subscription.updated_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(subscription)

        return subscription

    def delete_subscription(self, subscription_id: int) -> bool:
        """Elimina una suscripción."""
        subscription = (
            self.db.query(WebhookSubscription)
            .filter(WebhookSubscription.id == subscription_id)
            .first()
        )

        if not subscription:
            return False

        self.db.delete(subscription)
        self.db.commit()

        logger.info(f"Webhook eliminado: {subscription_id}")
        return True

    def get_deliveries(
        self, subscription_id: int, limit: int = 50
    ) -> List[WebhookDelivery]:
        """Obtiene historial de entregas para una suscripción."""
        return (
            self.db.query(WebhookDelivery)
            .filter(WebhookDelivery.subscription_id == subscription_id)
            .order_by(WebhookDelivery.created_at.desc())
            .limit(limit)
            .all()
        )

    # ========================================================================
    # Envío de Webhooks
    # ========================================================================

    def _sign_payload(self, payload: str, secret: str) -> str:
        """Firma el payload con HMAC-SHA256."""
        signature = hmac.new(
            secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        return f"sha256={signature}"

    async def send_webhook(
        self,
        subscription: WebhookSubscription,
        payload: Dict[str, Any],
        event_type: str,
    ) -> WebhookDelivery:
        """
        Envía un webhook con retry automático.

        Args:
            subscription: Suscripción a la que enviar
            payload: Datos del evento
            event_type: Tipo de evento

        Returns:
            WebhookDelivery con el resultado
        """
        # Crear registro de entrega
        delivery = WebhookDelivery(
            subscription_id=subscription.id,
            event_type=event_type,
            payload=payload,
            status=WebhookDeliveryStatus.PENDING,
        )
        self.db.add(delivery)
        self.db.commit()

        # Preparar request
        payload_str = json.dumps(payload)
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Gordo-AI-Webhooks/1.0",
            "X-Webhook-Event": event_type,
            "X-Webhook-Delivery-ID": str(delivery.id),
        }

        # Añadir headers custom
        if subscription.headers:
            headers.update(subscription.headers)

        # Firmar payload si hay secret
        if subscription.secret:
            signature = self._sign_payload(payload_str, subscription.secret)
            headers["X-Webhook-Signature"] = signature

        # Intentar envío con retries
        max_attempts = delivery.max_attempts
        backoff_seconds = 1  # Backoff exponencial

        for attempt in range(1, max_attempts + 1):
            try:
                delivery.attempt_count = attempt
                self.db.commit()

                logger.info(
                    f"Enviando webhook {delivery.id} a {subscription.target_url} (intento {attempt})"
                )

                response = await self.client.post(
                    subscription.target_url,
                    headers=headers,
                    content=payload_str,
                )

                delivery.response_status = response.status_code
                delivery.response_body = response.text[:1000]  # Truncar

                if 200 <= response.status_code < 300:
                    # Éxito
                    delivery.status = WebhookDeliveryStatus.SUCCESS
                    delivery.delivered_at = datetime.utcnow()

                    # Actualizar estadísticas de suscripción
                    subscription.success_count += 1
                    subscription.last_triggered_at = datetime.utcnow()

                    logger.info(
                        f"Webhook {delivery.id} enviado exitosamente (status: {response.status_code})"
                    )
                    break
                else:
                    # Error HTTP
                    delivery.error_message = f"HTTP {response.status_code}: {response.text[:200]}"
                    delivery.status = WebhookDeliveryStatus.FAILED

                    if attempt < max_attempts:
                        delivery.status = WebhookDeliveryStatus.RETRYING
                        delivery.next_retry_at = datetime.utcnow() + timedelta(
                            seconds=backoff_seconds
                        )
                        backoff_seconds *= 2  # Exponencial

                    logger.warning(
                        f"Webhook {delivery.id} falló con status {response.status_code}"
                    )

            except httpx.RequestError as e:
                # Error de conexión/timeout
                delivery.error_message = f"Request error: {str(e)}"
                delivery.status = WebhookDeliveryStatus.FAILED

                if attempt < max_attempts:
                    delivery.status = WebhookDeliveryStatus.RETRYING
                    delivery.next_retry_at = datetime.utcnow() + timedelta(
                        seconds=backoff_seconds
                    )
                    backoff_seconds *= 2

                    logger.warning(
                        f"Webhook {delivery.id} error en intento {attempt}: {e}"
                    )

            self.db.commit()

            # Esperar antes del próximo retry
            if attempt < max_attempts and delivery.status == WebhookDeliveryStatus.RETRYING:
                await asyncio.sleep(backoff_seconds / 2)

        # Si falló todos los intentos
        if delivery.status != WebhookDeliveryStatus.SUCCESS:
            subscription.failure_count += 1
            self.db.commit()

            logger.error(
                f"Webhook {delivery.id} falló después de {delivery.attempt_count} intentos"
            )

        return delivery

    # ========================================================================
    # Métodos de Conveniencia para Eventos
    # ========================================================================

    async def emit_event(
        self, event_type: str, data: Dict[str, Any], metadata: Optional[Dict[str, Any]] = None
    ):
        """
        Emite un evento a todas las suscripciones correspondientes.

        Args:
            event_type: Tipo de evento (ej: "job.completed")
            data: Datos del evento
            metadata: Metadata opcional (timestamp, request_id, etc.)
        """
        subscriptions = self.get_subscriptions_for_event(event_type)

        if not subscriptions:
            logger.debug(f"No hay suscriptores para {event_type}")
            return

        payload = {
            "id": f"evt_{datetime.utcnow().timestamp()}",
            "type": event_type,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "data": data,
            **(metadata or {}),
        }

        logger.info(f"Emitiendo evento {event_type} a {len(subscriptions)} suscriptores")

        # Enviar a todos los suscriptores en paralelo
        tasks = [
            self.send_webhook(subscription, payload, event_type)
            for subscription in subscriptions
        ]

        await asyncio.gather(*tasks, return_exceptions=True)


# ========================================================================
# Funciones Helper para usar desde otros módulos
# ========================================================================

_webhook_service: Optional[WebhookService] = None


def get_webhook_service(db: Session) -> WebhookService:
    """Obtiene o crea el servicio de webhooks."""
    global _webhook_service
    if _webhook_service is None:
        _webhook_service = WebhookService(db)
    return _webhook_service


async def emit_webhook_event(
    db: Session, event_type: str, data: Dict[str, Any], metadata: Optional[Dict[str, Any]] = None
):
    """
    Función helper para emitir eventos desde cualquier parte del código.

    Uso:
        await emit_webhook_event(
            db,
            "job.completed",
            {"job_id": 123, "status": "completed"},
        )
    """
    service = get_webhook_service(db)
    await service.emit_event(event_type, data, metadata)
