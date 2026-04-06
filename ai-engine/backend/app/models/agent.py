"""Modelos para AI Agents."""

from sqlalchemy import Column, Integer, String, Text, ForeignKey, Boolean, DateTime, JSON
from sqlalchemy.orm import relationship
from datetime import datetime

from ..core.database import Base


class AIAgent(Base):
    """Agente de AI configurado para tareas específicas."""

    __tablename__ = "ai_agents"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    system_prompt = Column(Text, nullable=False)
    model = Column(String(100), default="gemini-2.5-pro")  # gemini-2.5-pro o gemini-2.5-flash
    temperature = Column(Integer, default=70)  # 0-100, default 0.7
    max_tokens = Column(Integer, default=4096)

    # Configuración de contexto
    context_window_size = Column(Integer, default=8192)  # tokens
    memory_enabled = Column(Boolean, default=True)

    # Herramientas disponibles
    available_tools = Column(JSON, default=list)  # ["web_search", "image_generation", "code_execution"]

    # Metadatos
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_active = Column(Boolean, default=True)

    # Relaciones
    conversations = relationship("AgentConversation", back_populates="agent", cascade="all, delete-orphan")
    creator = relationship("User", backref="ai_agents")


class AgentConversation(Base):
    """Conversación con un agente de AI."""

    __tablename__ = "agent_conversations"

    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(Integer, ForeignKey("ai_agents.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(255))

    # Contexto de la conversación
    context = Column(JSON, default=dict)  # Variables de contexto, estado actual

    # Entidades mencionadas (@mentions)
    mentioned_users = Column(JSON, default=list)  # [{user_id, email, timestamp}]
    mentioned_jobs = Column(JSON, default=list)  # [job_id, ...]
    mentioned_pipelines = Column(JSON, default=list)  # [pipeline_id, ...]

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relaciones
    agent = relationship("AIAgent", back_populates="conversations")
    user = relationship("User", backref="agent_conversations")
    messages = relationship("AgentMessage", back_populates="conversation", cascade="all, delete-orphan", order_by="AgentMessage.created_at")


class AgentMessage(Base):
    """Mensaje individual en una conversación con agente."""

    __tablename__ = "agent_messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("agent_conversations.id"), nullable=False)

    # Tipo de mensaje
    role = Column(String(20), nullable=False)  # "user", "assistant", "system"
    content = Column(Text, nullable=False)

    # Metadatos del mensaje
    has_mentions = Column(Boolean, default=False)
    mentions = Column(JSON, default=list)  # [{type: "user"|"job"|"pipeline", id: int, display: str}]

    # Para mensajes de asistente con herramientas
    tool_calls = Column(JSON, default=list)  # [{tool_name, args, result}]
    token_usage = Column(JSON, default=dict)  # {prompt_tokens, completion_tokens, total_tokens}

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relaciones
    conversation = relationship("AgentConversation", back_populates="messages")
