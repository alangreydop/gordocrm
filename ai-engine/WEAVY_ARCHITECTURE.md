# Arquitectura Tipo Weavy.ai para Grande&Gordo CRM

## Resumen Ejecutivo

Weavy.ai es una plataforma de integraciones que provee:
1. **UI Components** pre-construidos (chat, files, comments, meetings)
2. **Backend Environment** que gestiona datos e interacciones
3. **AI Agents** con herramientas conectadas a APIs externas
4. **Web API** RESTful para todas las operaciones

**Nuestro objetivo:** Replicar esta arquitectura en el CRM de Grande&Gordo usando:
- Kie.ai para generación de contenido (imagen, video, audio)
- React Flow para el visual workflow builder
- Nuestro backend FastAPI + Celery para orquestación

---

## 1. Arquitectura Comparada

### Weavy.ai
```
┌─────────────────────────────────────────────────────────────┐
│  Weavy Environment (Backend SaaS)                          │
│  ├─ Users API                                               │
│  ├─ Files API (Drive, Dropbox, OneDrive)                   │
│  ├─ Chat API                                                │
│  ├─ Agents API (OpenAI, Anthropic, Gemini, Kapa)           │
│  └─ Webhooks                                                │
└─────────────────────────────────────────────────────────────┘
                          ▲
                          │ Bearer Token
                          │
┌─────────────────────────┴──────────────────────────────────┐
│  @weavy/uikit-react (Frontend)                             │
│  ├─ <WyChat />                                              │
│  ├─ <WyFiles />                                             │
│  ├─ <WyComments />                                          │
│  ├─ <WyMessenger />                                         │
│  └─ <WyMeeting />                                           │
└────────────────────────────────────────────────────────────┘
```

### Grande&Gordo CRM (Actual)
```
┌─────────────────────────────────────────────────────────────┐
│  Gordo AI Engine (Self-hosted)                              │
│  ├─ Pipelines API (DAG orchestration)                       │
│  ├─ Jobs API (Celery tasks)                                 │
│  ├─ Nodes API (Kie.ai wrapper)                              │
│  │   ├─ Nano Banana Pro/2 (imagen)                          │
│  │   ├─ Kling/Sora2 (video)                                 │
│  │   └─ ElevenLabs (audio)                                  │
│  ├─ Approvals API (human-in-the-loop)                       │
│  ├─ Webhooks (notificaciones real-time)                     │
│  └─ AI Agents (chat con @mentions)                          │
└─────────────────────────────────────────────────────────────┘
                          ▲
                          │ JWT Token
                          │
┌─────────────────────────┴──────────────────────────────────┐
│  Gordo CRM Frontend (React + React Flow)                    │
│  ├─ <PipelineEditor /> (visual builder)                     │
│  ├─ <NodeConfigPanel /> (configuración)                     │
│  ├─ <ApprovalPanel /> (aprobaciones)                        │
│  ├─ <JobsList /> (ejecuciones)                              │
│  ├─ <WebhooksPage /> (gestión webhooks)                     │
│  ├─ <AgentsPage /> (chat con AI)                            │
│  └─ Futuro: <Chat />, <Files />, <Comments />               │
└────────────────────────────────────────────────────────────┘
```

---

## 2. Componentes a Implementar

### Fase 1: Core de Pipelines (✅ Completado)

| Componente | Estado | Descripción |
|------------|--------|-------------|
| Pipeline Editor | ✅ | Visual builder con React Flow |
| Node Types | ✅ | Nano Banana Pro, Kling Video, Approval, etc. |
| Node Config Panel | ✅ | Configuración por tipo de nodo |
| Pipeline Executor | ✅ | Orquestación DAG con NetworkX |
| Celery Worker | ✅ | Ejecución asíncrona de jobs |
| Approval System | ✅ | Aprobación humana en el loop |

### Fase 2: Webhooks (✅ Completado)

| Componente | Estado | Descripción |
|------------|--------|-------------|
| WebhookSubscription Model | ✅ | Suscripciones a eventos |
| WebhookDelivery Model | ✅ | Tracking de entregas |
| Event System | ✅ | 10 eventos (Pipeline, Job, Approval) |
| Delivery Service | ✅ | Exponential backoff, HMAC signing |
| Webhooks UI | ✅ | CRUD completo en `/webhooks` |

### Fase 3: AI Agents (✅ Completado)

| Componente | Estado | Descripción |
|------------|--------|-------------|
| AIAgent Model | ✅ | Agentes configurables |
| AgentConversation Model | ✅ | Historial de conversaciones |
| @mentions System | ✅ | @user, @job#, @pipeline# |
| Kie.ai Integration | ✅ | Gemini 2.5 Pro/Flash |
| Agents UI | ✅ | Chat interface en `/agents` |
| Pre-built Agents | ✅ | Pipeline Assistant, Creative Director, Data Analyst |

### Fase 2: AI Agents (🔄 Pendiente)

Inspirado en [Weavy Agents API](https://weavy.com/docs/reference/api/agents):

```python
# agents/models.py
class AIAgent(Base):
    """Agente AI configurable con herramientas."""
    
    id = Column(Integer, primary_key=True)
    name = Column(String)  # ej: "Image Generator"
    instruction = Column(Text)  # System prompt
    provider = Column(String)  # "kie", "openai", "anthropic"
    model = Column(String)  # "nano-banana-pro", "gpt-4"
    
    # Herramientas conectadas
    tools = Column(JSON)  # [{type: "function", endpoint: "..."}]
    knowledge_bases = Column(JSON)  # IDs de documentos de referencia
    web_search_enabled = Column(Boolean, default=False)
```

**Características:**
- @mentions en comentarios para activar agentes
- Funciones personalizables (HTTP requests a APIs externas)
- Búsqueda en documentos subidos (RAG)
- Búsqueda web opcional

### Fase 3: Colaboración (🔄 Pendiente)

| Componente | Inspiración Weavy | Implementación Propuesta |
|------------|-------------------|-------------------------|
| Comments | [WyComments](https://weavy.com/docs/reference/uikit/comments) | Sistema de comentarios en jobs/pipelines con @mentions |
| Chat | [WyChat](https://weavy.com/docs/reference/uikit/chat) | Chat por proyecto/equipo con AI copilot |
| Files | [WyFiles](https://weavy.com/docs/reference/uikit/files) | Integración con S3/Cloudinary para assets generados |
| Notifications | WyNotifications | Toast + badge en tiempo real (WebSocket) |

### Fase 4: Webhooks y Automatización

```python
# webhooks/models.py
class WebhookSubscription(Base):
    """Suscripción a eventos del sistema."""
    
    id = Column(Integer, primary_key=True)
    event_type = Column(String)  # "job.completed", "pipeline.created"
    target_url = Column(String)
    secret = Column(String)  # Para firmar payloads
    active = Column(Boolean, default=True)
```

**Eventos disponibles:**
- `pipeline.created`
- `pipeline.updated`
- `job.started`
- `job.completed`
- `job.failed`
- `approval.pending`
- `approval.approved`
- `approval.rejected`

---

## 3. API Design (RESTful como Weavy)

### Endpoints Principales

```
# Pipelines
GET    /api/v1/pipelines           # Listar
POST   /api/v1/pipelines           # Crear
GET    /api/v1/pipelines/:id       # Obtener
PUT    /api/v1/pipelines/:id       # Actualizar
DELETE /api/v1/pipelines/:id       # Eliminar
POST   /api/v1/pipelines/:id/run   # Ejecutar

# Jobs
GET    /api/v1/jobs                # Listar (con filtros)
POST   /api/v1/jobs                # Crear job
GET    /api/v1/jobs/:id            # Obtener
POST   /api/v1/jobs/:id/cancel     # Cancelar

# Approvals
GET    /api/v1/approvals           # Listar pendientes
POST   /api/v1/approvals/:id/decide # Aprobar/rechazar

# AI Agents (nuevo)
GET    /api/v1/agents              # Listar agentes
POST   /api/v1/agents              # Crear agente
POST   /api/v1/agents/:id/run      # Ejecutar agente

# Webhooks (nuevo)
GET    /api/v1/webhooks            # Listar suscripciones
POST   /api/v1/webhooks           # Crear suscripción
DELETE /api/v1/webhooks/:id       # Eliminar
```

### Response Format (estándar Weavy)

```json
{
  "data": { ... },
  "meta": {
    "request_id": "req_abc123",
    "timestamp": "2025-04-06T18:30:00Z"
  }
}

# Para listas:
{
  "data": [...],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 150,
    "total_pages": 8
  }
}
```

---

## 4. Visual Workflow Builder (Inspiración Weavy)

### Estado Actual
Nuestro `PipelineEditor` permite:
- Añadir nodos desde sidebar
- Conectar nodos con edges
- Configurar cada nodo
- Guardar/ejecutar pipeline

### Mejoras Propuestas (tipo Weavy)

1. **Node Templates Gallery**
   - Pipelines pre-construidos por caso de uso
   - Ej: "Social Media Post Generator", "Product Video Ad"

2. **Drag & Drop de Integraciones**
   - Conectores visuales a servicios externos
   - Ej: "Slack Notification", "Google Drive Upload"

3. **Conditional Branching**
   - Nodos de decisión basados en resultados
   - Ej: Si aprobación = rechazado → notificar, si = aprobado → continuar

4. **Parallel Execution**
   - Múltiples ramas ejecutándose en paralelo
   - Merge de resultados

---

## 5. Implementación Priorizada

### Sprint 1: Webhooks ✅ COMPLETED
- [x] Modelo `WebhookSubscription`
- [x] Modelo `WebhookDelivery`
- [x] Sistema de eventos (10 eventos en 3 categorías)
- [x] Worker para envío de webhooks (retries, exponential backoff)
- [x] HMAC-SHA256 payload signing
- [x] UI para gestionar suscripciones (`/webhooks`)

### Sprint 2: AI Agents ✅ COMPLETED
- [x] Modelo `AIAgent` con herramientas
- [x] Modelo `AgentConversation` y `AgentMessage`
- [x] Executor de agentes (Kie.ai chat completion - Gemini 2.5)
- [x] Sistema de @mentions (@user, @job#, @pipeline#)
- [x] UI de configuración de agentes (`/agents`)
- [x] Chat interface en tiempo real
- [x] 3 agentes predefinidos (Pipeline Assistant, Creative Director, Data Analyst)

### Sprint 3: Colaboración (🔄 Pendiente)
- [ ] Componente `<Comments />` con @mentions
- [ ] WebSocket para notificaciones en tiempo real
- [ ] Integración con storage (S3/Cloudinary)
- [ ] Componente `<Files />` para assets

### Sprint 4: Plantillas y Mejoras UX (🔄 Pendiente)
- [ ] Template Gallery de pipelines
- [ ] Conditional branching en executor
- [ ] Parallel execution support
- [ ] Mejoras en visual builder

---

## 6. Referencias Técnicas

### Weavy.ai
- Docs: https://weavy.com/docs
- UI Kit React: https://github.com/weavy/weavy-uikit-react
- Agents API: https://weavy.com/docs/reference/api/agents
- Chat Component: https://weavy.com/docs/reference/uikit/chat
- Files Component: https://weavy.com/docs/reference/uikit/files

### Kie.ai
- Docs: https://docs.kie.ai/
- Nano Banana Pro: https://nanophoto.ai/docs/api/nano-banana-pro

### Nuestro Código
- Wrapper Kie.ai: `/backend/app/wrappers/kie_wrapper.py`
- Node Executors: `/backend/app/services/node_executors.py`
- Pipeline Editor: `/frontend/src/components/PipelineEditor.tsx`

---

## 7. Decisiones de Arquitectura

| Decisión | Weavy | Nosotros | Razón |
|----------|-------|----------|-------|
| Auth | Bearer tokens | JWT | Más simple, ya implementado |
| API Style | REST | REST | Consistente con Weavy |
| Real-time | WebSocket | WebSocket (futuro) | Necesario para notificaciones |
| AI Provider | Múltiple | Kie.ai (unificado) | Menos complejidad inicial |
| UI Components | UIKit propio | Componentes custom | Control total del diseño |
| Storage | Cloud integrations | S3/Cloudinary | Más control, costos menores |

---

## 8. Estado Actual (Abril 2026)

### ✅ Completado

| Área | Componentes |
|------|-------------|
| **Core** | Pipelines, Jobs, Approvals, Node Executors |
| **Webhooks** | 10 eventos, delivery service, UI de gestión |
| **AI Agents** | 3 agentes predefinidos, @mentions, chat UI |
| **Node Types** | Nano Banana Pro (14 inputs), Kling Video |

### 🔄 Pendiente

| Área | Componentes |
|------|-------------|
| **Colaboración** | Comments, Files, WebSocket notifications |
| **UX** | Template gallery, conditional branching, parallel execution |

---

## Conclusión

La arquitectura de Weavy.ai nos da un blueprint sólido para escalar el AI Engine:

1. **Core ✅** - pipelines, jobs, approvals fully functional
2. **Webhooks ✅** - 10 eventos, delivery con retries, UI completa
3. **AI Agents ✅** - Gemini 2.5 integration, @mentions, chat interface
4. **Kie.ai integration** - Nano Banana Pro (1+14 inputs), Kling Video, ElevenLabs
5. **Próximos pasos** - Colaboración (Comments, Files) y mejoras UX
6. **Diferenciación**: Self-hosted, control total, costos optimizados

El objetivo es tener un CRM con capacidades tipo Weavy pero especializado en generación de contenido AI para Grande&Gordo.
