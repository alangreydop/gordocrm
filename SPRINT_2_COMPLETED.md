# Sprint 2 Completado - CRM → AI Engine Integration

**Fecha:** 2026-04-06  
**Estado:** ✅ COMPLETADO

---

## Resumen

Se completó la integración bidireccional entre el CRM y el AI Engine, permitiendo:

1. **CRM → AI Engine**: Ejecución de jobs en el AI Engine desde el portal admin del CRM
2. **AI Engine → CRM**: Webhooks automáticos que actualizan el estado del job en el CRM
3. **UI Admin**: Botón "Ejecutar en AI Engine" en el detalle de jobs

---

## Cambios Realizados

### 1. AI Engine Webhook Service Update

**Archivo modificado:** `ai-engine/backend/app/services/webhooks.py`

**Cambios:**
- URL actualizada de localhost a producción:
  - Antes: `http://127.0.0.1:8787/api/portal/webhooks`
  - Ahora: `https://gordocrm-api-production.alangreydop.workers.dev/api/portal/webhooks/ai-engine`

**Funciones disponibles:**
```python
await send_job_started(job_id, external_job_id, pipeline_id)
await send_job_completed(job_id, external_job_id, delivery_url, outputs)
await send_job_failed(job_id, external_job_id, error)
await send_approval_pending(job_id, external_job_id, approval_id, node_id)
await send_approval_approved(job_id, external_job_id, approval_id)
await send_approval_rejected(job_id, external_job_id, approval_id, reason)
```

**Firma HMAC:**
- Los webhooks se firman con `WEBHOOK_SECRET = "gordo-ai-engine-secret-key-2026"`
- El CRM valida la firma antes de procesar

---

### 2. Portal Admin - Execute AI Button

**Archivo modificado:** `gordocrm/portal/src/pages/admin/jobs/detail.astro`

**Nuevo botón:**
```html
<button id="execute-ai-btn" class="...">
  <svg>⚡</svg>
  Ejecutar en AI Engine
</button>
```

**Funcionalidad:**
- POST a `/api/portal/jobs/:id/execute-ai`
- Muestra spinner de carga mientras se envía
- Alert con el AI Job ID tras éxito
- Recarga el job para mostrar estado actualizado

**Flujo:**
```
Admin click → POST /api/portal/jobs/:id/execute-ai 
  → CRM genera JWT 
  → CRM POST a AI Engine /api/v1/jobs 
  → AI Engine crea job + enqueue en Celery 
  → CRM actualiza job.status = 'processing'
```

---

### 3. Pipeline Executor - Webhook Emits

**Archivo:** `ai-engine/backend/app/services/pipeline_executor.py`

**Eventos emitidos automáticamente:**

| Evento | Cuándo se emite | Datos enviados |
|--------|-----------------|----------------|
| `job.started` | Al comenzar ejecución | `job_id`, `pipeline_id` |
| `job.completed` | Al completar exitosamente | `job_id`, `pipeline_id`, `output_data` |
| `job.failed` | Al fallar | `job_id`, `pipeline_id`, `error` |
| `approval.pending` | En nodo de aprobación | `job_id`, `approval_id`, `node_id` |

**Código de ejemplo:**
```python
# Emitir evento job.started
asyncio.create_task(
    emit_webhook_event(
        self.db,
        "job.started",
        {"job_id": self.job.id, "pipeline_id": self.job.pipeline_id},
    )
)
```

---

### 4. CRM Webhook Handler

**Archivo:** `gordocrm/src/api/routes/portal/webhooks.ts`

**Endpoint `/ai-engine`:**
```typescript
webhookRoutes.post('/ai-engine', async (c) => {
  // Valida firma HMAC
  // Busca job por external_job_id
  // Actualiza según evento:
  //   - job.started → status = 'processing', startedAt = now
  //   - job.completed → status = 'completed', deliveryUrl, assets[]
  //   - job.failed → status = 'failed', failureReason
  //   - approval.pending → notificar admin
});
```

**Assets creados automáticamente:**
Cuando `job.completed` con outputs:
```typescript
for (const output of data.outputs) {
  await db.insert(schema.assets).values({
    jobId: job.id,
    url: output.url,
    assetType: output.output_type,
    metadata: output.metadata,
    status: 'approved',
  });
}
```

---

## Flujo End-to-End Completo

### 1. Admin ejecuta job en AI Engine

```
1. Admin abre /admin/jobs/detail?id=xxx
2. Click en "Ejecutar en AI Engine"
3. CRM POST a http://localhost:8000/api/v1/jobs:
   {
     "pipeline_id": 1,
     "name": "Job xxx - Brief text",
     "external_job_id": "crm-job-uuid",
     "input_data": { ... }
   }
4. AI Engine crea job en PostgreSQL
5. Celery enqueue tarea execute_pipeline_task
6. CRM actualiza job.status = 'processing'
```

### 2. AI Engine ejecuta pipeline

```
1. Celery worker toma tarea
2. PipelineExecutor construye grafo DAG
3. Emite webhook job.started → CRM
4. Ejecuta nodos en orden topológico
5. Si nodo approval → pausa y emite approval.pending
6. Al completar → emite job.completed con outputs
```

### 3. CRM recibe webhook

```
1. POST /api/portal/webhooks/ai-engine
2. Valida firma HMAC-SHA256
3. Busca job por external_job_id
4. Actualiza:
   - job.started → status='processing'
   - job.completed → status='completed', crea assets
   - job.failed → status='failed', failureReason
```

---

## Configuración Requerida

### AI Engine (.env)

```bash
# CRM Integration
CRM_WEBHOOK_URL=https://gordocrm-api-production.alangreydop.workers.dev/api/portal/webhooks/ai-engine
WEBHOOK_SECRET=gordo-ai-engine-secret-key-2026

# CORS (permitir CRM)
CORS_ORIGINS=["http://localhost:8787","https://gordocrm-api-production.alangreydop.workers.dev"]
```

### CRM (Cloudflare Workers)

```bash
# Production URL ya configurada en jobs.ts
AI_ENGINE_BASE = 'http://localhost:8000/api/v1'  # Dev
# En producción usar URL real del AI Engine
```

---

## Testing Checklist

- [ ] Iniciar AI Engine (backend + Celery worker)
- [ ] Iniciar CRM (wrangler dev)
- [ ] Crear job desde admin portal
- [ ] Click "Ejecutar en AI Engine"
- [ ] Verificar job.status = 'processing' en CRM
- [ ] Verificar webhook job.started recibido
- [ ] Verificar pipeline se ejecuta en AI Engine
- [ ] Verificar webhook job.completed recibido
- [ ] Verificar assets creados en CRM
- [ ] Verificar job.status = 'completed' en CRM

---

## Próximos Pasos (Sprint 3)

### Portal → CRM Integration

1. **Portal Feedback → CRM**
   - Endpoint `/api/portal/jobs/:id/feedback` ya existe
   - Añadir UI en portal cliente para enviar feedback

2. **Approved Assets → Portal**
   - Mostrar assets aprobados en `/client/assets`
   - Filtrar por job o mostrar todos

3. **Push Notifications**
   - Notificar cuando nuevo asset disponible
   - Email o webhook a servicio de notificaciones

---

## Metadata

```json
{
  "sprint": 2,
  "status": "completed",
  "files_created": 0,
  "files_modified": 2,
  "endpoints_added": 0,
  "endpoints_updated": 2,
  "next_sprint": "Sprint 3: Portal → CRM Integration"
}
```
