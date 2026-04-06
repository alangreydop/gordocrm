"""Rutas para gestión de pipelines."""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional, Any

from ...core.database import get_db
from ...core.security import decode_access_token
from ...models.pipeline import Pipeline, PipelineNode, PipelineEdge

router = APIRouter()
security = HTTPBearer()


class PipelineCreate(BaseModel):
    name: str
    description: Optional[str] = None
    version: str = "1.0.0"
    requires_approval: bool = True
    graph_config: dict = {}


class PipelineUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    version: Optional[str] = None
    is_active: Optional[bool] = None
    requires_approval: Optional[bool] = None
    graph_config: Optional[dict] = None


class PipelineResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    version: str
    is_active: bool
    requires_approval: bool
    graph_config: dict
    node_count: int = 0
    edge_count: int = 0

    class Config:
        from_attributes = True


def get_current_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)) -> int:
    """Extrae el user_id del token JWT."""
    payload = decode_access_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Token inválido")
    return int(payload.get("sub"))


@router.get("", response_model=List[PipelineResponse])
async def list_pipelines(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Lista todos los pipelines del usuario."""
    pipelines = db.query(Pipeline).filter(Pipeline.is_active == True).all()
    return pipelines


@router.post("", response_model=PipelineResponse)
async def create_pipeline(
    pipeline_data: PipelineCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Crea un nuevo pipeline."""
    pipeline = Pipeline(
        **pipeline_data.model_dump(),
        created_by=user_id,
    )
    db.add(pipeline)
    db.commit()
    db.refresh(pipeline)
    return pipeline


@router.get("/{pipeline_id}", response_model=PipelineResponse)
async def get_pipeline(
    pipeline_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Obtiene los detalles de un pipeline específico."""
    pipeline = db.query(Pipeline).filter(Pipeline.id == pipeline_id).first()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline no encontrado")
    return pipeline


@router.put("/{pipeline_id}", response_model=PipelineResponse)
async def update_pipeline(
    pipeline_id: int,
    pipeline_data: PipelineUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Actualiza un pipeline existente."""
    pipeline = db.query(Pipeline).filter(Pipeline.id == pipeline_id).first()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline no encontrado")

    update_data = pipeline_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(pipeline, field, value)

    db.commit()
    db.refresh(pipeline)
    return pipeline


@router.delete("/{pipeline_id}")
async def delete_pipeline(
    pipeline_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Elimina un pipeline (soft delete)."""
    pipeline = db.query(Pipeline).filter(Pipeline.id == pipeline_id).first()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline no encontrado")

    pipeline.is_active = False
    db.commit()
    return {"message": "Pipeline eliminado correctamente"}


# --- Node Management ---


class NodeCreate(BaseModel):
    node_id: str
    node_type: str
    config: dict = {}
    is_required: bool = True
    timeout_seconds: int = 3600
    max_retries: int = 3
    position_x: int = 0
    position_y: int = 0


class EdgeCreate(BaseModel):
    source_node_id: str
    target_node_id: str
    source_handle: Optional[str] = None
    target_handle: Optional[str] = None
    condition: Optional[dict] = None


@router.post("/{pipeline_id}/nodes")
async def add_node(
    pipeline_id: int,
    node_data: NodeCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Añade un nodo a un pipeline."""
    pipeline = db.query(Pipeline).filter(Pipeline.id == pipeline_id).first()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline no encontrado")

    # Verificar que no exista otro nodo con el mismo node_id
    existing = db.query(PipelineNode).filter(
        PipelineNode.pipeline_id == pipeline_id,
        PipelineNode.node_id == node_data.node_id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="El node_id ya existe en este pipeline")

    node = PipelineNode(pipeline_id=pipeline_id, **node_data.model_dump())
    db.add(node)
    db.commit()
    return {"message": "Nodo añadido correctamente", "node_id": node.node_id}


@router.post("/{pipeline_id}/edges")
async def add_edge(
    pipeline_id: int,
    edge_data: EdgeCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Añade una conexión entre nodos de un pipeline."""
    pipeline = db.query(Pipeline).filter(Pipeline.id == pipeline_id).first()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline no encontrado")

    edge = PipelineEdge(pipeline_id=pipeline_id, **edge_data.model_dump())
    db.add(edge)
    db.commit()
    return {"message": "Conexión añadida correctamente"}
