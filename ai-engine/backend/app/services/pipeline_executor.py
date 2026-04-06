"""Ejecutor de pipelines usando NetworkX para orquestación DAG."""

import asyncio
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import networkx as nx
from sqlalchemy.orm import Session

from ..core.database import SessionLocal
from ..core.config import settings
from ..models.job import Job, JobStatus, JobApproval
from ..models.pipeline import Pipeline, PipelineNode, PipelineEdge
from .celery_app import celery_app
from .node_executors import get_executor, NodeExecutorError
from .webhook_service import emit_webhook_event

logger = logging.getLogger(__name__)


class PipelineExecutor:
    """Ejecuta pipelines como grafos dirigidos acíclicos (DAG)."""

    def __init__(self, db: Session, job: Job):
        self.db = db
        self.job = job
        self.pipeline = job.pipeline
        self.graph = self._build_graph()
        self.results: Dict[str, Any] = {}
        self.errors: Dict[str, str] = {}

    def _build_graph(self) -> nx.DiGraph:
        """Construye el grafo del pipeline desde la DB."""
        graph = nx.DiGraph()

        # Añadir nodos
        for node in self.pipeline.nodes:
            graph.add_node(
                node.node_id,
                node_type=node.node_type,
                config=node.config,
                timeout=node.timeout_seconds,
                max_retries=node.max_retries,
            )

        # Añadir aristas
        for edge in self.pipeline.edges:
            graph.add_edge(
                edge.source_node_id,
                edge.target_node_id,
                condition=edge.condition,
            )

        return graph

    async def execute(self) -> Tuple[bool, Optional[str]]:
        """
        Ejecuta el pipeline completo.

        Returns:
            Tuple de (éxito, mensaje de error si hubo fallo)
        """
        try:
            # Validar que es un DAG
            if not nx.is_directed_acyclic_graph(self.graph):
                raise ValueError("El pipeline debe ser un DAG (sin ciclos)")

            # Obtener orden topológico para ejecución
            execution_order = list(nx.topological_sort(self.graph))
            logger.info(f"Ejecutando pipeline {self.job.id} con orden: {execution_order}")

            # Estado inicial
            self.job.status = JobStatus.RUNNING
            self.job.started_at = datetime.utcnow()
            self.db.commit()

            # Emitir evento job.started
            asyncio.create_task(
                emit_webhook_event(
                    self.db,
                    "job.started",
                    {"job_id": self.job.id, "pipeline_id": self.job.pipeline_id},
                )
            )

            # Ejecutar nodos en orden
            for node_id in execution_order:
                self.job.current_node_id = node_id
                self.db.commit()

                success, result = await self._execute_node(node_id)

                if not success:
                    self.job.status = JobStatus.FAILED
                    self.job.error_message = self.errors.get(node_id, "Error desconocido")
                    self.job.completed_at = datetime.utcnow()
                    self.db.commit()
                    return False, self.errors[node_id]

                # Guardar resultado
                self.results[node_id] = result

            # Completado exitosamente
            self.job.status = JobStatus.COMPLETED
            self.job.output_data = self.results
            self.job.completed_at = datetime.utcnow()
            self.db.commit()

            logger.info(f"Pipeline {self.job.id} completado exitosamente")

            # Emitir evento job.completed
            asyncio.create_task(
                emit_webhook_event(
                    self.db,
                    "job.completed",
                    {
                        "job_id": self.job.id,
                        "pipeline_id": self.job.pipeline_id,
                        "status": "completed",
                        "output_data": self.results,
                    },
                )
            )

            return True, None

        except Exception as e:
            logger.exception(f"Error ejecutando pipeline {self.job.id}: {e}")
            self.job.status = JobStatus.FAILED
            self.job.error_message = str(e)
            self.job.completed_at = datetime.utcnow()
            self.db.commit()

            # Emitir evento job.failed
            asyncio.create_task(
                emit_webhook_event(
                    self.db,
                    "job.failed",
                    {
                        "job_id": self.job.id,
                        "pipeline_id": self.job.pipeline_id,
                        "status": "failed",
                        "error": str(e),
                    },
                )
            )

            return False, str(e)

    async def _execute_node(self, node_id: str) -> Tuple[bool, Any]:
        """Ejecuta un nodo individual con retries."""
        node_data = self.graph.nodes[node_id]
        max_retries = node_data.get("max_retries", 3)

        for attempt in range(max_retries):
            try:
                # Verificar si requiere aprobación humana
                if node_data["node_type"] == "approval":
                    return await self._execute_approval_node(node_id, node_data)

                # Ejecutar nodo normal
                result = await self._run_node_executor(node_id, node_data)
                return True, result

            except Exception as e:
                error_msg = f"Nodo {node_id} falló en intento {attempt + 1}: {str(e)}"
                logger.warning(error_msg)

                if attempt == max_retries - 1:
                    self.errors[node_id] = str(e)
                    return False, None

                await asyncio.sleep(2**attempt)  # Backoff exponencial

        return False, None

    async def _run_node_executor(self, node_id: str, node_data: dict) -> Any:
        """Ejecuta el executor específico para el tipo de nodo."""
        node_type = node_data["node_type"]
        config = node_data["config"]

        # Obtener inputs de nodos anteriores
        input_data = self._get_node_inputs(node_id)

        # Obtener API keys
        api_keys = {
            'gemini': settings.GEMINI_API_KEY,
            'luma': settings.LUMA_API_KEY,
            'kie': settings.KIE_API_KEY,
        }

        try:
            executor = get_executor(node_type, api_keys)
            result = await executor.execute(config, input_data)
            return result
        except NodeExecutorError as e:
            raise e

    async def _execute_approval_node(
        self, node_id: str, node_data: dict
    ) -> Tuple[bool, Any]:
        """Maneja nodos de aprobación humana."""
        config = node_data["config"]

        # Obtener datos para preview
        preview_data = self._get_node_inputs(node_id)

        # Verificar si ya existe una aprobación para este nodo
        existing_approval = self.db.query(JobApproval).filter(
            JobApproval.job_id == self.job.id,
            JobApproval.node_id == node_id,
        ).first()

        if existing_approval:
            if existing_approval.status == "approved":
                # Aprobación ya concedida - continuar
                logger.info(f"Aprobación ya concedida para nodo {node_id}")
                return True, {"status": "approved", "approval_id": existing_approval.id}
            elif existing_approval.status == "rejected":
                # Aprobación rechazada - fallar el nodo
                logger.info(f"Aprobación rechazada para nodo {node_id}")
                return False, "Aprobación rechazada por el usuario"
            else:
                # Aún pendiente - pausar
                logger.info(f"Aprobación aún pendiente para nodo {node_id}")
                self.job.status = JobStatus.WAITING_APPROVAL
                self.db.commit()
                return False, None

        # Crear nuevo registro de aprobación
        approval = JobApproval(
            job_id=self.job.id,
            node_id=node_id,
            status="pending",
            preview_data=preview_data,
        )
        self.db.add(approval)
        self.db.commit()

        # Pausar ejecución y esperar aprobación
        self.job.status = JobStatus.WAITING_APPROVAL
        self.db.commit()

        logger.info(f"Pipeline {self.job.id} esperando aprobación en nodo {node_id} (approval_id={approval.id})")

        # Emitir evento approval.pending
        asyncio.create_task(
            emit_webhook_event(
                self.db,
                "approval.pending",
                {
                    "job_id": self.job.id,
                    "approval_id": approval.id,
                    "node_id": node_id,
                },
            )
        )

        # Retornar False para pausar - se reanudará manualmente
        return False, None

    def _get_node_inputs(self, node_id: str) -> dict:
        """Obtiene los datos de entrada de un nodo desde sus predecesores."""
        predecessors = list(self.graph.predecessors(node_id))

        if not predecessors:
            # Nodo de entrada - usar input_data del job
            return self.job.input_data or {}

        # Combinar resultados de predecesores
        inputs = {}
        for pred_id in predecessors:
            if pred_id in self.results:
                inputs[f"{pred_id}_output"] = self.results[pred_id]

        return inputs

    def _get_node_outputs(self, node_id: str) -> dict:
        """Obtiene los datos de salida de un nodo para sus sucesores."""
        if node_id not in self.results:
            return {}

        result = self.results[node_id]
        return {"output": result}


@celery_app.task(bind=True, max_retries=3)
def execute_pipeline_task(self, job_id: int) -> bool:
    """Tarea Celery para ejecutar un pipeline."""
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            raise ValueError(f"Job {job_id} no encontrado")

        executor = PipelineExecutor(db, job)
        success, error = asyncio.run(executor.execute())

        return success

    except Exception as e:
        logger.exception(f"Error en tarea execute_pipeline: {e}")
        raise self.retry(exc=e, countdown=60)
    finally:
        db.close()


@celery_app.task
def resume_pipeline_task(job_id: int, approved_node_id: str) -> bool:
    """
    Reanuda un pipeline después de una aprobación.

    Continúa la ejecución desde los sucesores del nodo aprobado.
    """
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            raise ValueError(f"Job {job_id} no encontrado")

        # Actualizar estado
        job.status = JobStatus.RUNNING
        db.commit()

        # Crear executor y continuar desde el nodo aprobado
        executor = PipelineExecutor(db, job)

        # Obtener el grafo y encontrar sucesores del nodo aprobado
        graph = executor.graph
        successors = list(graph.successors(approved_node_id))

        if not successors:
            # No hay más nodos - completar
            job.status = JobStatus.COMPLETED
            job.completed_at = datetime.utcnow()
            db.commit()
            return True

        # Ejecutar solo los nodos restantes (topological order desde el nodo actual)
        execution_order = list(nx.topological_sort(graph))

        # Encontrar índice del nodo aprobado y ejecutar desde el siguiente
        try:
            approved_index = execution_order.index(approved_node_id)
            remaining_nodes = execution_order[approved_index + 1:]
        except ValueError:
            # Nodo no encontrado en orden de ejecución
            remaining_nodes = successors

        logger.info(f"Reanudando pipeline {job_id} desde nodos: {remaining_nodes}")

        # Ejecutar nodos restantes (usando run_in_executor para código async)
        def run_node_sync(node_id):
            import asyncio
            loop = asyncio.new_event_loop()
            try:
                return loop.run_until_complete(executor._execute_node(node_id))
            finally:
                loop.close()

        for node_id in remaining_nodes:
            job.current_node_id = node_id
            db.commit()

            success, result = run_node_sync(node_id)

            if not success:
                job.status = JobStatus.FAILED
                job.error_message = executor.errors.get(node_id, "Error desconocido")
                job.completed_at = datetime.utcnow()
                db.commit()
                return False

            executor.results[node_id] = result

        # Completado exitosamente
        job.status = JobStatus.COMPLETED
        job.output_data = executor.results
        job.completed_at = datetime.utcnow()
        db.commit()

        logger.info(f"Pipeline {job_id} completado después de aprobación")
        return True

    except Exception as e:
        logger.exception(f"Error reanudando pipeline: {e}")
        job.status = JobStatus.FAILED
        job.error_message = str(e)
        job.completed_at = datetime.utcnow()
        db.commit()
        return False
    finally:
        db.close()
