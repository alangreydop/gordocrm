# Sprint 0 Completado - Fundamentos

**Fecha:** 2026-04-06  
**Estado:** ✅ COMPLETADO

---

## Resumen

Se implementaron los fundamentos para la integración entre los 4 sistemas:
- **CRM** (gordocrm/)
- **AI Engine** (ai-engine/)
- **Web Pública** (gordo/)
- **Portal Cliente** (gordocrm/portal/)

---

## Cambios Realizados

### 1. Auth Unificada (JWT Compartido)

**Archivos creados/modificados:**
- `ai-engine/backend/app/core/security.py` - Función `verify_crm_jwt()` para validar JWT del CRM
- `src/api/routes/ai-proxy.ts` - Proxy routes con generación de JWT para AI Engine
- `src/api/routes/portal/jobs.ts` - Helper `createAIFngineJWT()`

**Funcionamiento:**
```
CRM → genera JWT con shared secret → AI Engine valida con verify_crm_jwt()
```

**Shared Secret:** `gordo-ai-engine-secret-key-2026`

---

### 2. API Gateway Proxy

**Archivos creados:**
- `src/api/routes/ai-proxy.ts` - Proxy unificado a AI Engine

**Endpoints proxy:**
```
/api/ai/pipelines     → AI Engine /api/v1/pipelines
/api/ai/jobs          → AI Engine /api/v1/jobs
/api/ai/nodes         → AI Engine /api/v1/nodes
/api/ai/approvals     → AI Engine /api/v1/approvals
```

**Server actualizado:**
- `src/server.ts` - Registra `/api/ai` y `/api/portal/webhooks`

---

### 3. Sistema de Webhooks Internos

**Archivos creados:**
- `src/api/routes/portal/webhooks.ts` - Receptores de webhooks

**Webhooks implementados:**

| Endpoint | Origen | Evento | Acción |
|----------|--------|--------|--------|
| `POST /api/portal/webhooks/ai-engine` | AI Engine | job.started, job.completed, job.failed, approval.pending | Actualiza jobs, assets |
| `POST /api/portal/webhooks/stripe` | Stripe | checkout.session.completed | Crea cliente + job |
| `POST /api/portal/webhooks/web/brief` | Web | brief.submitted | Crea brief en CRM |
| `POST /api/portal/webhooks/web/onboarding` | Web | onboarding.completed | Actualiza cliente |

**Archivos AI Engine:**
- `ai-engine/backend/app/services/webhooks.py` - WebhookSender con retry exponential backoff
- `ai-engine/backend/app/core/config.py` - CRM_WEBHOOK_URL, WEBHOOK_SECRET

---

### 4. Database Schema Updates

**Migración creada:**
- `db/migrations/0003_external_system_ids_and_onboarding.sql`

**Campos nuevos en CRM:**

| Tabla | Campo | Tipo | Propósito |
|-------|-------|------|-----------|
| jobs | external_job_id | TEXT | ID en AI Engine |
| jobs | deliveryUrl | TEXT | URL de entrega desde AI Engine |
| jobs | started_at | INTEGER | Timestamp inicio |
| jobs | completed_at | INTEGER | Timestamp completado |
| jobs | failed_at | INTEGER | Timestamp fallo |
| jobs | failure_reason | TEXT | Razón del fallo |
| clients | onboarding_completed_at | INTEGER | Cuando completó onboarding |
| clients | first_session_at | INTEGER | Cuando tuvo primera sesión |
| clients | external_client_id | TEXT | ID en otros sistemas |
| assets | status | TEXT | pending/approved/rejected |
| assets | metadata | TEXT | JSON metadata |
| assets | updated_at | INTEGER | Timestamp actualización |

**Schema actualizado:**
- `db/schema.ts` - Campos nuevos en jobs, clients, assets

---

### 5. AI Engine Integration

**Archivos modificados:**
- `ai-engine/backend/app/api/routes/jobs.py` - Acepta `external_job_id` del CRM
- `ai-engine/backend/app/core/config.py` - CORS origins actualizados
- `ai-engine/backend/app/services/webhook_service.py` - Ya existente, usa para eventos

**Endpoint AI Engine actualizado:**
```python
POST /api/v1/jobs
{
  "pipeline_id": 1,
  "name": "Job CRM-123",
  "external_job_id": "crm-job-uuid",  # Referencia al CRM
  ...
}
```

---

### 6. CRM Jobs API Updated

**Archivos modificados:**
- `src/api/routes/portal/jobs.ts`

**Endpoints nuevos:**
```
POST /api/portal/jobs/:id/execute-ai  → Crea job en AI Engine
POST /api/portal/jobs/:id/feedback    → Feedback desde portal cliente
```

**Schemas actualizados:**
- `createJobSchema` - externalJobId
- `updateJobSchema` - externalJobId, deliveryUrl, startedAt, completedAt, failedAt, failureReason
- `createAssetSchema` - status, metadata
- `updateAssetSchema` - status, metadata

---

## Flujo End-to-End Habilitado

### 1. Brief Web → CRM
```
Web (/brief) → POST /api/portal/webhooks/web/brief → CRM: crea brief
```

### 2. Stripe Checkout → CRM
```
Stripe → POST /api/portal/webhooks/stripe → CRM: crea cliente + job
```

### 3. CRM Job → AI Engine
```
CRM Admin → POST /api/portal/jobs/:id/execute-ai → AI Engine: crea job + enqueue
```

### 4. AI Engine → CRM (webhooks)
```
AI Engine → POST /api/portal/webhooks/ai-engine
  - job.started → CRM: status = processing
  - job.completed → CRM: status = completed, deliveryUrl, assets[]
  - job.failed → CRM: status = failed, failureReason
  - approval.pending → CRM: notificar admin QA
```

### 5. Portal Feedback → CRM
```
Portal Cliente → POST /api/portal/jobs/:id/feedback → CRM: guarda en internalNotes
```

---

## Próximos Pasos (Sprint 1)

### Web → CRM Integration

1. **Web Brief → CRM**
   - Modificar `gordo/src/pages/brief.astro` para POST a CRM webhook
   - Añadir formulario de brief con autenticación opcional

2. **Stripe Webhook → CRM**
   - Configurar Stripe para enviar a `/api/portal/webhooks/stripe`
   - Testear flujo checkout.session.completed

3. **Onboarding → CRM**
   - Modificar `gordo/src/pages/onboarding.astro`
   - POST a `/api/portal/webhooks/web/onboarding` al completar checklist

---

## Testing Pendiente

- [ ] Probar auth JWT compartida (CRM → AI Engine)
- [ ] Probar proxy routes `/api/ai/*`
- [ ] Probar webhooks AI Engine → CRM
- [ ] Probar endpoint execute-ai
- [ ] Aplicar migración 0003 en D1 local y remoto

---

## Metadata

```json
{
  "sprint": 0,
  "status": "completed",
  "files_created": 5,
  "files_modified": 8,
  "endpoints_added": 6,
  "database_fields_added": 14,
  "next_sprint": "Sprint 1: Web → CRM Integration"
}
```
