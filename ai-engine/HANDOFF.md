# Grande&Gordo AI Engine - Handoff Document

## Estado del Proyecto

**Fecha:** 2026-04-06  
**Estado:** Implementación base completada - listo para testing y producción

## Arquitectura Implementada

### Backend (FastAPI + Python)

```
ai-engine/backend/
├── app/
│   ├── api/
│   │   ├── routes/
│   │   │   ├── auth.py       # Login, registro, auth JWT
│   │   │   ├── pipelines.py  # CRUD pipelines + nodos/edges
│   │   │   ├── jobs.py       # Gestión de ejecuciones + approvals
│   │   │   └── nodes.py      # Tipos de nodos disponibles
│   │   └── router.py
│   ├── core/
│   │   ├── config.py         # Settings centralizados
│   │   ├── database.py       # SQLAlchemy session mgmt
│   │   └── security.py       # JWT + password hashing
│   ├── models/
│   │   ├── user.py           # User model
│   │   ├── pipeline.py       # Pipeline, PipelineNode, PipelineEdge
│   │   └── job.py            # Job, JobApproval (human-in-the-loop)
│   ├── services/
│   │   ├── celery_app.py     # Celery configuration
│   │   ├── pipeline_executor.py  # NetworkX DAG orchestration
│   │   └── node_executors.py # Ejecutores por tipo de nodo
│   └── wrappers/
│       ├── gemini_wrapper.py # Gemini API (Nano Banana 2)
│       └── luma_wrapper.py   # LumaLabs Dream Machine
├── alembic/                  # Database migrations
├── Dockerfile
└── requirements.txt
```

**Endpoints implementados:**

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/v1/auth/login` | Login JWT |
| POST | `/api/v1/auth/register` | Registro usuario |
| GET | `/api/v1/auth/me` | Usuario actual |
| GET | `/api/v1/pipelines` | Listar pipelines |
| POST | `/api/v1/pipelines` | Crear pipeline |
| GET | `/api/v1/pipelines/:id` | Obtener pipeline |
| PUT | `/api/v1/pipelines/:id` | Actualizar pipeline |
| DELETE | `/api/v1/pipelines/:id` | Eliminar pipeline |
| POST | `/api/v1/pipelines/:id/nodes` | Añadir nodo |
| POST | `/api/v1/pipelines/:id/edges` | Añadir edge |
| GET | `/api/v1/jobs` | Listar jobs (con filtro por status) |
| POST | `/api/v1/jobs` | Crear job + enqueue Celery |
| GET | `/api/v1/jobs/:id` | Obtener job |
| POST | `/api/v1/jobs/:id/cancel` | Cancelar job |
| GET | `/api/v1/jobs/:id/approvals` | Listar approvals de un job |
| POST | `/api/v1/jobs/approvals/:id/decide` | Aprobar/rechazar |
| GET | `/api/v1/nodes` | Listar tipos de nodos |
| GET | `/api/v1/nodes/:type` | Obtener definición de nodo |
| GET | `/api/v1/nodes/categories/:cat` | Nodos por categoría |

### Frontend (React + React Flow)

```
ai-engine/frontend/
├── src/
│   ├── components/
│   │   ├── App.tsx           # Router principal
│   │   ├── Layout.tsx        # Sidebar + estructura
│   │   ├── LoginPage.tsx     # Login screen
│   │   ├── PipelineList.tsx  # Lista de pipelines
│   │   ├── PipelineEditor.tsx # Editor React Flow
│   │   ├── NodeConfigPanel.tsx # Panel configuración nodos
│   │   ├── NodeTypes.tsx     # Custom React Flow nodes
│   │   ├── JobsList.tsx      # Lista de ejecuciones
│   │   └── ApprovalPanel.tsx # Aprobaciones humanas
│   ├── stores/
│   │   ├── useAuthStore.ts   # Zustand auth state
│   │   └── pipelineStore.ts  # Pipeline state
│   ├── lib/
│   │   └── api.ts            # Axios + endpoints
│   └── index.css             # Tailwind + React Flow styles
├── package.json
├── Dockerfile
└── vite.config.ts
```

## Nodos Disponibles

| Tipo | Categoría | Descripción | API Key |
|------|-----------|-------------|---------|
| `gemini_image` | generator | Generación de imágenes con Gemini | GEMINI_API_KEY |
| `luma_video` | generator | Generación de video con LumaLabs | LUMA_API_KEY |
| `approval` | approval | Punto de aprobación humana | - |
| `text_transform` | transform | Transformación de texto (templates) | - |
| `image_merge` | transform | Composición de múltiples imágenes | - |
| `output` | output | Entrega de resultados (download, webhook, email) | - |

## Setup Instructions

### Opción 1: Docker Compose (Recomendado)

```bash
cd ai-engine

# 1. Configurar variables de entorno
cp .env.example .env
# Editar .env con GEMINI_API_KEY y LUMA_API_KEY

# 2. Iniciar todos los servicios
make docker

# 3. Ver logs
make docker-logs

# 4. Acceder:
#    - Frontend: http://localhost:3000
#    - API Docs: http://localhost:8000/docs
```

### Opción 2: Manual (Desarrollo)

```bash
# 1. Iniciar DB y Redis
make db

# 2. Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env  # Editar con credenciales
alembic upgrade head
uvicorn app.main:app --reload  # terminal 1
celery -A app.services.celery_app worker --loglevel=info --pool=solo  # terminal 2

# 3. Frontend
cd frontend
npm install
npm run dev  # terminal 3
```

## Flujo de Ejecución

1. **Usuario crea pipeline** → Se guarda en DB con grafos de nodos/edges
2. **Usuario ejecuta pipeline** → Se crea Job y se encola en Celery
3. **Celery ejecuta nodos** → En orden topológico, usando ejecutores específicos
4. **Nodo approval** → Pausa ejecución, crea registro JobApproval, espera decisión
5. **Usuario aprueba/rechaza** → Si aprueba, Celery reanuda desde nodos sucesores
6. **Pipeline completado** → Resultados guardados en `output_data` del Job

## Comandos Útiles

```bash
# Ver ayuda
make help

# Iniciar Docker
make docker

# Detener Docker
make docker-stop

# Ver logs
make docker-logs

# Reiniciar servicios
make docker-restart

# Ejecutar tests
make test

# Tests con coverage
make test-cov

# Limpiar cache
make clean
```

## Próximos Pasos

### Prioridad Alta
1. [ ] **Probar end-to-end** con APIs reales (Gemini, Luma)
2. [ ] **Añadir logs estructurados** para debugging
3. [ ] **Validar conexiones** en React Flow (evitar ciclos, puertos incompatibles)
4. [ ] **Manejar errores de API** con reintentos y fallbacks

### Prioridad Media
5. [ ] **Exportar/importar pipeline** como JSON
6. [ ] **Vista de detalle de job** (progreso, logs en tiempo real)
7. [ ] **Notificaciones** (email/slack cuando job completa)
8. [ ] **Almacenar resultados** en Cloudflare R2

### Prioridad Baja
9. [ ] **Dashboard de métricas** (uso, coste, tiempos)
10. [ ] **Rate limiting** en API
11. [ ] **Monitoring** (Prometheus + Grafana)
12. [ ] **Integración con CRM** existente

## Decisiones Técnicas

### NetworkX para Orquestación
- DAG validation automático (detecta ciclos)
- Topological sort para orden de ejecución
- Fácil serialización a JSON para React Flow
- Permite análisis de grafo (caminos críticos, paralelismo)

### Celery + Redis
- Cola de tareas madura y probada en producción
- Reintentos automáticos con backoff exponencial
- Monitoring con Flower (opcional)
- Redis disponible en infraestructura

### Human-in-the-loop
- Nodos `approval` pausan ejecución
- Job cambia a `waiting_approval`
- API endpoint para decidir (aprobar/rechazar con comentarios)
- Reanuda ejecución desde sucesores del nodo aprobado

### Ejecutores Modulares
- Factory pattern en `node_executors.py`
- Cada ejecutor es independiente y testeable
- Fácil añadir nuevos tipos de nodos

## Referencias

- [README principal](./README.md) - Vista general
- [QUICKSTART.md](./QUICKSTART.md) - Inicio rápido
- [Blueprint original](../../README_ARCHITECTURE.md) - Arquitectura de referencia

## Contacto

Para dudas o soporte técnico:
- Email: hola@grandeandgordo.com
- Slack: #ai-engine
