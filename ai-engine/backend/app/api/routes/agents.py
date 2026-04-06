"""Rutas para gestión de AI Agents."""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...services.agent_service import get_agent_service, AgentService
from ...models.agent import AIAgent, AgentConversation, AgentMessage

router = APIRouter()


# === Schemas ===

class AgentCreate(BaseModel):
    """Schema para crear agente."""
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    system_prompt: str = Field(..., min_length=1)
    model: str = "gemini-2.5-pro"
    temperature: int = Field(default=70, ge=0, le=100)
    max_tokens: int = Field(default=4096, ge=256)
    available_tools: Optional[List[str]] = None


class AgentUpdate(BaseModel):
    """Schema para actualizar agente."""
    name: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    model: Optional[str] = None
    temperature: Optional[int] = Field(None, ge=0, le=100)
    max_tokens: Optional[int] = Field(None, ge=256)
    available_tools: Optional[List[str]] = None
    is_active: Optional[bool] = None


class AgentResponse(BaseModel):
    """Schema para respuesta de agente."""
    id: int
    name: str
    description: Optional[str]
    system_prompt: str
    model: str
    temperature: int
    max_tokens: int
    available_tools: List[str]
    is_active: bool
    created_at: str

    class Config:
        from_attributes = True


class ConversationCreate(BaseModel):
    """Schema para crear conversación."""
    agent_id: int
    title: Optional[str] = None
    context: Optional[Dict[str, Any]] = None


class MessageSend(BaseModel):
    """Schema para enviar mensaje."""
    content: str = Field(..., min_length=1)


class MessageResponse(BaseModel):
    """Schema para respuesta de mensaje."""
    id: int
    conversation_id: int
    role: str
    content: str
    has_mentions: bool
    mentions: List[Dict[str, Any]]
    created_at: str

    class Config:
        from_attributes = True


class ConversationResponse(BaseModel):
    """Schema para respuesta de conversación."""
    id: int
    agent_id: int
    user_id: int
    title: Optional[str]
    context: Dict[str, Any]
    mentioned_users: List[Dict[str, Any]]
    mentioned_jobs: List[int]
    mentioned_pipelines: List[int]
    created_at: str
    updated_at: str
    messages: List[MessageResponse]

    class Config:
        from_attributes = True


# === Routes ===

@router.get("", response_model=List[AgentResponse])
async def list_agents(
    is_active: Optional[bool] = True,
    db: Session = Depends(get_db),
):
    """Lista todos los agentes activos."""
    service = get_agent_service(db)
    agents = service.list_agents(is_active=is_active)
    return agents


@router.post("", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
async def create_agent(
    agent_data: AgentCreate,
    db: Session = Depends(get_db),
):
    """Crea un nuevo agente de AI."""
    service = get_agent_service(db)
    agent = service.create_agent(
        name=agent_data.name,
        description=agent_data.description,
        system_prompt=agent_data.system_prompt,
        model=agent_data.model,
        temperature=agent_data.temperature,
        max_tokens=agent_data.max_tokens,
        available_tools=agent_data.available_tools,
    )
    return agent


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(
    agent_id: int,
    db: Session = Depends(get_db),
):
    """Obtiene detalles de un agente."""
    service = get_agent_service(db)
    agent = service.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agente no encontrado")
    return agent


@router.put("/{agent_id}", response_model=AgentResponse)
async def update_agent(
    agent_id: int,
    update_data: AgentUpdate,
    db: Session = Depends(get_db),
):
    """Actualiza un agente existente."""
    service = get_agent_service(db)
    agent = service.update_agent(
        agent_id=agent_id,
        **update_data.model_dump(exclude_unset=True),
    )
    if not agent:
        raise HTTPException(status_code=404, detail="Agente no encontrado")
    return agent


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent(
    agent_id: int,
    db: Session = Depends(get_db),
):
    """Elimina un agente."""
    service = get_agent_service(db)
    if not service.delete_agent(agent_id):
        raise HTTPException(status_code=404, detail="Agente no encontrado")
    return None


# === Conversations ===

@router.post("/conversations", response_model=ConversationResponse)
async def create_conversation(
    conv_data: ConversationCreate,
    db: Session = Depends(get_db),
):
    """Crea una nueva conversación con un agente."""
    service = get_agent_service(db)
    conversation = service.create_conversation(
        agent_id=conv_data.agent_id,
        user_id=1,  # TODO: Extraer del token JWT
        title=conv_data.title,
        context=conv_data.context,
    )
    return conversation


@router.get("/conversations/{conversation_id}", response_model=ConversationResponse)
async def get_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
):
    """Obtiene una conversación con todos sus mensajes."""
    service = get_agent_service(db)
    conversation = service.get_conversation(conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversación no encontrada")
    return conversation


@router.post("/conversations/{conversation_id}/messages")
async def send_message(
    conversation_id: int,
    message_data: MessageSend,
    db: Session = Depends(get_db),
):
    """Envía un mensaje a un agente y obtiene respuesta."""
    service = get_agent_service(db)
    result = await service.send_message(
        conversation_id=conversation_id,
        content=message_data.content,
        user_id=1,  # TODO: Extraer del token JWT
    )
    return result


@router.get("/conversations/{conversation_id}/messages", response_model=List[MessageResponse])
async def list_messages(
    conversation_id: int,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """Lista mensajes de una conversación."""
    service = get_agent_service(db)
    conversation = service.get_conversation(conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversación no encontrada")

    messages = (
        db.query(AgentMessage)
        .filter(AgentMessage.conversation_id == conversation_id)
        .order_by(AgentMessage.created_at.desc())
        .limit(limit)
        .all()
    )
    return list(reversed(messages))
