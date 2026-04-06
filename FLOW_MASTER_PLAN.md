# Master Flow Plan - Grande&Gordo

**Fecha:** 2026-04-06  
**Estado:** Análisis y planificación de flujo integral

---

## 1. Diagnóstico Actual: Sistemas Inconexos

Ahora mismo tenemos **4 sistemas separados** que no se hablan entre sí:

```
┌─────────────────┐     ┌─────────────────┐
│   WEB PUBLICA   │     │   AI ENGINE     │
│   (gordo/)      │     │   (ai-engine/)  │
│                 │     │                 │
│ - Captación     │     │ - Pipelines     │
│ - Brief         │     │ - Generación    │
│ - Onboarding    │     │ - Assets        │
└─────────────────┘     └─────────────────┘
         │                       │
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│      CRM        │     │    PORTAL       │
│   (gordocrm/)   │     │   (gordocrm/)   │
│                 │     │                 │
│ - Clientes      │     │ - Resumen       │
│ - Jobs          │     │ - Assets        │
│ - Briefs        │     │ - Historial     │
│ - Dashboard     │     │ - Perfil        │
└─────────────────┘     └─────────────────┘
```

**Problema:** No hay un flujo de ida y vuelta. Cada sistema vive en su propio silo.

---

## 2. Flujo Ideal: Customer Journey Completo

### Fase 0: Pre-Venta (WEB PUBLICA)

```
┌──────────────────────────────────────────────────────────────┐
│  VISITANTE → LEAD → CLIENTE                                  │
│                                                               │
│  1. Landing (/) → "Entiendo mi problema"                     │
│  2. /sesion-dataset → "Entiendo el primer paso"              │
│  3. /brief → "Dejo mi contexto"                              │
│  4. Checkout → "Compro"                                      │
└──────────────────────────────────────────────────────────────┘
```

**Estado actual:** ✅ Web existe, ✅ Brief existe, ❌ Checkout no conecta con CRM

**Conexiones faltantes:**
- Brief web → CRM (crear cliente + brief automáticamente)
- Checkout → CRM (crear cliente + job automáticamente)

---

### Fase 1: Onboarding (WEB PUBLICA → CRM)

```
┌──────────────────────────────────────────────────────────────┐
│  CLIENTE NUEVO → ONBOARDING                                  │
│                                                               │
│  1. Email bienvenida → con enlace a /onboarding              │
│  2. /onboarding → "Preparo mi primera sesión"                │
│  3. Checklist pre-sesión → producto, SKUs, referencias       │
│  4. Agenda sesión → fecha confirmada                         │
└──────────────────────────────────────────────────────────────┘
```

**Estado actual:** ✅ Página /onboarding existe, ❌ No conecta con CRM

**Conexiones faltantes:**
- Onboarding completado → CRM (marcar cliente como "listo para sesión")
- Agenda sesión → CRM (crear evento + recordatorio)

---

### Fase 2: Captación de Datos (CRM + AI ENGINE)

```
┌──────────────────────────────────────────────────────────────┐
│  SESIÓN DE DATOS → ACTIVACIÓN SISTEMA VISUAL                 │
│                                                               │
│  1. Sesión → capturar producto, packaging, referencias       │
│  2. Ingesta → organizar dataset por SKU                      │
│  3. Benchmark → probar 2-3 motores                           │
│  4. Stack ganador → seleccionar mejor resultado              │
│  5. Activar → sistema visual listo para producir             │
└──────────────────────────────────────────────────────────────┘
```

**Estado actual:** 
- ✅ CRM tiene campos para stack_lane, benchmark, stack_ganador
- ✅ AI Engine tiene pipelines para generación
- ❌ CRM no dispara pipelines de AI Engine
- ❌ AI Engine no guarda resultados en CRM

**Conexiones faltantes:**
- CRM: "Activar benchmark" → AI Engine: crear pipeline + ejecutar
- AI Engine: resultados → CRM: guardar stack_ganador, snapshot
- CRM: unidades_previstas, coste_ai_estimado → AI Engine: optimizar pipeline

---

### Fase 3: Producción (AI ENGINE → CRM)

```
┌──────────────────────────────────────────────────────────────┐
│  BRIEF MENSUAL → PRODUCCIÓN → ENTREGA                        │
│                                                               │
│  1. Cliente envía brief mensual (web)                        │
│  2. CRM: brief se crea como "new"                            │
│  3. Admin: revisa brief → "Crear job"                        │
│  4. CRM: job se crea con briefText, type, due                │
│  5. AI Engine: pipeline se ejecuta                           │
│  6. QA interno → aprobación                                  │
│  7. Entrega → assets aprobados en portal                     │
└──────────────────────────────────────────────────────────────┘
```

**Estado actual:**
- ✅ CRM: sistema de briefs implementado
- ✅ CRM: botón "Crear job" desde brief
- ✅ AI Engine: pipelines + jobs + approvals
- ❌ Job de CRM no crea job en AI Engine automáticamente
- ❌ Assets de AI Engine no se guardan en CRM

**Conexiones faltantes:**
- CRM Job creado → AI Engine: crear job + enqueue pipeline
- AI Engine job completado → CRM: actualizar deliveryUrl, assets
- AI Engine approval needed → CRM: notificar admin para QA

---

### Fase 4: Entrega y Feedback (PORTAL → CRM)

```
┌──────────────────────────────────────────────────────────────┐
│  CLIENTE REVISA → FEEDBACK → CIERRE                          │
│                                                               │
│  1. Portal: /client/assets → ve assets aprobados             │
│  2. Portal: /client/jobs/detail → ve estado + entrega        │
│  3. Cliente: feedback/aprobación en entregable               │
│  4. CRM: feedback se guarda en job                           │
│  5. Admin: revisa feedback → iteración o cierre              │
└──────────────────────────────────────────────────────────────┘
```

**Estado actual:**
- ✅ Portal: assets, history, job detail implementados
- ✅ Portal: sistema de feedback/aprobación
- ❌ Feedback no se guarda en CRM (solo UI)
- ❌ No hay notificaciones de nuevo asset disponible

**Conexiones faltantes:**
- Portal: feedback submit → CRM: job.feedback = [...]
- CRM: job.status = "delivered" → Portal: notificar cliente
- CRM: asset aprobado → Portal: añadir a /client/assets

---

### Fase 5: Seguimiento y Renovación (CRM → WEB)

```
┌──────────────────────────────────────────────────────────────┐
│  SEGUIMIENTO → RENOVACIÓN → UPSELL                           │
│                                                               │
│  1. CRM: review_date se acerca → alertar account manager     │
│  2. Account manager: contacta cliente                        │
│  3. Cliente: /portal-hub → ve su estado, historial           │
│  4. Upsell: nuevo pack, más unidades, otro formato           │
│  5. Renovación: checkout nuevo → volver a Fase 1             │
└──────────────────────────────────────────────────────────────┘
```

**Estado actual:**
- ✅ CRM: campo next_review_at, alertas de reviews
- ✅ Web: /portal-hub para clientes existentes
- ❌ CRM no dispara alertas automáticas
- ❌ Portal-hub no muestra estado real del cliente

**Conexiones faltantes:**
- CRM: review_date - 7 días → email/slack a account manager
- CRM: cliente activo → Portal-hub: mostrar estado, unidades restantes
- Portal-hub: "Renovar" → Web: checkout con pack seleccionado

---

## 3. Matriz de Conexiones Críticas

| Origen | Destino | Conexión | Estado | Prioridad |
|--------|---------|----------|--------|-----------|
| Web Brief | CRM Briefs | POST /api/portal/briefs (webhook) | ❌ | ALTA |
| Web Checkout | CRM Clientes | POST /api/portal/clients (webhook Stripe) | ❌ | ALTA |
| Web Onboarding | CRM Clientes | PATCH /api/portal/clients/:id (onboarding_complete) | ❌ | MEDIA |
| CRM Job creado | AI Engine Jobs | POST /api/v1/jobs (auto-enqueue) | ❌ | ALTA |
| AI Engine Job completado | CRM Jobs | PATCH /api/portal/jobs/:id (deliveryUrl, assets) | ❌ | ALTA |
| AI Engine Approval | CRM Admin | Notificación QA pendiente | ❌ | MEDIA |
| CRM Asset aprobado | Portal Assets | GET /api/portal/assets (filtrar approved=true) | ✅ | - |
| Portal Feedback | CRM Jobs | POST /api/portal/jobs/:id/feedback | ❌ | MEDIA |
| CRM Review due | Account Manager | Email/Slack alerta | ❌ | BAJA |

---

## 4. Arquitectura Propuesta

### 4.1. Unificar Auth

**Problema actual:** 3 sistemas con auth separada
- Web: sin auth (pública)
- CRM: cookies + D1 sessions
- AI Engine: JWT + PostgreSQL

**Solución:** Single Sign-On (SSO) con JWT compartido
```
┌──────────────────────────────────────────────────────────────┐
│  AUTH UNIFICADA                                              │
│                                                               │
│  1. Usuario login → CRM (/login)                             │
│  2. CRM: valida credenciales → genera JWT                    │
│  3. JWT se guarda en cookie httpOnly                         │
│  4. CRM frontend: usa JWT para /api/*                        │
│  5. AI Engine: acepta JWT mismo secret                       │
│  6. Web: JWT para briefs (si logged in, pre-llenar)          │
└──────────────────────────────────────────────────────────────┘
```

**Cambios necesarios:**
- AI Engine: añadir opción de validar JWT desde CRM secret
- CRM: endpoint /api/auth/sso-token para AI Engine
- Web: leer JWT (si existe) para pre-llenar brief

---

### 4.2. API Gateway Unificado

**Problema actual:** 2 APIs separadas (CRM Hono + AI Engine FastAPI)

**Solución:** CRM como gateway principal, AI Engine como servicio interno
```
┌──────────────────────────────────────────────────────────────┐
│  API GATEWAY (CRM Worker)                                    │
│                                                               │
│  /api/portal/* → Hono routes (CRM)                           │
│  /api/ai/* → Proxy → AI Engine (FastAPI)                     │
│                                                               │
│  Beneficios:                                                  │
│  - Single CORS origin                                        │
│  - Auth centralizada                                         │
│  - Rate limiting unificado                                   │
│  - Logs centralizados                                        │
└──────────────────────────────────────────────────────────────┘
```

**Cambios necesarios:**
- CRM: añadir proxy routes a AI Engine
- AI Engine: permitir CORS desde CRM domain
- CRM: forwards JWT a AI Engine en proxy

---

### 4.3. Webhooks Bidireccionales

**Problema actual:** No hay notificaciones entre sistemas

**Solución:** Sistema de webhooks interno
```
┌──────────────────────────────────────────────────────────────┐
│  WEBHOOKS INTERNOS                                           │
│                                                               │
│  CRM → Web:                                                  │
│    - client.created → Web: actualizar lista clientes         │
│    - job.completed → Web: notificar cliente                  │
│    - brief.received → Web: confirmar recepción               │
│                                                               │
│  AI Engine → CRM:                                            │
│    - job.started → CRM: job.status = "processing"            │
│    - job.completed → CRM: job.status = "delivered"           │
│    - approval.pending → CRM: notificar QA                    │
│                                                               │
│  Web → CRM:                                                  │
│    - brief.submitted → CRM: crear brief                      │
│    - checkout.completed → CRM: crear cliente + job           │
└──────────────────────────────────────────────────────────────┘
```

**Cambios necesarios:**
- CRM: webhook sender (ya existe para externos, adaptar para internos)
- AI Engine: webhook sender para eventos de jobs
- Web: webhook endpoints para recibir notificaciones

---

### 4.4. Database Sync

**Problema actual:** 2 databases separadas (D1 + PostgreSQL)

**Solución:** Mantener separación pero con sync de entidades críticas
```
┌──────────────────────────────────────────────────────────────┐
│  DATABASE SYNC                                               │
│                                                               │
│  CRM (D1):                                                   │
│    - clients, jobs, briefs, assets                           │
│    - datos comerciales, pricing, margen                      │
│                                                               │
│  AI Engine (PostgreSQL):                                     │
│    - pipelines, jobs (ejecución), nodes, edges               │
│    - datos técnicos de generación                            │
│                                                               │
│  Sync bidireccional:                                         │
│    - CRM client.id ↔ AI Engine external_client_id            │
│    - CRM job.id ↔ AI Engine external_job_id                  │
│    - CRM asset.id ↔ AI Engine output_id                      │
└──────────────────────────────────────────────────────────────┘
```

**Cambios necesarios:**
- CRM: campos external_client_id, external_job_id en tablas
- AI Engine: campo external_id en jobs para referenciar CRM
- Sync service: escuchar cambios y propagar IDs

---

## 5. Implementación por Fases

### Sprint 0: Fundamentos (Semana 1)

| Task | Descripción | Archivos | Estado |
|------|-------------|----------|--------|
| 0.1 | Unificar auth (JWT compartido) | CRM: security.ts, AI: security.py | ⏳ |
| 0.2 | API Gateway proxy routes | CRM: src/api/routes/ai-proxy.ts | ⏳ |
| 0.3 | Webhook system interno | CRM: src/lib/webhooks.ts, AI: app/services/webhooks.py | ⏳ |

### Sprint 1: Web → CRM (Semana 2)

| Task | Descripción | Archivos | Estado |
|------|-------------|----------|--------|
| 1.1 | Web brief → CRM brief | Web: src/lib/api.ts, CRM: src/api/routes/briefs.ts | ⏳ |
| 1.2 | Stripe webhook → CRM cliente | CRM: src/api/routes/webhooks/stripe.ts | ⏳ |
| 1.3 | Onboarding completado → CRM | Web: src/pages/onboarding.astro, CRM: PATCH /clients/:id | ⏳ |

### Sprint 2: CRM → AI Engine (Semana 3)

| Task | Descripción | Archivos | Estado |
|------|-------------|----------|--------|
| 2.1 | CRM job creado → AI Engine job | CRM: POST /jobs, AI: POST /api/v1/jobs | ⏳ |
| 2.2 | AI Engine job completado → CRM | AI: webhook, CRM: PATCH /jobs/:id | ⏳ |
| 2.3 | AI Engine approval → CRM QA | AI: webhook approval.pending, CRM: notificaciones | ⏳ |

### Sprint 3: Portal → CRM (Semana 4)

| Task | Descripción | Archivos | Estado |
|------|-------------|----------|--------|
| 3.1 | Portal feedback → CRM job | Portal: POST /api/portal/jobs/:id/feedback | ⏳ |
| 3.2 | CRM asset aprobado → Portal | CRM: assets.approved = true, Portal: GET /assets | ⏳ |
| 3.3 | Notificaciones nuevo asset | CRM: webhook → Portal: push notification | ⏳ |

### Sprint 4: Seguimiento (Semana 5)

| Task | Descripción | Archivos | Estado |
|------|-------------|----------|--------|
| 4.1 | CRM review due → email/slack | CRM: src/lib/notifications.ts | ⏳ |
| 4.2 | Portal-hub estado real | Web: src/pages/portal-hub.astro, CRM: GET /clients/:id | ⏳ |
| 4.3 | Portal-hub → Web checkout | Web: checkout con pack pre-seleccionado | ⏳ |

---

## 6. Flujo Completo Ejemplo

### Ejemplo: Cliente nuevo de principio a fin

```
1. WEB: Visita / → lee Hero, Services
2. WEB: Va a /sesion-dataset → entiende primer paso
3. WEB: Completa /brief → describe proyecto
4. WEB: Checkout → compra pack Starter
5. STRIPE: webhook → CRM: crear cliente + job inicial
6. CRM: email bienvenida → cliente con enlace /onboarding
7. WEB: /onboarding → cliente completa checklist
8. WEB: onboarding completado → CRM: cliente.onboarding_complete = true
9. CRM: alertar account manager → "Cliente listo para sesión"
10. CRM: account manager agenda sesión → fecha en job.due_at
11. CRM: sesión completada → account manager llena campos:
    - stack_lane: B
    - nivel_benchmark: L2
    - unidades_previstas: 20
    - coste_ai_estimado: 45
    - margen_bruto_estimado: 0.72
12. CRM: "Activar benchmark" → AI Engine: POST /api/v1/jobs
    - pipeline: benchmark_L2
    - external_job_id: CRM job ID
13. AI Engine: ejecuta pipeline → 3 motores x 2 rounds
14. AI Engine: job.completed → CRM webhook
    - deliveryUrl: https://r2/...
    - outputs: [{motor: "nano-banana", score: 0.92}, ...]
15. CRM: account manager revisa → selecciona stack_ganador
16. CRM: job.status = "active" → listo para producción
17. MES SIGUIENTE:
    - WEB: cliente envía brief mensual
    - CRM: brief.status = "new"
    - CRM: admin "Crear job" → job.status = "pending"
    - CRM: job creado → AI Engine: POST /api/v1/jobs
        - pipeline: production_stack_B
        - external_job_id: CRM job ID
18. AI Engine: ejecuta pipeline → 20 unidades
19. AI Engine: approval.pending → CRM: notificar QA
20. CRM: QA revisa → aprueba
21. AI Engine: job.completed → CRM webhook
    - deliveryUrl: https://r2/...
    - units_consumed: 20
22. CRM: job.status = "delivered", assets[] = [...]
23. CRM: job.deliveryUrl → portal: assets aprobados
24. PORTAL: cliente ve /client/assets → descarga
25. PORTAL: cliente feedback → "Excelente, 5 estrellas"
26. CRM: job.feedback = [{rating: 5, comment: "..."}]
27. CRM: 25 días después → next_review_at se acerca
28. CRM: alerta account manager → "Review en 7 días"
29. CRM: account manager contacta cliente → renovación
30. WEB: cliente renovado → nuevo checkout
31. VOLVER AL PASO 5
```

---

## 7. Métricas de Éxito

| Métrica | Objetivo | Cómo medir |
|---------|----------|------------|
| Tiempo compra → primera entrega | < 7 días | CRM: job.created_at → job.delivered_at |
| % jobs con benchmark reutilizado | > 80% | CRM: COUNT(nivel_benchmark = "L0") / total |
| % jobs entregados a tiempo | > 95% | CRM: COUNT(due_at >= delivered_at) / total |
| Margen bruto medio | > 65% | CRM: AVG(margen_bruto_estimado) |
| Coste AI / ingreso | < 15% | CRM: SUM(coste_ai_estimado) / SUM(ingreso) |
| Feedback medio cliente | > 4.5/5 | CRM: AVG(job.feedback.rating) |
| Tasa de renovación | > 80% | CRM: COUNT(clientes renovados) / total |

---

## 8. Riesgos y Mitigación

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Auth unificada falla | Todos los sistemas caen | Mantener fallback a auth local en cada sistema |
| Webhooks no entregados | Sync perdido | Retry con exponential backoff + dead letter queue |
| AI Engine lento | Jobs retrasados | Queue prioritaria para urgentes + alertas |
| Database sync inconsistente | Datos divergentes | Reconciliación nightly + manual trigger |
| Stripe webhook falla | Clientes no creados | Fallback: admin crea manual desde Stripe dashboard |

---

## 9. Decisiones de Arquitectura

| Decisión | Opción elegida | Alternativa descartada | Razón |
|----------|----------------|------------------------|-------|
| Auth | JWT compartido | OAuth2 / Auth0 | Más simple, ya tenemos JWT en CRM |
| API Gateway | Proxy en CRM Worker | API Gateway separado | Menos complejidad, ya estamos en Cloudflare |
| Database | Sync manual de IDs | Database unificada | D1 + PostgreSQL tienen trade-offs distintos |
| Webhooks | Sistema interno | Message queue (Redis) | Más simple, Redis es infra extra |
| AI Engine | Servicio separado | Integrado en CRM | Aislamiento, escalabilidad independiente |

---

## 10. Archivos Clave a Crear/Modificar

### CRM (gordocrm/)

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `src/api/routes/ai-proxy.ts` | CREAR | Proxy routes a AI Engine |
| `src/api/routes/webhooks/stripe.ts` | CREAR | Stripe webhook handler |
| `src/api/routes/webhooks/ai-engine.ts` | CREAR | AI Engine webhook handler |
| `src/lib/webhooks.ts` | MODIFICAR | Añadir webhook sender interno |
| `src/lib/notifications.ts` | CREAR | Email/Slack notifications |
| `src/api/routes/portal/feedback.ts` | CREAR | POST /jobs/:id/feedback |

### AI Engine (ai-engine/)

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `app/services/webhooks.py` | CREAR | Webhook sender para jobs |
| `app/api/routes/crm-sync.py` | CREAR | Endpoints para CRM sync |
| `app/core/security.py` | MODIFICAR | Validar JWT desde CRM |

### Web (gordo/)

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `src/lib/api.ts` | CREAR | API client para CRM |
| `src/pages/brief.astro` | MODIFICAR | POST brief a CRM |
| `src/pages/onboarding.astro` | MODIFICAR | Notificar CRM al completar |
| `src/experiences/customer-journey/stable/PortalHubPage.astro` | MODIFICAR | Mostrar estado real desde CRM |

---

## 11. Conclusión

Este plan conecta los 4 sistemas (Web, CRM, Portal, AI Engine) en un flujo coherente de ida y vuelta.

**Principios clave:**
1. **Web para captación** → simple, enfocada en primer paso
2. **CRM para operación** → pipeline, margen, seguimiento
3. **Portal para cliente** → assets, feedback, historial
4. **AI Engine para producción** → pipelines, generación, QA

**Conexiones críticas:**
- Web → CRM: briefs, clientes, onboarding
- CRM → AI Engine: jobs, benchmarks, producción
- AI Engine → CRM: resultados, approvals, assets
- CRM → Portal: assets aprobados, notificaciones

**Próximo paso:** Empezar Sprint 0 (Fundamentos) con las 3 tasks de auth, proxy y webhooks.
