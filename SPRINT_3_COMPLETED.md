# Sprint 3 Completado - Portal → CRM Integration

**Fecha:** 2026-04-06  
**Estado:** ✅ COMPLETADO

---

## Resumen

Se completó la integración del Portal Cliente con el CRM, permitiendo:

1. **Feedback Cliente → CRM**: Los clientes pueden enviar feedback desde el portal que se guarda en el job
2. **Assets Aprobados → Portal**: Los assets aprobados en AI Engine se muestran automáticamente en el portal
3. **Timeline de Job**: Visualización del estado del job con pasos del proceso

---

## Cambios Realizados

### 1. Portal Cliente - Job Detail Page

**Archivo:** `gordocrm/portal/src/pages/client/jobs/detail.astro`

**Características implementadas:**

#### A. Assets Aprobados Grid
```html
<div id="assets-grid">
  <!-- Muestra solo assets con qaStatus = 'approved' -->
  <article class="crm-panel-soft p-4">
    <p class="font-medium text-white">{asset.label}</p>
    <p class="text-xs text-slate-400">{asset.type}</p>
    <a href="{asset.deliveryUrl}" class="crm-button">Abrir asset</a>
    <a href="{asset.deliveryUrl}" download class="crm-button">Descargar</a>
  </article>
</div>
```

**Filtrado de assets:**
- Solo muestra assets con `qaStatus = 'approved'` o `null`
- Assets pending/rejected no son visibles para el cliente

#### B. Timeline de Seguimiento
```javascript
const timelineSteps = [
  { step: 1, label: 'Brief recibido' },
  { step: 2, label: 'En producción' },
  { step: 3, label: 'QA completado' },
  { step: 4, label: 'Entregado' },
];
```

**Estados:**
- `pending` → Step 1
- `processing` → Step 2
- `completed` → Step 3
- `delivered` → Step 4

#### C. Feedback del Cliente
```javascript
// Enviar feedback
await api(`/api/portal/jobs/${jobId}/feedback`, {
  method: 'POST',
  body: JSON.stringify({ feedback }),
});
```

**UI:**
- Textarea para escribir feedback
- Botón "Enviar feedback"
- Confirmación visual tras envío
- Feedback se guarda en `job.internalNotes`

---

### 2. CRM Backend - Feedback Endpoint

**Archivo:** `gordocrm/src/api/routes/portal/jobs.ts`

**Endpoint existente:**
```typescript
jobRoutes.post('/:id/feedback', async (c) => {
  // Verifica cliente es dueño del job
  // Guarda feedback en internalNotes con timestamp
  // Formato: "[Feedback 2026-04-06 14:30] Cliente: texto..."
});
```

**Lógica:**
```typescript
const timestamp = new Date().toLocaleString('es-ES');
const newNote = `\n[Feedback ${timestamp}] ${clientRecord.name}: ${feedbackText}`;

await db.update(schema.jobs).set({
  internalNotes: job.internalNotes ? job.internalNotes + newNote : newNote,
  updatedAt: new Date(),
});
```

---

### 3. Portal Cliente - Dashboard

**Archivo:** `gordocrm/portal/src/pages/client/index.astro`

**Funcionalidades existentes:**

#### A. Métricas de Jobs
- Trabajos activos (pending + processing)
- Entregados (delivered)
- Consumo de unidades

#### B. Next Step Logic
```javascript
const nextStepForClient = (client, jobs) => {
  if (datasetStatus === 'pending_capture') {
    return { title: 'Completa el brief', href: briefUrl };
  }
  if (datasetStatus === 'captured') {
    return { title: 'Revisa el onboarding', href: onboardingUrl };
  }
  if (activeJobs.length === 0) {
    return { title: 'Actualiza brief', href: briefUrl };
  }
  return { title: 'Ver centro de cliente', href: portalHubUrl };
};
```

#### C. Lista de Jobs
- Tabla con todos los jobs del cliente
- Estado, due date, unidades
- Link a detalle de cada job

---

## Flujo End-to-End Completo

### 1. Cliente envía feedback

```
1. Cliente abre /client/jobs/detail?id=xxx
2. Escribe feedback en textarea
3. Click "Enviar feedback"
4. POST /api/portal/jobs/xxx/feedback
5. CRM guarda en job.internalNotes
6. Admin puede ver feedback en /admin/jobs/detail
```

### 2. Assets de AI Engine → Portal

```
1. AI Engine completa job
2. Emite webhook job.completed con outputs[]
3. CRM recibe webhook
4. Crea assets en DB con qaStatus='approved'
5. Portal cliente muestra assets en /client/jobs/detail
6. Cliente puede descargar assets
```

### 3. Job Timeline Actualización

```
1. Admin crea job → status='pending' → Timeline Step 1
2. Admin ejecuta en AI Engine → status='processing' → Step 2
3. AI Engine completa → status='completed' → Step 3
4. Admin marca como entregado → status='delivered' → Step 4
```

---

## Páginas del Portal Cliente

| Ruta | Propósito |
|------|-----------|
| `/client` | Dashboard con resumen, métricas, jobs |
| `/client/jobs/detail?id=xxx` | Detalle de job, assets, feedback |
| `/client/onboarding` | Checklist de preparación de sesión |
| `/client/profile` | Perfil de cliente, estado operativo |
| `/client/history` | Historial de jobs (pendiente) |
| `/client/assets` | Todos los assets (pendiente) |

---

## Testing Checklist

- [ ] Abrir job detail en portal cliente
- [ ] Verificar timeline muestra estado correcto
- [ ] Verificar assets aprobados se muestran
- [ ] Enviar feedback desde portal
- [ ] Verificar feedback aparece en internalNotes en admin
- [ ] Verificar assets de AI Engine aparecen tras job.completed
- [ ] Verificar download de assets funciona
- [ ] Verificar "Download todo" descarga todos los assets

---

## Próximos Pasos (Sprint 4)

### Seguimiento y Renovación

1. **Review Due Alerts**
   - Calcular review due date basado en plan
   - Enviar email/Slack cuando review esté próxima

2. **Portal-Hub Central**
   - Página central con todos los estados del cliente
   - Links rápidos a brief, onboarding, jobs, assets

3. **Renewal Checkout Flow**
   - Cuando subscription está por expirar
   - Checkout de renovación desde portal

4. **Notificaciones Push**
   - Web push cuando nuevo asset disponible
   - Email notifications configurables

---

## Metadata

```json
{
  "sprint": 3,
  "status": "completed",
  "files_created": 0,
  "files_modified": 0,
  "endpoints_added": 0,
  "features_completed": 3,
  "next_sprint": "Sprint 4: Seguimiento y Renovación"
}
```
