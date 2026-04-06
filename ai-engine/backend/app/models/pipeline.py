"""Modelos de base de datos para pipelines."""

from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, JSON, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from ..core.database import Base


class Pipeline(Base):
    """Pipeline de AI - representa un flujo completo de procesamiento."""

    __tablename__ = "pipelines"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    version = Column(String(50), default="1.0.0")

    # Estado
    is_active = Column(Boolean, default=True)
    requires_approval = Column(Boolean, default=True)  # Human-in-the-loop

    # Estructura del pipeline (grafo)
    # nodes: lista de nodos con config
    # edges: conexiones entre nodos
    graph_config = Column(JSON, nullable=False, default=dict)

    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Relaciones
    jobs = relationship("Job", back_populates="pipeline", cascade="all, delete-orphan")
    creator = relationship("User", backref="pipelines")


class PipelineNode(Base):
    """Nodo individual dentro de un pipeline."""

    __tablename__ = "pipeline_nodes"

    id = Column(Integer, primary_key=True, index=True)
    pipeline_id = Column(Integer, ForeignKey("pipelines.id"), nullable=False)

    # Identificación
    node_id = Column(String(100), nullable=False)  # ID único en el grafo
    node_type = Column(String(50), nullable=False)  # 'gemini_image', 'luma_video', 'approval', etc.

    # Configuración específica del nodo
    config = Column(JSON, nullable=False, default=dict)

    # Estado
    is_required = Column(Boolean, default=True)
    timeout_seconds = Column(Integer, default=3600)
    max_retries = Column(Integer, default=3)

    # Ordenamiento
    position_x = Column(Integer, default=0)  # Para React Flow
    position_y = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    pipeline = relationship("Pipeline", backref="nodes")


class PipelineEdge(Base):
    """Conexión entre nodos de un pipeline."""

    __tablename__ = "pipeline_edges"

    id = Column(Integer, primary_key=True, index=True)
    pipeline_id = Column(Integer, ForeignKey("pipelines.id"), nullable=False)

    # Conexiones
    source_node_id = Column(String(100), nullable=False)
    target_node_id = Column(String(100), nullable=False)

    # Metadata de la conexión
    source_handle = Column(String(50), nullable=True)  # Para React Flow
    target_handle = Column(String(50), nullable=True)

    # Condiciones (opcional)
    condition = Column(JSON, nullable=True)  # Ej: {"if": "approved"}

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    pipeline = relationship("Pipeline", backref="edges")
