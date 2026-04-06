# Grande&Gordo AI Engine

Sistema de orquestación híbrida para pipelines de AI con aprobación humana en el loop.

## Arquitectura

```
ai-engine/
├── backend/          # FastAPI + Celery + PostgreSQL
│   ├── app/
│   │   ├── api/      # Endpoints REST
│   │   ├── core/     # Configuración, seguridad
│   │   ├── pipelines/# Orquestación DAG (NetworkX)
│   │   ├── services/ # Lógica de negocio
│   │   └── wrappers/ # APIs externas (Gemini, LumaLabs)
│   └── tests/
├── frontend/         # React + React Flow + TypeScript
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── stores/
│   │   └── types/
│   └── public/
└── docs/
```

## Stack Técnico

### Backend
- **FastAPI**: API REST asíncrona
- **Celery + Redis**: Cola de tareas asíncronas
- **PostgreSQL**: Base de datos principal (JSONB para flexibilidad)
- **NetworkX**: Orquestación de DAGs para pipelines
- **Pydantic**: Validación de datos

### Frontend
- **React 18**: UI library
- **React Flow**: Editor visual de pipelines
- **Zustand**: Gestión de estado
- **Tailwind CSS**: Estilos
- **TypeScript**: Type safety

### APIs Externas
- **Gemini API (Nano Banana 2)**: Generación de imágenes
- **LumaLabs API**: Generación de video

## Setup Inicial

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Variables de Entorno

### Backend (.env)
```
DATABASE_URL=postgresql://user:pass@localhost:5432/gordo_ai
REDIS_URL=redis://localhost:6379/0
GEMINI_API_KEY=xxx
LUMA_API_KEY=xxx
SECRET_KEY=xxx
```

### Frontend (.env)
```
VITE_API_URL=http://localhost:8000
```

## Desarrollo

```bash
# Backend (terminal 1)
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Celery Worker (terminal 2)
cd backend
celery -A app.celery worker --loglevel=info

# Frontend (terminal 3)
cd frontend
npm run dev
```

## Estado del Proyecto

En desarrollo inicial - ver `docs/` para especificaciones técnicas detalladas.
