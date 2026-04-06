"""Modelos de base de datos para jobs/ejecuciones."""

from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, JSON, Text, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum

from ..core.database import Base


class JobStatus(str, enum.Enum):
    """Estados posibles de un job."""

    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    WAITING_APPROVAL = "waiting_approval"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class Job(Base):
    """Ejecución individual de un pipeline."""

    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    pipeline_id = Column(Integer, ForeignKey("pipelines.id"), nullable=False)

    # Identificación
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    # Estado
    status = Column(SQLEnum(JobStatus), default=JobStatus.PENDING)
    current_node_id = Column(String(100), nullable=True)  # Nodo en ejecución

    # Input/Output
    input_data = Column(JSON, nullable=False, default=dict)
    output_data = Column(JSON, nullable=True)

    # Resultados intermedios por nodo
    # {node_id: {status, output, error, timestamp}}
    node_results = Column(JSON, nullable=True, default=dict)

    # Errores
    error_message = Column(Text, nullable=True)
    error_details = Column(JSON, nullable=True)

    # Timing
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Relaciones
    pipeline = relationship("Pipeline", back_populates="jobs")
    creator = relationship("User", backref="jobs")
    approvals = relationship("JobApproval", back_populates="job", cascade="all, delete-orphan")


class JobApproval(Base):
    """Aprobaciones humanas en puntos del pipeline."""

    __tablename__ = "job_approvals"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False)

    # Nodo que requiere aprobación
    node_id = Column(String(100), nullable=False)

    # Estado
    status = Column(String(20), nullable=False)  # 'pending', 'approved', 'rejected'

    # Decisión
    decision = Column(String(20), nullable=True)  # 'approved', 'rejected'
    comments = Column(Text, nullable=True)

    # Preview data (lo que el humano ve para aprobar)
    preview_data = Column(JSON, nullable=True)

    # Metadata
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    job = relationship("Job", back_populates="approvals")
    approver = relationship("User", backref="approvals")
