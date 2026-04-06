# Grande&Gordo AI Engine - Quick Start

## Inicio Rápido con Docker (Recomendado)

```bash
cd ai-engine

# 1. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus API keys de Gemini y Luma

# 2. Iniciar todos los servicios
make docker

# 3. Ver logs
make docker-logs

# 4. Acceder a:
#    - Frontend: http://localhost:3000
#    - API Docs: http://localhost:8000/docs
#    - Backend: http://localhost:8000
```

## Inicio Manual (Desarrollo)

### Prerrequisitos
- Python 3.11+
- Node.js 18+
- PostgreSQL 15+ (o usar Docker)
- Redis 7+ (o usar Docker)

### Paso 1: Iniciar DB y Redis

```bash
# Opción Docker (recomendado)
docker compose up -d postgres redis

# Opción local (si ya tienes PostgreSQL y Redis)
# Asegúrate de que PostgreSQL esté corriendo en el puerto 5432
# Asegúrate de que Redis esté corriendo en el puerto 6379
```

### Paso 2: Backend

```bash
cd backend

# Crear entorno virtual
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Instalar dependencias
pip install -r requirements.txt

# Configurar variables de entorno
cp ../.env.example .env
# Editar .env con tus credenciales

# Ejecutar migraciones
alembic upgrade head

# Iniciar servidor (terminal 1)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Iniciar Celery worker (terminal 2)
celery -A app.services.celery_app worker --loglevel=info --pool=solo
```

### Paso 3: Frontend

```bash
cd frontend

# Instalar dependencias
npm install

# Configurar variables de entorno
cp ../.env.example .env

# Iniciar dev server
npm run dev
```

### Paso 4: Acceder

- **Frontend**: http://localhost:3000
- **API Docs**: http://localhost:8000/docs
- **Backend**: http://localhost:8000

## Primeros Pasos en la App

1. **Registrarse**: Ir a `/login` y crear una cuenta
2. **Crear Pipeline**: Click en "Nuevo pipeline"
3. **Añadir Nodos**:
   - `gemini_image`: Generación de imágenes
   - `luma_video`: Generación de video
   - `approval`: Punto de aprobación humana
   - `output`: Entrega de resultados
4. **Conectar Nodos**: Drag desde output de un nodo al input del siguiente
5. **Guardar**: Click en "Guardar"
6. **Ejecutar**: Click en "Ejecutar" y poner nombre al job
7. **Aprobar**: Si hay nodos de aprobación, ir a "Aprobaciones" en el sidebar

## Comandos Útiles

```bash
# Ver ayuda
make help

# Detener Docker
make docker-stop

# Ver logs
make docker-logs

# Ejecutar tests
make test

# Limpiar cache
make clean
```

## Solución de Problemas

### Error: "GEMINI_API_KEY no configurada"
- Asegúrate de tener `GEMINI_API_KEY` en `backend/.env`
- Obtén tu key en: https://makersuite.google.com/app/apikey

### Error: "LUMA_API_KEY no configurada"
- Asegúrate de tener `LUMA_API_KEY` en `backend/.env`
- Obtén tu key en: https://lumalabs.ai/

### Error: "Connection refused" en PostgreSQL
- Verifica que PostgreSQL esté corriendo: `docker compose ps`
- O inicia los servicios: `make db`

### Error: "Module not found" en frontend
- Ejecuta `npm install` en el directorio `frontend/`
- Borra `node_modules` y reinstala: `rm -rf node_modules && npm install`

### Celery no procesa jobs
- Verifica que el worker esté corriendo
- Check Redis: `docker compose exec redis redis-cli ping`
- Logs del worker: `docker compose logs celery_worker`
