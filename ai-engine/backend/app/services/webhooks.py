"""Servicio de envío de webhooks."""

import httpx
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.core.security import create_webhook_signature

logger = logging.getLogger(__name__)

# URL del CRM para recibir webhooks (producción)
CRM_WEBHOOK_URL = "https://gordocrm-api-production.alangreydop.workers.dev/api/portal/webhooks/ai-engine"

# Shared secret para firmar webhooks
WEBHOOK_SECRET = "gordo-ai-engine-secret-key-2026"


class WebhookEvent:
    """Tipos de eventos de webhook."""

    JOB_STARTED = "job.started"
    JOB_COMPLETED = "job.completed"
    JOB_FAILED = "job.failed"
    APPROVAL_PENDING = "approval.pending"
    APPROVAL_APPROVED = "approval.approved"
    APPROVAL_REJECTED = "approval.rejected"


class WebhookSender:
    """Envía webhooks al CRM con retry exponential backoff."""

    def __init__(self, max_retries: int = 3, base_delay: float = 1.0):
        self.max_retries = max_retries
        self.base_delay = base_delay

    async def send(
        self,
        event: str,
        data: Dict[str, Any],
        external_job_id: Optional[str] = None,
    ) -> bool:
        """
        Envía un webhook al CRM.

        Args:
            event: Tipo de evento (ej: "job.completed")
            data: Datos del evento
            external_job_id: ID del job en el CRM (opcional)

        Returns:
            True si se envió correctamente, False en caso contrario
        """
        payload = {
            "event": event,
            "data": {
                "external_job_id": external_job_id,
                **data,
            },
            "timestamp": datetime.utcnow().isoformat(),
        }

        import json
        payload_str = json.dumps(payload)

        # Crear firma HMAC
        signature = create_webhook_signature(payload_str, WEBHOOK_SECRET)

        headers = {
            "Content-Type": "application/json",
            "X-Webhook-Signature": signature,
            "X-Webhook-Timestamp": str(int(datetime.utcnow().timestamp())),
        }

        # Reintentos con exponential backoff
        for attempt in range(self.max_retries):
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    response = await client.post(
                        CRM_WEBHOOK_URL,
                        headers=headers,
                        content=payload_str,
                    )

                    if response.status_code == 200:
                        logger.info(f"Webhook {event} enviado correctamente")
                        return True
                    else:
                        logger.warning(
                            f"Webhook {event} falló con status {response.status_code}"
                        )

            except httpx.RequestError as e:
                logger.error(f"Error enviando webhook {event}: {e}")

            if attempt < self.max_retries - 1:
                delay = self.base_delay * (2 ** attempt)
                logger.info(f"Reintentando en {delay}s (attempt {attempt + 1})")
                import asyncio
                await asyncio.sleep(delay)

        logger.error(f"Webhook {event} falló después de {self.max_retries} intentos")
        return False


# Instancia global
webhook_sender = WebhookSender()


async def send_job_started(
    job_id: str,
    external_job_id: str,
    pipeline_id: str,
) -> bool:
    """Notifica que un job ha comenzado."""
    return await webhook_sender.send(
        event=WebhookEvent.JOB_STARTED,
        data={
            "job_id": job_id,
            "pipeline_id": pipeline_id,
            "status": "processing",
        },
        external_job_id=external_job_id,
    )


async def send_job_completed(
    job_id: str,
    external_job_id: str,
    delivery_url: str,
    outputs: List[Dict[str, Any]],
) -> bool:
    """Notifica que un job ha completado."""
    return await webhook_sender.send(
        event=WebhookEvent.JOB_COMPLETED,
        data={
            "job_id": job_id,
            "delivery_url": delivery_url,
            "outputs": outputs,
        },
        external_job_id=external_job_id,
    )


async def send_job_failed(
    job_id: str,
    external_job_id: str,
    error: str,
) -> bool:
    """Notifica que un job ha fallado."""
    return await webhook_sender.send(
        event=WebhookEvent.JOB_FAILED,
        data={
            "job_id": job_id,
            "status": error,
        },
        external_job_id=external_job_id,
    )


async def send_approval_pending(
    job_id: str,
    external_job_id: str,
    approval_id: str,
    node_id: str,
) -> bool:
    """Notifica que un job requiere aprobación."""
    return await webhook_sender.send(
        event=WebhookEvent.APPROVAL_PENDING,
        data={
            "job_id": job_id,
            "approval_id": approval_id,
            "node_id": node_id,
            "decision": "pending",
        },
        external_job_id=external_job_id,
    )


async def send_approval_approved(
    job_id: str,
    external_job_id: str,
    approval_id: str,
) -> bool:
    """Notifica que una aprobación fue aceptada."""
    return await webhook_sender.send(
        event=WebhookEvent.APPROVAL_APPROVED,
        data={
            "job_id": job_id,
            "approval_id": approval_id,
            "decision": "approved",
        },
        external_job_id=external_job_id,
    )


async def send_approval_rejected(
    job_id: str,
    external_job_id: str,
    approval_id: str,
    reason: str,
) -> bool:
    """Notifica que una aprobación fue rechazada."""
    return await webhook_sender.send(
        event=WebhookEvent.APPROVAL_REJECTED,
        data={
            "job_id": job_id,
            "approval_id": approval_id,
            "decision": "rejected",
            "reason": reason,
        },
        external_job_id=external_job_id,
    )
