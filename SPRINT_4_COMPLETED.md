# Sprint 4 Completado - Seguimiento y Renovación

**Fecha:** 2026-04-06  
**Estado:** ✅ COMPLETADO

---

## Resumen

Se completó la funcionalidad de seguimiento y renovación del ciclo de cliente, permitiendo:

1. **Review Due Alerts**: Alertas visuales cuando la revisión trimestral está próxima
2. **Portal Hub Central**: Página centralizada con todos los estados y accesos rápidos
3. **Assets API**: Endpoint para obtener todos los assets del cliente

---

## Cambios Realizados

### 1. Review Due Alert

**Archivo modificado:** `gordocrm/portal/src/pages/client/index.astro`

**UI de alerta:**
```html
<div id="review-alert" class="hidden ...">
  <svg>⚠️</svg>
  <div>
    <h3>Review pendiente</h3>
    <p id="review-alert-text">Tu revisión trimestral está próxima...</p>
  </div>
</div>
```

**Lógica de mostrar:**
```javascript
const daysUntilReview = Math.ceil(
  (reviewDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
);

// Mostrar si está en los próximos 30 días o vencida hace ≤7 días
if (daysUntilReview <= 30 && daysUntilReview >= -7) {
  reviewAlert.classList.remove('hidden');
}
```

**Mensajes según timing:**
- `daysUntilReview < 0`: "Vencida desde hace X días"
- `daysUntilReview === 0`: "Es hoy"
- `daysUntilReview <= 7`: "Es en X días"
- `daysUntilReview > 7`: "Es en X días"

---

### 2. Portal Hub Página

**Archivo creado:** `gordocrm/portal/src/pages/client/hub.astro`

**Secciones:**

#### A. Estado Operativo
8 métricas del cliente:
- Plan (con badge de color según estado)
- Dataset (con badge de color)
- Capacidad mensual
- Segmento / Margen
- Próxima review
- Último contacto
- Contacto operativo (email)

#### B. Accesos Rápidos
6 tarjetas con iconos:
- Dashboard (`/client`)
- Trabajos (`/client/jobs`)
- Assets (`/client/assets`)
- Brief (externo, web pública)
- Onboarding (`/client/onboarding`)
- Perfil (`/client/profile`)

#### C. Últimos Trabajos
- Tabla con top 5 jobs
- Brief, estado, due date, units
- Link a detalle de cada job

#### D. Últimos Assets
- Grid con top 6 assets
- Label, tipo, link para abrir
- Solo assets aprobados

---

### 3. Assets API Endpoint

**Archivo creado:** `gordocrm/src/api/routes/portal/assets.ts`

**Endpoint:** `GET /api/portal/assets`

**Admin:**
- Ve todos los assets (limit 50)
- Incluye jobBriefText, metadata completa

**Cliente:**
- Solo ve sus assets aprobados (`status = 'approved'` o `null`)
- Solo de sus jobs
- Limit 50

**Respuesta:**
```json
{
  "assets": [
    {
      "id": "uuid",
      "jobId": "uuid",
      "jobBriefText": "Brief...",
      "label": "Asset label",
      "type": "image",
      "r2Key": "r2-key",
      "deliveryUrl": "https://...",
      "status": "approved",
      "metadata": "{}",
      "createdAt": "2026-04-06T...",
      "updatedAt": "2026-04-06T..."
    }
  ]
}
```

---

### 4. Server Routes Registration

**Archivo modificado:** `gordocrm/src/server.ts`

**Imports añadidos:**
```typescript
import { assetsRoutes } from './api/routes/portal/assets.js';
```

**Ruta registrada:**
```typescript
app.route('/api/portal/assets', assetsRoutes);
```

---

## Flujo End-to-End Completo

### 1. Alerta de Review Próxima

```
1. Cliente abre /client (dashboard)
2. CRM carga session con client.nextReviewAt
3. Calcula días hasta review
4. Si ≤30 días o ≥-7 días vencidos:
   - Muestra alerta amber en top del dashboard
   - Mensaje personalizado según urgencia
5. Cliente contacta account manager
```

### 2. Portal Hub como Centro de Mando

```
1. Cliente abre /client/hub
2. CRM carga:
   - Session con datos de cliente
   - Jobs (top 5)
   - Assets (top 6 aprobados)
3. Renderiza:
   - Estado operativo (8 métricas)
   - 6 accesos rápidos con iconos
   - Tabla últimos trabajos
   - Grid últimos assets
4. Cliente puede:
   - Ver estado de cuenta
   - Ir a cualquier sección
   - Seguir jobs activos
   - Abrir assets recientes
```

---

## Páginas del Portal Cliente (Actualizado)

| Ruta | Propósito | Estado |
|------|-----------|--------|
| `/client` | Dashboard principal | ✅ |
| `/client/hub` | Centro de cliente | ✅ NUEVO |
| `/client/jobs` | Lista de jobs | ✅ |
| `/client/jobs/detail` | Detalle + feedback | ✅ |
| `/client/assets` | Todos assets | ✅ |
| `/client/onboarding` | Checklist sesión | ✅ |
| `/client/profile` | Perfil + cuenta | ✅ |

---

## Testing Checklist

- [ ] Abrir dashboard cliente con review próxima
- [ ] Verificar alerta amber se muestra
- [ ] Verificar texto de alerta es correcto según días
- [ ] Abrir portal hub (/client/hub)
- [ ] Verificar estado operativo muestra datos reales
- [ ] Verificar accesos rápidos navegan correctamente
- [ ] Verificar últimos trabajos muestra top 5
- [ ] Verificar últimos assets muestra top 6 aprobados
- [ ] Probar endpoint GET /api/portal/assets (admin)
- [ ] Probar endpoint GET /api/portal/assets (cliente)

---

## Próximos Pasos (Sprint 5 - Pendiente)

### Notificaciones y Automatización

1. **Email Notifications**
   - Review due emails (7 días antes)
   - Asset disponible email
   - Job completado email

2. **Slack Integration**
   - Notificar equipo cuando job completado
   - Alertas de review vencida

3. **Web Push Notifications**
   - Opt-in para push en navegador
   - Notificar nuevos assets

4. **Renewal Flow**
   - Cuando subscription por expirar
   - Checkout de renovación desde portal
   - Email sequence de renovación

---

## Metadata

```json
{
  "sprint": 4,
  "status": "completed",
  "files_created": 2,
  "files_modified": 2,
  "endpoints_added": 1,
  "features_completed": 3,
  "next_sprint": "Sprint 5: Notificaciones y Automatización"
}
```
