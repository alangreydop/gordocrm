"""Rutas para gestión de jobs/ejecuciones."""

import asyncio
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from sqlalchemy.sql import func

from ...core.database import get_db
from ...core.security import decode_access_token
from ...models.job import Job, JobStatus, JobApproval
from ...models.pipeline import Pipeline
from ...services.pipeline_executor import execute_pipeline_task, resume_pipeline_task
from ...services.webhook_service import emit_webhook_event

router = APIRouter()
security = HTTPBearer()


def get_current_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)) -> int:
    """Extrae el user_id del token JWT."""
    payload = decode_access_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Token inválido")
    return int(payload.get("sub"))


class JobCreate(BaseModel):
    pipeline_id: int
    name: str
    description: Optional[str] = None
    input_data: dict = {}


class JobResponse(BaseModel):
    id: int
    pipeline_id: int
    name: str
    status: str
    current_node_id: Optional[str]
    input_data: dict
    output_data: Optional[dict]
    error_message: Optional[str]
    created_at: str
    started_at: Optional[str]
    completed_at: Optional[str]

    class Config:
        from_attributes = True


class ApprovalRequest(BaseModel):
    approved: bool
    comments: Optional[str] = None


@router.get("", response_model=List[JobResponse])
async def list_jobs(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    status_filter: Optional[str] = None,
    limit: int = 50,
):
    """Lista jobs del usuario, opcionalmente filtrados por estado."""
    query = db.query(Job).filter(Job.created_by == user_id)

    if status_filter:
        try:
            status_enum = JobStatus(status_filter)
            query = query.filter(Job.status == status_enum)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Estado inválido: {status_filter}")

    jobs = query.order_by(Job.created_at.desc()).limit(limit).all()
    return jobs


@router.post("", response_model=JobResponse)
async def create_job(
    job_data: JobCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Crea y enqueue un nuevo job para un pipeline."""
    # Verificar que el pipeline existe
    pipeline = db.query(Pipeline).filter(Pipeline.id == job_data.pipeline_id).first()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline no encontrado")

    # Crear el job
    job = Job(
        pipeline_id=job_data.pipeline_id,
        name=job_data.name,
        description=job_data.description,
        input_data=job_data.input_data,
        status=JobStatus.PENDING,
        created_by=user_id,
    )

    db.add(job)
    db.commit()
    db.refresh(job)

    # Encolar para ejecución en Celery
    execute_pipeline_task.delay(job.id)

    return job


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Obtiene los detalles de un job específico."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")

    # Verificar permisos
    if job.created_by != user_id:
        raise HTTPException(status_code=403, detail="No tienes permiso para ver este job")

    return job


@router.post("/{job_id}/cancel")
async def cancel_job(
    job_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Cancela un job en ejecución."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")

    if job.status not in [JobStatus.PENDING, JobStatus.QUEUED, JobStatus.RUNNING]:
        raise HTTPException(status_code=400, detail="Solo se pueden cancelar jobs pendientes o en ejecución")

    job.status = JobStatus.CANCELLED
    db.commit()

    # Cancelar tarea de Celery si está en ejecución
    from ...services.celery_app import celery_app
    celery_app.control.revoke(execute_pipeline_task.task_id, terminate=True)

    return {"message": "Job cancelado correctamente"}


# --- Approval Endpoints ---


class ApprovalResponse(BaseModel):
    id: int
    job_id: int
    node_id: str
    status: str
    preview_data: Optional[dict]
    created_at: str
    approved_at: Optional[str]
    approver_email: Optional[str]


@router.get("/{job_id}/approvals", response_model=List[ApprovalResponse])
async def list_job_approvals(
    job_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Lista las aprobaciones pendientes de un job."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")

    approvals = db.query(JobApproval).filter(JobApproval.job_id == job_id).all()

    result = []
    for approval in approvals:
        approver_email = None
        if approval.approver:
            approver_email = approval.approver.email

        result.append({
            "id": approval.id,
            "job_id": approval.job_id,
            "node_id": approval.node_id,
            "status": approval.status,
            "preview_data": approval.preview_data,
            "created_at": approval.created_at.isoformat() if approval.created_at else None,
            "approved_at": approval.approved_at.isoformat() if approval.approved_at else None,
            "approver_email": approver_email,
        })

    return result


@router.post("/{job_id}/approvals/{node_id}")
async def request_approval(
    job_id: int,
    node_id: str,
    preview_data: Optional[Dict[str, Any]] = None,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Solicita aprobación humana en un punto del pipeline."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")

    # Crear registro de aprobación pendiente
    approval = JobApproval(
        job_id=job_id,
        node_id=node_id,
        status="pending",
        preview_data=preview_data,
    )

    db.add(approval)
    db.commit()
    db.refresh(approval)

    return {"message": "Aprobación solicitada", "approval_id": approval.id}


@router.post("/approvals/{approval_id}/decide")
async def decide_approval(
    approval_id: int,
    decision: ApprovalRequest,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Decide una aprobación pendiente (aprobar o rechazar)."""
    approval = db.query(JobApproval).filter(JobApproval.id == approval_id).first()
    if not approval:
        raise HTTPException(status_code=404, detail="Aprobación no encontrada")

    if approval.status != "pending":
        raise HTTPException(status_code=400, detail="Esta aprobación ya fue resuelta")

    # Actualizar aprobación
    approval.status = "approved" if decision.approved else "rejected"
    approval.decision = "approved" if decision.approved else "rejected"
    approval.comments = decision.comments
    approval.approved_by = user_id
    approval.approved_at = func.now()

    db.commit()

    # Reanudar ejecución del pipeline si fue aprobado
    if decision.approved:
        resume_pipeline_task.delay(approval.job_id, approval.node_id)

    # Emitir evento de aprobación
    event_type = "approval.approved" if decision.approved else "approval.rejected"
    asyncio.create_task(
        emit_webhook_event(
            db,
            event_type,
            {
                "approval_id": approval_id,
                "job_id": approval.job_id,
                "node_id": approval.node_id,
                "decided_by": user_id,
                "comments": decision.comments,
            },
        )
    )

    return {"message": f"Aprobación {'aprobada' if decision.approved else 'rechazada'} correctamente"}
