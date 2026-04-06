# Sprint 1 Completado - Web → CRM Integration

**Fecha:** 2026-04-06  
**Estado:** ✅ COMPLETADO

---

## Resumen

Se completó la integración bidireccional entre la Web Pública (gordo/) y el CRM (gordocrm/), permitiendo:

1. **Brief Web → CRM**: Los formularios de brief en la web pública crean clientes y briefs en el CRM
2. **Onboarding → CRM**: El portal cliente permite completar el checklist de onboarding y notifica al CRM

---

## Cambios Realizados

### 1. Web Brief Form → CRM Webhook

**Archivo modificado:** `gordo/src/pages/brief.astro`

**Cambios:**
- Endpoint cambiado de `/api/brief` (local) a CRM webhook remoto
- Payload actualizado: `descripcion` → `description` (snake_case a camelCase)
- Eliminado campo `tipo` del payload (se mantiene pero no se envía al CRM)

**Nuevo endpoint:**
```javascript
const CRM_WEBHOOK_URL = 'https://gordocrm-api-production.alangreydop.workers.dev/api/portal/webhooks/web/brief';

await fetch(CRM_WEBHOOK_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email,
    tipo: tipoInput.value,
    description: descripcion,
  }),
});
```

**Flujo:**
```
Web Form → CRM Webhook → Busca/crea cliente por email → Crea brief_submission
```

---

### 2. Portal Cliente Onboarding

**Archivo creado:** `gordocrm/portal/src/pages/client/onboarding.astro`

**Características:**
- Checklist de 19 items organizados en 4 categorías:
  - Producto (5 items)
  - Identidad de marca (5 items)
  - Contexto y usos (5 items)
  - Accesos (4 items, opcional)
- Selector de fecha y horario para programar sesión
- Contador de progreso en tiempo real
- Webhook al CRM al completar

**Webhook enviado:**
```javascript
POST /api/portal/webhooks/web/onboarding
{
  clientId: "uuid",
  checklistCompleted: true,
  sessionScheduled: true,
  sessionDate: "2026-04-15T10:00"
}
```

**UI:**
- Diseño coherente con el portal (dark theme, bordes redondeados)
- Checkboxes con hover states
- Botón sticky en bottom para completar
- Pantalla de éxito tras completar

---

### 3. CRM Webhook Updates

**Archivo modificado:** `gordocrm/src/api/routes/portal/webhooks.ts`

**Correcciones:**
- `schema.briefs` → `schema.briefSubmissions` (nombre correcto de la tabla)
- Campo `tipo` → `contentType` (match con schema Drizzle)
- Validación de firma HMAC mantenida para seguridad

**Endpoint `/web/brief`:**
```typescript
await db.insert(schema.briefSubmissions).values({
  clientId,
  email,
  contentType: tipo,  // 'foto', 'video', 'ambos'
  description,
  status: 'new',
  source: 'web_form',
  createdAt: new Date(),
  updatedAt: new Date(),
});
```

**Endpoint `/web/onboarding`:**
```typescript
await db.update(schema.clients).set({
  onboardingCompletedAt: checklistCompleted ? new Date() : null,
  firstSessionAt: sessionScheduled && sessionDate ? new Date(sessionDate) : null,
  updatedAt: new Date(),
});
```

---

### 4. Site Links Configuration

**Archivo:** `gordocrm/portal/src/lib/site-links.ts`

Ya existente, no requirió cambios:
```typescript
export const siteLinks = {
  home: siteBase,
  portalHub: `${siteBase}/portal`,
  brief: `${siteBase}/brief`,
  onboarding: `${siteBase}/onboarding`,  // ✅ Ya configurado
  // ...
};
```

---

## Flujo End-to-End Actualizado

### 1. Brief Web → CRM → Job
```
Web (/brief) 
  → POST /api/portal/webhooks/web/brief 
  → CRM: busca/crea cliente por email 
  → CRM: crea brief_submission 
  → (Opcional) Admin crea job desde brief en portal
```

### 2. Onboarding Portal → CRM
```
Portal Cliente (/client/onboarding)
  → GET /api/portal/session (obtiene client_id)
  → POST /api/portal/webhooks/web/onboarding
  → CRM: actualiza client.onboardingCompletedAt, firstSessionAt
```

### 3. Dashboard Cliente → Next Step
```
Portal Cliente (/)
  → Lee client.datasetStatus
  → Si 'pending_capture' → sugiere completar brief
  → Si 'captured' → sugiere completar onboarding
  → Si jobs activos → sugiere ver portal hub
```

---

## Próximos Pasos (Sprint 2)

### CRM → AI Engine Integration

1. **Job Auto-Enqueue**
   - Modificar `src/api/routes/portal/jobs.ts` para auto-enqueue
   - Cuando admin crea job desde brief → ejecutar en AI Engine

2. **AI Engine Results → CRM Assets**
   - Webhook `/ai-engine` ya implementado
   - Testear flujo completo: job.started → job.completed → assets

3. **Approval Notifications → CRM Admin**
   - Webhook `approval.pending` → notificar admin
   - UI en portal admin para aprobaciones pendientes

---

## Testing Checklist

- [ ] Probar brief form en web pública (localhost:4321/brief)
- [ ] Verificar cliente se crea en D1 con email correcto
- [ ] Verificar brief_submission se guarda con contentType
- [ ] Probar onboarding en portal cliente (localhost:8787/client/onboarding)
- [ ] Verificar onboardingCompletedAt se actualiza en clients
- [ ] Verificar firstSessionAt se guarda cuando hay fecha
- [ ] Testear dashboard "next step" logic con diferentes client states

---

## Metadata

```json
{
  "sprint": 1,
  "status": "completed",
  "files_created": 1,
  "files_modified": 2,
  "endpoints_added": 0,
  "endpoints_updated": 2,
  "next_sprint": "Sprint 2: CRM → AI Engine Integration"
}
```
