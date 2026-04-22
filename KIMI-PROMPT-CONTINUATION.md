# Prompt para Kimi — Continuación: Grande&Gordo CRM Portal Remediation

## PROYECTO

**Nombre:** Grande&Gordo (G&G) — Plataforma CRM + Portal para clientes
**Repositorio:** `/Users/alangreydop/gordocrm` (monorepo)
  - `portal/` — Portal CRM (Astro static site, Cloudflare Pages)
  - `gordo/` — Web principal del cliente
  - `src/` — Backend Cloudflare Workers (API)
**Framework:** Astro (OBLIGATORIO, no cambiar)
**Deploy:** Cloudflare Pages
**Branch:** `main`

---

## CONTEXTO DEL NEGOCIO

G&G es una plataforma CRM para gestión de producción fotográfica/video. El portal permite clientes ver sus trabajos, assets, invoices, y沟通 con el equipo. El admin es para el equipo interno gestionar clients, jobs, invoices, pipeline.

**Design System (OBLIGATORIO seguir):**
- Background: `#f7f0f3` (warm pinkish-mauve)
- Surface: `#fff8fb`
- Dark (sidebar): `#0b0608`
- Accent: `#c4165a` (crimson/magenta)
- Accent Bright: `#f5709a`
- Text: `#1a1015` (primary), `#6e5a63` (muted)
- Typography: **Satoshi Variable** (body), **Libre Baskerville Italic** (eyebrows)
- NO emojis, NO pure gray, lowercase sentence case

---

## LO QUE YA SE HIZO (Completado)

### Commit `6ee124b` — `fix(crm): full portal accessibility + on-brand redesign`
Este commit hizo un rewrite masivo de 47+ archivos del portal CRM:

1. **Accessibility:** `role="region" + aria-label="Contenido principal"` en TODAS las páginas (35 .astro pages)
2. **Accessibility:** `aria-labelledby="page-title"` en todos los page headers
3. **Accessibility:** `role="alert"` en errores, `role="status"` en métricas
4. **Shared modules:** Todos los imports ahora usan `crm-ui.ts` (initSidebar, setText, isDueSoon, openModal, closeModal, initModal, startPolling, filterRows, renderEmpty, renderError, announceToSR)
5. **Forms:** `novalidate` en todos los forms
6. **Design tokens:** `--crm-bg` → `#f7f0f3`, `--crm-sidebar-bg` → `#0b0608`, radius tokens añadidos
7. **Bug fix:** `asset.qaStatus` → `asset.status` en assets.astro
8. **5 nuevos casos de éxito** añadidos al sitio principal
9. **Legal docs:** Términos + Privacy con GDPR/ARCO-PD

### Commit `f75618a` — `fix(crm): restore clients/index.astro with surgical a11y edits`
Fix de build break. El rewrite completo de `admin/clients/index.astro` rompía el build de Astro (esbuild parse error). Se aplicaron los cambios de accessibility de forma quirúrgica con sed en el archivo original que sí compilaba.

### Archivos Clave Modificados (6ee124b):
- `portal/src/layouts/AdminLayout.astro` — Sidebar on-brand, logo rosa, fondo blanco
- `portal/src/layouts/ClientLayout.astro` — Rediseño completo on-brand
- `portal/src/layouts/BaseLayout.astro` — Minimal changes
- `portal/src/lib/crm-ui.ts` — NUEVO, utilities compartidas
- `portal/src/lib/ui-helpers.ts` — NUEVO, UI helpers
- `portal/src/components/Alert.astro` — NUEVO
- `portal/src/components/DataTable.astro` — NUEVO
- `portal/src/components/EmptyState.astro` — NUEVO
- `portal/src/components/FormInput.astro` — NUEVO
- `portal/src/components/MetricCard.astro` — NUEVO
- `portal/src/components/PageHeader.astro` — NUEVO
- `portal/src/components/StatusBadge.astro` — NUEVO
- `portal/src/styles/global.css` — Design tokens actualizados
- ~47 archivos .astro en portal/

### Archivos Modificados (f75618a):
- `portal/src/pages/admin/clients/index.astro` — Restore + surgical a11y edits

---

## LO QUE QUEDA POR HACER (Pending Tasks)

### P1: `/normalize` — Fix performance anti-patterns
- Revisar las 35 pages del portal por anti-patterns de performance
- Check: N+1 queries, layout thrashing, expensive animations, missing lazy loading
- Verificar bundle size (budget: <300kb JS para app page)

### P1: `/critique` — Fix brand voice inconsistencies
- Revisar todo el copy del portal por inconsistencias de brand voice
- Reglas: lowercase sentence case, Spanish-first, no corporate speak
- Especificidad sobre vaguedad ("312 piezas" no "lots of content")
- No "soluciones", "sinergias", "ecosistemas"

### P2: `/harden` — Add error boundaries and safety nets
- Error boundaries para el portal
- Try/catch en todos los data fetching
- Fallback UI si la API falla
- Toast notifications para acciones

### P2: `/polish` — Final visual polish pass
- Último pulido visual
- Hover/focus/active states en todos los componentes interactivos
- Check contrast ratios (WCAG AA)
- Responsive en todos los breakpoints

---

## ESTRUCTURA ACTUAL DEL PORTAL

```
portal/
├── src/
│   ├── layouts/
│   │   ├── AdminLayout.astro    (sidebar + dark bg, equipo interno)
│   │   ├── ClientLayout.astro   (portal cliente, light bg)
│   │   └── BaseLayout.astro     (layout base)
│   ├── components/
│   │   ├── Alert.astro
│   │   ├── DataTable.astro
│   │   ├── EmptyState.astro
│   │   ├── FormInput.astro
│   │   ├── MetricCard.astro
│   │   ├── PageHeader.astro
│   │   └── StatusBadge.astro
│   ├── lib/
│   │   ├── api-client.ts        (API fetch wrapper)
│   │   ├── crm-ui.ts            (shared utilities)
│   │   ├── session.ts
│   │   ├── site-links.ts
│   │   └── ui-helpers.ts
│   └── pages/
│       ├── admin/
│       │   ├── index.astro      (dashboard admin)
│       │   ├── clients/         (list + detail + new)
│       │   ├── jobs/            (list + detail + new)
│       │   ├── invoices/        (list + detail + new)
│       │   ├── briefs/
│       │   ├── kanban.astro
│       │   ├── brand-graphs.astro
│       │   ├── pipeline-mappings.astro
│       │   └── settings.astro
│       ├── client/
│       │   ├── index.astro      (dashboard cliente)
│       │   ├── jobs/            (list + detail)
│       │   ├── assets.astro
│       │   ├── cases.astro
│       │   ├── cases/conservas-lalin.astro
│       │   ├── vault.astro
│       │   ├── brief-assistant.astro
│       │   ├── profile.astro
│       │   ├── pricing.astro
│       │   ├── onboarding.astro
│       │   ├── faq.astro
│       │   ├── history.astro
│       │   ├── hub.astro
│       │   ├── invoices/        (list + detail)
│       │   └── legal/           (terms + privacy)
│       ├── login.astro
│       └── index.astro
├── public/
├── src/styles/global.css        (design tokens)
└── wrangler.toml
```

---

## PRIMERAS ACCIONES PARA KIMI

### 1. Verificar Build
```bash
cd /Users/alangreydop/gordocrm/portal && npx astro build
```
El build debe pasar. Último commit `f75618a` ya tiene el fix.

### 2. Revisar Estado Actual
```bash
cd /Users/alangreydop/gordocrm && git log --oneline -10
cd /Users/alangreydop/gordocrm/portal && find src/pages -name '*.astro' | wc -l
```

### 3. Empezar por P1 Tasks
Prioridad: `/normalize` (performance) → `/critique` (brand voice)

### 4. Working Directory
Todo el trabajo va en `/Users/alangreydop/gordocrm`. NO tocar `/Users/alangreydop/gordo_new` (ese es la web principal del cliente, no el portal CRM).

---

## CONSTRAINTS DUROS

1. **Astro framework OBLIGATORIO** — No cambiar a React, Next.js, etc.
2. **Cloudflare Pages** — Este es el deploy target
3. **No breaking changes** — Todo debe ser backward compatible
4. **Build debe pasar SIEMPRE** — Si algo rompe el build, revertir inmediatamente
5. **Design tokens existentes** — Usar `--crm-*` variables, no hardcodear colores
6. **Accessibility ya implementada** — No remover `role="region"`, `aria-label`, etc. que ya están
7. **Portal es de solo lectura** — El portal es static, no hay SSR data loading

---

## ROLLBACK

Si algo falla post-deploy:
```bash
cd /Users/alangreydop/gordocrm
git revert 6ee124b --no-commit   # Revert sin commit
# O si ya fue push:
git revert 6ee124b   # Crear revert commit
```

Commit seguro anterior: `3f3ed63` (fix(qa): add missing LibreBaskerville italic font)

---

## ARCHIVOS DE REFERENCIA

- `HANDOFF-URGENT-2026-04-22.md` — Handoff detallado con tabla de cambios
- `HANDOFF_REVIEW_ABRIL_2026.md` — Handoff anterior de revisión de abril
- `docs/technical/handoff-2026-04-21-crm-deploy.md` — Handoff previo de deploy
- `docs/technical/work_log.md` — Log de trabajo técnico

---

## RESUMEN EJECUTIVO

**Estado actual:** Portal CRM con 35+ páginas, todas con accessibility básica (role="region", aria-label), shared utilities importadas, design tokens on-brand. Build pasa en `f75618a`.

**Lo que sigue:** Performance audit (/normalize), brand voice audit (/critique), error boundaries (/harden), visual polish (/polish).

**Prioridad:** `/normalize` → `/critique` → `/harden` → `/polish`

**Deploy:** Cloudflare Pages, desde `main`.
