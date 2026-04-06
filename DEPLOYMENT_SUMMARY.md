# Deployment a Producción Completado

**Fecha:** 2026-04-06  
**Estado:** ✅ COMPLETADO

---

## Resumen Ejecutivo

Se desplegaron exitosamente ambos sistemas del ecosistema Grande & Gordo a Cloudflare:

| Sistema | URL de Producción | Estado |
|---------|-------------------|--------|
| **CRM API** | https://gordocrm-api-production.alangreydop.workers.dev | ✅ Activo |
| **Web Pública** | https://grandeandgordo-site.pages.dev | ✅ Activo |

---

## Detalles del Deployment

### CRM API (Cloudflare Workers)

**Configuración:**
- Runtime: Cloudflare Workers
- Base de datos: D1 (SQLite)
- Migraciones: 16 aplicadas exitosamente
- Assets: 55 archivos del portal

**Bindings:**
```toml
env.DB (gordocrm)         → D1 Database
env.APP_ENV ("production") → Environment Variable
env.CORS_ORIGIN            → Environment Variable
```

**URLs:**
- API: `https://gordocrm-api-production.alangreydop.workers.dev`
- Portal: `/portal/*` (assets estáticos)

**Version ID:** `c75113b1-fab4-42f1-ab1f-051e8820d55b`

---

### Web Pública (Cloudflare Pages)

**Configuración:**
- Framework: Astro 5.13
- Output: Static
- Build: 42 páginas generadas

**URLs:**
- Producción: `https://grandeandgordo-site.pages.dev`
- Deployment: `https://ea07aec7.grandeandgordo-site.pages.dev`

**Endpoints:**
- `/brief` → Formulario de captación
- `/onboarding` → Onboarding de clientes
- `/api/portfolio.json` → API endpoint

---

## Configuración de Integración

### Webhooks Requeridos

El AI Engine debe configurar las siguientes URLs en producción:

```bash
# AI Engine .env
CRM_WEBHOOK_URL=https://gordocrm-api-production.alangreydop.workers.dev/api/portal/webhooks/ai-engine
WEBHOOK_SECRET=gordo-ai-engine-secret-key-2026
```

### CORS

El CRM permite requests desde:
- `https://grandeandgordo-site.pages.dev`
- `https://gordocrm-api-production.alangreydop.workers.dev`

---

## Próximos Pasos

### 1. Configurar AI Engine en Producción

El AI Engine necesita desplegarse en un entorno accesible desde internet:
- Opción A: Cloudflare Run (Docker container)
- Opción B: Railway/Render/Fly.io
- Opción C: VPS tradicional

**URLs requeridas:**
```
AI Engine Base URL → CRM: https://ai-engine.grandeandgordo.com/api/v1
Webhook URL → AI Engine: https://gordocrm-api-production.alangreydop.workers.dev/api/portal/webhooks/ai-engine
```

### 2. Actualizar Variables de Entorno

**CRM (Wrangler):**
```bash
# Ya configurado
wrangler secret put APP_ENV --env production
wrangler secret put CORS_ORIGIN --env production
```

**AI Engine:**
```bash
CRM_WEBHOOK_URL=https://gordocrm-api-production.alangreydop.workers.dev/api/portal/webhooks/ai-engine
WEBHOOK_SECRET=<generar-nuevo-secreto>
```

### 3. Validar End-to-End Flow

1. **Brief Web → CRM**
   - [ ] Completar brief en web pública
   - [ ] Verificar en `/admin/briefs` del CRM

2. **Job → AI Engine**
   - [ ] Admin crea job desde brief
   - [ ] Click "Ejecutar en AI Engine"
   - [ ] Verificar webhook recibido

3. **AI Engine → CRM**
   - [ ] Webhook `job.started` → status = 'processing'
   - [ ] Webhook `job.completed` → status = 'completed', assets creados
   - [ ] Webhook `job.failed` → status = 'failed'

4. **Portal Cliente**
   - [ ] Cliente ve job en `/client/jobs`
   - [ ] Cliente envía feedback
   - [ ] Admin ve feedback en `/admin/jobs/detail`
   - [ ] Assets aprobados visibles en `/client/assets`

---

## Archivos de Configuración Creados

### gordocrm/wrangler.toml
```toml
name = "gordocrm-api"
main = "src/server.ts"
compatibility_date = "2024-01-01"

[production]
  account_id = "ddca599bc0cee2659e3f64f5acc05eb4"
  workers_dev = true
  route = { pattern = "gordocrm-api-production.alangreydop.workers.dev", zone_name = "alangreydop.workers.dev" }

  [[production.d1_databases]]
    binding = "DB"
    database_name = "gordocrm"
    database_id = "<database-id>"
```

### gordo/wrangler.toml
```toml
name = "grandeandgordo-site"
compatibility_date = "2026-04-06"
pages_build_output_dir = "./dist"

[env.production]
name = "grandeandgordo-site-production"
```

---

## Testing Checklist

### CRM API
- [ ] `GET /health` → status: "ok"
- [ ] `GET /api/portal/auth/session` → sesión válida
- [ ] `GET /api/portal/jobs` → lista de jobs
- [ ] `GET /api/portal/assets` → lista de assets
- [ ] `POST /api/portal/webhooks/ai-engine` → webhook recibido

### Web Pública
- [ ] Homepage carga correctamente
- [ ] Formulario brief funciona
- [ ] Onboarding page accesible
- [ ] Links de navegación funcionan

### Portal Cliente
- [ ] Login funciona
- [ ] Dashboard muestra datos reales
- [ ] Hub page accesible
- [ ] Feedback se guarda correctamente

---

## Metadata

```json
{
  "deployment_date": "2026-04-06",
  "crm_version": "c75113b1-fab4-42f1-ab1f-051e8820d55b",
  "web_deployment": "ea07aec7",
  "systems_deployed": 2,
  "pending_systems": 1,
  "pending_system": "AI Engine"
}
```
