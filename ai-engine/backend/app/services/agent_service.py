"""Servicio para gestión de AI Agents."""

import asyncio
import re
import logging
from typing import Any, Dict, List, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from ..models.agent import AIAgent, AgentConversation, AgentMessage
from ..models.job import Job
from ..models.pipeline import Pipeline
from ..models.user import User
from ..wrappers.kie_wrapper import KieWrapper, KieAPIError
from ..core.config import settings

logger = logging.getLogger(__name__)


class AgentService:
    """Servicio para gestionar agentes de AI y conversaciones."""

    def __init__(self, db: Session):
        self.db = db
        self.kie_wrapper = None
        if settings.KIE_API_KEY:
            self.kie_wrapper = KieWrapper(settings.KIE_API_KEY)

    # ========================================================================
    # Gestión de Agentes
    # ========================================================================

    def create_agent(
        self,
        name: str,
        system_prompt: str,
        description: Optional[str] = None,
        model: str = "gemini-2.5-pro",
        temperature: int = 70,
        max_tokens: int = 4096,
        available_tools: Optional[List[str]] = None,
        created_by: Optional[int] = None,
    ) -> AIAgent:
        """Crea un nuevo agente de AI."""
        agent = AIAgent(
            name=name,
            description=description,
            system_prompt=system_prompt,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            available_tools=available_tools or [],
            created_by=created_by,
        )
        self.db.add(agent)
        self.db.commit()
        self.db.refresh(agent)
        logger.info(f"Agente creado: {agent.id} - {agent.name}")
        return agent

    def get_agent(self, agent_id: int) -> Optional[AIAgent]:
        """Obtiene un agente por ID."""
        return self.db.query(AIAgent).filter(AIAgent.id == agent_id).first()

    def list_agents(
        self,
        created_by: Optional[int] = None,
        is_active: Optional[bool] = True,
    ) -> List[AIAgent]:
        """Lista agentes, opcionalmente filtrados."""
        query = self.db.query(AIAgent)
        if created_by is not None:
            query = query.filter(AIAgent.created_by == created_by)
        if is_active is not None:
            query = query.filter(AIAgent.is_active == is_active)
        return query.order_by(AIAgent.name).all()

    def update_agent(
        self,
        agent_id: int,
        name: Optional[str] = None,
        description: Optional[str] = None,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
        temperature: Optional[int] = None,
        max_tokens: Optional[int] = None,
        available_tools: Optional[List[str]] = None,
        is_active: Optional[bool] = None,
    ) -> Optional[AIAgent]:
        """Actualiza un agente existente."""
        agent = self.get_agent(agent_id)
        if not agent:
            return None

        if name is not None:
            agent.name = name
        if description is not None:
            agent.description = description
        if system_prompt is not None:
            agent.system_prompt = system_prompt
        if model is not None:
            agent.model = model
        if temperature is not None:
            agent.temperature = temperature
        if max_tokens is not None:
            agent.max_tokens = max_tokens
        if available_tools is not None:
            agent.available_tools = available_tools
        if is_active is not None:
            agent.is_active = is_active

        self.db.commit()
        self.db.refresh(agent)
        return agent

    def delete_agent(self, agent_id: int) -> bool:
        """Elimina un agente."""
        agent = self.get_agent(agent_id)
        if not agent:
            return False
        self.db.delete(agent)
        self.db.commit()
        return True

    # ========================================================================
    # Gestión de Conversaciones
    # ========================================================================

    def create_conversation(
        self,
        agent_id: int,
        user_id: int,
        title: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> AgentConversation:
        """Crea una nueva conversación."""
        agent = self.get_agent(agent_id)
        if not agent:
            raise ValueError(f"Agente no encontrado: {agent_id}")

        conversation = AgentConversation(
            agent_id=agent_id,
            user_id=user_id,
            title=title or f"Conversación con {agent.name}",
            context=context or {},
        )
        self.db.add(conversation)
        self.db.commit()
        self.db.refresh(conversation)
        return conversation

    def get_conversation(self, conversation_id: int) -> Optional[AgentConversation]:
        """Obtiene una conversación por ID."""
        return (
            self.db.query(AgentConversation)
            .filter(AgentConversation.id == conversation_id)
            .first()
        )

    def list_conversations(
        self,
        user_id: Optional[int] = None,
        agent_id: Optional[int] = None,
        limit: int = 50,
    ) -> List[AgentConversation]:
        """Lista conversaciones."""
        query = self.db.query(AgentConversation)
        if user_id is not None:
            query = query.filter(AgentConversation.user_id == user_id)
        if agent_id is not None:
            query = query.filter(AgentConversation.agent_id == agent_id)
        return query.order_by(AgentConversation.updated_at.desc()).limit(limit).all()

    # ========================================================================
    # Envío de Mensajes con @mentions
    # ========================================================================

    def _extract_mentions(self, content: str) -> List[Dict[str, Any]]:
        """Extrae @mentions del contenido."""
        mentions = []

        # Patrón para @mentions: @user, @job#123, @pipeline#456
        user_pattern = r"@(\w+(?:\s+\w+)*)"
        job_pattern = r"@job#(\d+)"
        pipeline_pattern = r"@pipeline#(\d+)"

        # Extraer menciones de usuarios
        for match in re.finditer(user_pattern, content):
            mentions.append({
                "type": "user",
                "display": match.group(1),
                "position": match.start(),
            })

        # Extraer menciones de jobs
        for match in re.finditer(job_pattern, content):
            job_id = int(match.group(1))
            job = self.db.query(Job).filter(Job.id == job_id).first()
            if job:
                mentions.append({
                    "type": "job",
                    "id": job_id,
                    "display": f"Job #{job_id}: {job.name}",
                    "position": match.start(),
                })

        # Extraer menciones de pipelines
        for match in re.finditer(pipeline_pattern, content):
            pipeline_id = int(match.group(1))
            pipeline = self.db.query(Pipeline).filter(Pipeline.id == pipeline_id).first()
            if pipeline:
                mentions.append({
                    "type": "pipeline",
                    "id": pipeline_id,
                    "display": f"Pipeline #{pipeline_id}: {pipeline.name}",
                    "position": match.start(),
                })

        return mentions

    def _resolve_user_mentions(
        self, mentions: List[Dict[str, Any]], user_id: int
    ) -> List[Dict[str, Any]]:
        """Resuelve menciones de usuario a IDs reales."""
        resolved = []
        for mention in mentions:
            if mention["type"] != "user":
                resolved.append(mention)
                continue

            # Buscar usuario por email o nombre
            display = mention["display"]
            user = (
                self.db.query(User)
                .filter(
                    or_(
                        User.email.ilike(f"%{display}%"),
                        User.full_name.ilike(f"%{display}%"),
                    )
                )
                .first()
            )
            if user:
                resolved.append({
                    "type": "user",
                    "id": user.id,
                    "email": user.email,
                    "display": user.full_name or user.email,
                })

        return resolved

    async def send_message(
        self,
        conversation_id: int,
        content: str,
        user_id: int,
    ) -> Dict[str, Any]:
        """
        Envía un mensaje al agente y obtiene respuesta.

        Args:
            conversation_id: ID de la conversación
            content: Contenido del mensaje
            user_id: ID del usuario

        Returns:
            Dict con message (user), response (assistant), mentions
        """
        conversation = self.get_conversation(conversation_id)
        if not conversation:
            raise ValueError(f"Conversación no encontrada: {conversation_id}")

        agent = self.get_agent(conversation.agent_id)
        if not agent:
            raise ValueError(f"Agente no encontrado: {conversation.agent_id}")

        # Extraer y resolver mentions
        mentions = self._extract_mentions(content)
        mentions = self._resolve_user_mentions(mentions, user_id)

        # Guardar mensaje del usuario
        user_message = AgentMessage(
            conversation_id=conversation_id,
            role="user",
            content=content,
            has_mentions=len(mentions) > 0,
            mentions=mentions,
        )
        self.db.add(user_message)
        self.db.commit()

        # Actualizar mentions en conversación
        if mentions:
            for mention in mentions:
                if mention["type"] == "user":
                    if not any(
                        m.get("id") == mention.get("id")
                        for m in conversation.mentioned_users
                    ):
                        conversation.mentioned_users.append(
                            {
                                "user_id": mention.get("id"),
                                "email": mention.get("email"),
                                "timestamp": datetime.utcnow().isoformat(),
                            }
                        )
                elif mention["type"] == "job":
                    if (
                        mention["id"] not in conversation.mentioned_jobs
                    ):
                        conversation.mentioned_jobs.append(mention["id"])
                elif mention["type"] == "pipeline":
                    if (
                        mention["id"] not in conversation.mentioned_pipelines
                    ):
                        conversation.mentioned_pipelines.append(mention["id"])
            self.db.commit()

        # Construir mensajes para Kie.ai
        messages = self._build_chat_messages(conversation, agent.system_prompt)

        # Llamar a Kie.ai
        if not self.kie_wrapper:
            raise ValueError("Kie.ai API no configurada")

        try:
            result = await self.kie_wrapper.chat_completion(
                model=agent.model,
                messages=messages,
            )

            # Guardar respuesta del asistente
            assistant_message = AgentMessage(
                conversation_id=conversation_id,
                role="assistant",
                content=result["response"],
                token_usage=result.get("metadata", {}).get("usage", {}),
            )
            self.db.add(assistant_message)
            conversation.updated_at = datetime.utcnow()
            self.db.commit()

            return {
                "user_message": {
                    "id": user_message.id,
                    "content": content,
                    "mentions": mentions,
                },
                "assistant_message": {
                    "id": assistant_message.id,
                    "content": result["response"],
                    "token_usage": result.get("metadata", {}).get("usage", {}),
                },
            }

        except KieAPIError as e:
            logger.exception(f"Error en Kie.ai API: {e}")
            # Guardar mensaje de error
            error_message = AgentMessage(
                conversation_id=conversation_id,
                role="assistant",
                content=f"Error: {str(e)}",
            )
            self.db.add(error_message)
            self.db.commit()
            raise

    def _build_chat_messages(
        self,
        conversation: AgentConversation,
        system_prompt: str,
        max_messages: int = 20,
    ) -> List[Dict[str, str]]:
        """Construye la lista de mensajes para enviar a Kie.ai."""
        messages = [{"role": "system", "content": system_prompt}]

        # Obtener últimos mensajes
        recent_messages = (
            self.db.query(AgentMessage)
            .filter(AgentMessage.conversation_id == conversation.id)
            .order_by(AgentMessage.created_at.desc())
            .limit(max_messages)
            .all()
        )

        # Invertir para orden cronológico
        recent_messages = list(reversed(recent_messages))

        for msg in recent_messages:
            messages.append({"role": msg.role, "content": msg.content})

        return messages

    # ========================================================================
    # Agentes Predefinidos
    # ========================================================================

    def create_default_agents(self, created_by: Optional[int] = None) -> List[AIAgent]:
        """Crea agentes predefinidos para el sistema."""
        default_agents = [
            {
                "name": "Pipeline Assistant",
                "description": "Asistente para gestión de pipelines y jobs",
                "system_prompt": """Eres un asistente especializado en gestión de pipelines de AI.
Puedes ayudar a:
- Crear y configurar pipelines
- Monitorear jobs en ejecución
- Diagnosticar errores
- Sugerir mejoras en la configuración

Responde de forma concisa y técnica. Usa @mentions para referirte a jobs o pipelines específicos.""",
                "model": "gemini-2.5-pro",
                "temperature": 50,
                "available_tools": ["pipeline_management", "job_monitoring"],
            },
            {
                "name": "Creative Director",
                "description": "Director creativo para generación de contenido",
                "system_prompt": """Eres un director creativo experto en generación de contenido con AI.
Puedes ayudar a:
- Escribir prompts efectivos para Nano Banana Pro
- Sugerir composiciones visuales
- Optimizar parámetros de generación
- Revisar y criticar resultados

Responde de forma inspiradora pero práctica. Incluye ejemplos concretos.""",
                "model": "gemini-2.5-pro",
                "temperature": 80,
                "available_tools": ["image_generation", "prompt_optimization"],
            },
            {
                "name": "Data Analyst",
                "description": "Analista de datos y métricas",
                "system_prompt": """Eres un analista de datos especializado en métricas de pipelines AI.
Puedes ayudar a:
- Analizar rendimiento de pipelines
- Identificar cuellos de botella
- Sugerir optimizaciones de costo
- Generar reportes de uso

Responde con datos concretos y recomendaciones accionables.""",
                "model": "gemini-2.5-pro",
                "temperature": 40,
                "available_tools": ["analytics", "cost_optimization"],
            },
        ]

        created = []
        for agent_config in default_agents:
            agent = self.create_agent(
                name=agent_config["name"],
                description=agent_config["description"],
                system_prompt=agent_config["system_prompt"],
                model=agent_config["model"],
                temperature=agent_config["temperature"],
                available_tools=agent_config["available_tools"],
                created_by=created_by,
            )
            created.append(agent)

        return created


# Helper para usar en routes
def get_agent_service(db: Session) -> AgentService:
    return AgentService(db)
