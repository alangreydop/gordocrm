# Deploy AI Engine a Railway

## Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│                   Railway.app                           │
│                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐ │
│  │   Backend   │    │   Worker    │    │    Beat     │ │
│  │  FastAPI    │    │   Celery    │    │  Scheduler  │ │
│  │  :8000      │    │             │    │             │ │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘ │
│         │                  │                  │         │
│         └──────────────────┼──────────────────┘         │
│                            │                            │
│                    ┌───────▼───────┐                    │
│                    │    Redis      │                    │
│                    │   (Broker)    │                    │
│                    └───────┬───────┘                    │
│                            │                            │
│                    ┌───────▼───────┐                    │
│                    │  PostgreSQL   │                    │
│                    │  (Database)   │                    │
│                    └───────────────┘                    │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
            ┌───────────────────────────────┐
            │   CRM (Cloudflare Workers)    │
            │  gordocrm-api-production      │
            └───────────────────────────────┘
```

## Pasos de Deployment

### 1. Crear Proyecto en Railway

1. Ir a https://railway.app
2. Click "New Project"
3. "Deploy from GitHub repo"
4. Seleccionar repositorio: `gordocrm/ai-engine`

### 2. Configurar Servicios

Railway detectará automáticamente los servicios del `docker-compose.yml`:

```bash
# Estructura recomendada
gordo-ai-engine/
├── backend/          → Servicio principal (web)
├── worker/           → Celery worker
├── postgres/         → Database (Railway managed)
└── redis/            → Redis (Railway managed)
```

### 3. Configurar PostgreSQL

Railway provee PostgreSQL gestionado automáticamente:

1. En el dashboard de Railway → Tu proyecto → New → Database → PostgreSQL
2. Copiar la `DATABASE_URL` que genera Railway
3. Esta URL se inyecta automáticamente como variable de entorno

### 4. Configurar Redis

1. New → Datastore → Redis
2. Copiar la `REDIS_URL` que genera Railway
3. Se inyecta automáticamente como variable de entorno

### 5. Variables de Entorno

Configurar en Railway Dashboard → Variables:

```bash
# Requeridas
SECRET_KEY=<generar-uno-nuevo-seguro>
GEMINI_API_KEY=tu-key-de-gemini
KIE_API_KEY=tu-key-de-kie
KLING_API_KEY=tu-key-de-kling

# CRM Integration (IMPORTANTÍSIMO)
CRM_WEBHOOK_URL=https://gordocrm-api-production.alangreydop.workers.dev/api/portal/webhooks/ai-engine
WEBHOOK_SECRET=gordo-ai-engine-secret-key-2026

# Railway inyecta automáticamente:
# - DATABASE_URL (desde PostgreSQL service)
# - REDIS_URL (desde Redis service)
# - PORT (puerto asignado por Railway)
```

### 6. Configurar CORS

Actualizar `config.py` para producción:

```python
CORS_ORIGINS: List[str] = [
    "http://localhost:3000",
    "http://localhost:8787",
    "https://gordocrm-api-production.alangreydop.workers.dev",
    "https://grandeandgordo-site.pages.dev",
    # Railway domain (se obtiene después del deploy)
    "https://gordo-ai-engine-production.up.railway.app",
]
```

### 7. Deploy

```bash
# Instalar Railway CLI
npm install -g @railway/cli

# Login
railway login

# Inicializar proyecto
cd /Users/alangreydop/gordocrm/ai-engine
railway init

# Deploy
railway up
```

### 8. Configurar Dominio (Opcional)

Para un dominio personalizado:

1. Railway Dashboard → Settings → Domains
2. Add Custom Domain: `ai.grandeandgordo.com`
3. Configurar DNS en tu proveedor:
   ```
   CNAME ai.grandeandgordo.com → gordo-ai-engine-production.up.railway.app
   ```

### 9. Testing Post-Deploy

```bash
# Health check
curl https://gordo-ai-engine-production.up.railway.app/api/v1/health

# List pipelines
curl https://gordo-ai-engine-production.up.railway.app/api/v1/pipelines

# Test webhook desde CRM
# (Crear un job y ejecutar "Ejecutar en AI Engine")
```

## Costos Estimados

| Servicio | Plan | Costo/mes |
|----------|------|-----------|
| Backend (FastAPI) | Standard | $5 |
| Worker (Celery) | Standard | $5 |
| PostgreSQL | Standard | $10 |
| Redis | Standard | $5 |
| **Total** | | **~$25/mes** |

*Nota: Railway da $5 de crédito gratis mensual*

## Variables Requeridas

```bash
# .env.production
DATABASE_URL=postgresql://user:pass@host.railway.app/db
REDIS_URL=redis://host.railway.app:6379
SECRET_KEY=<64-char-random-string>
GEMINI_API_KEY=xxx
KIE_API_KEY=xxx
KLING_API_KEY=xxx
CRM_WEBHOOK_URL=https://gordocrm-api-production.alangreydop.workers.dev/api/portal/webhooks/ai-engine
WEBHOOK_SECRET=gordo-ai-engine-secret-key-2026
PORT=8000
```

## Troubleshooting

### Worker no conecta a Redis

Verificar que `CELERY_BROKER_URL` y `CELERY_RESULT_BACKEND` apunten a la `REDIS_URL` de Railway.

### CORS Error desde CRM

Asegurar que la URL de Railway esté en `CORS_ORIGINS` en `config.py`.

### Webhook no llega al CRM

1. Verificar `CRM_WEBHOOK_URL` es correcta
2. Verificar `WEBHOOK_SECRET` es el mismo en ambos sistemas
3. Check logs en Railway: `railway logs`

## Comandos Útiles

```bash
# Ver logs
railway logs

# Ver variables de entorno
railway variables

# Setear variable
railway variables set SECRET_KEY=nuevo-secret

# Redeploy
railway up

# Open dashboard
railway open
```

## Próximos Pasos

1. [ ] Deploy a Railway
2. [ ] Configurar variables de entorno
3. [ ] Testear health endpoint
4. [ ] Actualizar CRM con nueva URL del AI Engine
5. [ ] Testear flujo end-to-end completo
