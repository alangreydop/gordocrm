# CRM System Improvement — Handoff

> **Session:** 2026-04-21 | **Branch:** worktree-lead-crm-integration | **Commit:** 589f5deb
> **Approved plan:** Full CRM interior fix + asset upload + orchestrator control

## ✅ Completed This Session

### 1. Critical Backend Fix
- **File:** `gordocrm/src/api/routes/portal/assets.ts:81`
- **Fix:** Changed `eq(schema.assets.jobId, schema.jobs.clientId)` to `inArray(schema.assets.jobId, jobIds)`
- **Impact:** Client assets page was returning empty because the join compared jobId (UUID) with clientId (different UUID space). Now correctly filters by the client's job IDs.
- **Also added:** `inArray` import from drizzle-orm.

### 2. Architecture Cleanup
- **Created:** `gordocrm/portal/src/lib/ui-helpers.ts` — extracted all CSS class generation functions from `api-client.ts`
- **Updated:** `gordocrm/portal/src/lib/api-client.ts` — removed `jobStatusClass`, `subscriptionClass`, `datasetStatusClass`, `stackLaneClass`, `qaStatusClass`, `turnaroundClass` and their label functions
- **Why:** `api-client.ts` mixed API calls, data formatting, and UI presentation (CSS class generators). This created tight coupling.
- **Next model:** Must update ALL pages that import these functions to import from `ui-helpers.ts`. See file list below.

### 3. Global CSS Fix
- **File:** `gordocrm/portal/src/styles/global.css`
- **Added:** `.crm-table tbody tr { border-top: 1px solid var(--crm-border); }` and `:last-child { border-bottom }`
- **Why:** Tables were using `divide-y divide-gray-200` for row borders. Now tables are self-contained and don't need Tailwind divide utilities.

### 4. Admin Jobs Page — Design System Fix (Example)
- **File:** `gordocrm/portal/src/pages/admin/jobs/index.astro`
- **Changed:**
  - Removed `divide-y divide-gray-200` from table and tbody
  - Removed `hover:bg-gray-50` from rows (handled by CSS)
  - Replaced `text-gray-500` with `text-crm-muted`
  - Replaced `text-gray-600` with `text-crm-text-secondary`
  - Replaced `text-sky-200` with `text-crm-accent`
  - Replaced `text-rose-200` with `text-crm-danger`
  - Replaced inline badge wrappers with bare `crm-badge-*` classes (removed `inline-flex rounded-full px-3 py-1 text-xs font-medium` since `.crm-badge` already defines those)
  - Updated import to use `../../../lib/ui-helpers` for CSS class functions
- **This page is the reference pattern** for how to fix all other pages.

## 📋 Remaining Tasks (in priority order)

### Task 33: Fix Admin Pages Design System
**Status:** Pending | **Files:**
- `admin/clients/index.astro` — 14 columns, raw Tailwind colors everywhere
- `admin/clients/detail.astro` — raw Tailwind colors
- `admin/kanban.astro` — hardcoded status dots (`bg-blue-500`, etc.), raw Tailwind
- `admin/briefs/index.astro` — raw Tailwind in badges
- `admin/index.astro` — chart bars use `bg-emerald-500`, `bg-sky-500`, etc.
- `admin/jobs/detail.astro` — needs design system + asset upload UI + AI trigger

**Pattern to apply:** Same as admin/jobs/index.astro:
1. Replace `divide-y divide-gray-200` → remove (CSS handles it)
2. Replace `hover:bg-gray-50` → remove
3. Replace `text-gray-500` → `text-crm-muted`
4. Replace `text-gray-600` → `text-crm-text-secondary`
5. Replace `text-gray-900` → `text-crm-text`
6. Replace `text-sky-*` → `text-crm-accent`
7. Replace `text-rose-*` / `text-red-*` → `text-crm-danger`
8. Replace `text-emerald-*` → `text-crm-success`
9. Replace `bg-blue-500`, `bg-yellow-500`, `bg-green-500` → use `crm-badge-info`, `crm-badge-warning`, `crm-badge-success`
10. Update imports to use `ui-helpers.ts` for CSS class functions

### Task 34: Fix Client Pages Design System
**Status:** Pending | **Files:**
- `client/index.astro` — static timeline, fabricated activity, inconsistent panels
- `client/hub.astro` — `bg-violet-600/20`, `text-violet-400`, raw Tailwind
- `client/jobs/index.astro` — `hover:bg-gray-50`, `text-gray-600`, `text-emerald-400`, `text-sky-200`, `bg-gray-700`, `bg-rose-500/20 text-rose-200`
- `client/jobs/detail.astro` — severe violations: `bg-sky-400/10 text-sky-100`, `bg-slate-600`, `text-slate-200`, `bg-zinc-700`, `bg-sky-900/20 text-sky-400`
- `client/assets.astro` — needs design system + asset upload UI
- `client/history.astro` — raw Tailwind
- `client/profile.astro` — raw Tailwind

### Task 35: Add Asset Upload UI
**Status:** Pending
- **Backend endpoint:** `POST /api/portal/jobs/:id/assets` (already exists in assets.ts)
- **Where:** Admin job detail + Client job detail
- **What:** Drag-and-drop or file picker, upload to R2 via backend
- **Styles:** `crm-form-section`, `crm-button-primary`, `crm-alert-*`

### Task 36: Add AI Engine Trigger + Orchestrator Status
**Status:** Pending
- **Backend endpoint:** `POST /api/portal/jobs/:id/execute-ai` (exists in jobs.ts)
- **AI Engine proxy:** `src/api/routes/ai-proxy.ts` — routes to `ai-engine.grandeandgordo.com`
- **Where:** Admin job detail
- **What:**
  1. "Ejecutar en motor IA" button → calls execute-ai endpoint
  2. Orchestrator status badge → calls AI Engine proxy for job pipeline state
  3. Control buttons (pause/resume/cancel) where supported
- **Styles:** `crm-button-accent`, `crm-badge-*`, `crm-alert-*`

### Task 37: Replace Static Data with Real Queries
**Status:** Pending
- **Client dashboard timeline:** Currently hardcoded 5 HTML steps. Replace with fetch to `/api/portal/client/activities` or similar.
- **Activity feed:** Currently fabricated from job statuses. Replace with real `clientActivities` data.
- **Note:** The `clientActivities` table exists in schema but the webhook receiver (`lead-won.ts`) may not populate it correctly. Check and fix if needed.

### Task 38: Simplify Admin Clients Table
**Status:** Pending
- **Current:** 14 columns with no hierarchy
- **Target:** ~7 columns: empresa, plan, estado, activos, capacidad, proxima revision, acciones
- **Full data:** Keep accessible via detail view

## 🔧 Technical Context for Next Model

### Import Updates Required
Every page that imports CSS class functions from `api-client` must be updated. Grep for these patterns in `<script>` blocks:

```bash
grep -r "jobStatusClass\|subscriptionClass\|datasetStatusClass\|stackLaneClass\|qaStatusClass\|turnaroundClass" gordocrm/portal/src/pages/
```

Change from:
```javascript
const { api, escapeHtml, jobStatusClass } = await import('../../lib/api-client');
```

To:
```javascript
const { api, escapeHtml } = await import('../../lib/api-client');
const { jobStatusClass } = await import('../../lib/ui-helpers');
```

### Design System Reference
**Colors (from `global.css`):**
- `--crm-text` — primary text (#1c1018)
- `--crm-text-secondary` — secondary text (#7a6068)
- `--crm-muted` — muted/tertiary text (#9a8a90)
- `--crm-accent` — accent (#C4165A)
- `--crm-border` — borders (#f0e4ea)
- `--crm-panel` — panel backgrounds (#ffffff)
- `--crm-panel-soft` — soft backgrounds (#f8f5fa)
- `--crm-surface-hover` — hover backgrounds (#f5f0f5)
- `--crm-success` — green (#10b981)
- `--crm-warning` — amber (#f59e0b)
- `--crm-danger` — red (#ef4444)
- `--crm-info` — blue (#3b82f6)

**Utility classes:**
- `crm-table` + `crm-table-wrap` — tables
- `crm-badge` + `crm-badge-success/warning/danger/info/accent/default` — badges
- `crm-panel` + `crm-panel-strong` + `crm-panel-soft` — cards/panels
- `crm-button` + `crm-button-primary/secondary/accent/cream` — buttons
- `crm-input` — form inputs
- `crm-alert` + `crm-alert-success/warning/danger/info` — alerts
- `crm-empty` — empty states
- `crm-page-header` — page headers
- `crm-metric-card` — metric cards
- `crm-kicker` — eyebrow text

### Tailwind to CSS Mapping
| Raw Tailwind | Design System Replacement |
|-------------|---------------------------|
| `divide-y divide-gray-200` | Remove (CSS handles it) |
| `hover:bg-gray-50` | Remove (`.crm-table tr:hover` handles it) |
| `text-gray-500` | `text-crm-muted` |
| `text-gray-600` | `text-crm-text-secondary` |
| `text-gray-900` | `text-crm-text` |
| `text-sky-200` / `text-sky-*` | `text-crm-accent` |
| `text-rose-200` / `text-red-*` | `text-crm-danger` |
| `text-emerald-400` | `text-crm-success` |
| `bg-blue-500` | `crm-badge-info` |
| `bg-yellow-500` | `crm-badge-warning` |
| `bg-green-500` / `bg-emerald-500` | `crm-badge-success` |
| `bg-violet-600/20` | `crm-panel-soft` or custom with `--crm-accent` opacity |
| `text-violet-400` | `text-crm-accent` |
| `bg-sky-400/10` | `crm-info-soft` |
| `text-sky-100` | `text-crm-info` |
| `bg-slate-600` | `crm-panel` or `--crm-sidebar-bg` |
| `text-slate-200` | `text-crm-text-secondary` |
| `bg-zinc-700` | `--crm-sidebar-bg` |
| `bg-sky-900/20` | `crm-info-soft` |
| `text-sky-400` | `text-crm-info` |
| `bg-rose-500/20` | `crm-danger-soft` |
| `text-rose-200` | `text-crm-danger` |
| `bg-gray-700` | `--crm-sidebar-bg` or `--crm-text` |

### Reusable Components (that exist but are unused)
- `src/components/DataTable.astro`
- `src/components/EmptyState.astro`
- `src/components/MetricCard.astro`
- `src/components/PageHeader.astro`
- `src/components/StatusBadge.astro`

These should be adopted instead of inline table/badge markup.

### Backend Endpoints (already exist, just need frontend exposure)
| Endpoint | Method | What it does |
|----------|--------|-------------|
| `/api/portal/jobs/:id/execute-ai` | POST | Triggers AI Engine execution for a job |
| `/api/portal/jobs/:id/assets` | POST | Uploads asset to R2 for a job |
| `/api/portal/jobs/:id/assets` | GET | Lists assets for a job |
| `/api/portal/ai/pipelines/:id` | GET | Gets pipeline status from AI Engine |
| `/api/portal/client/activities` | GET | Gets client activity feed |

## ⚠️ Gotchas

1. **Badge classes are self-contained.** `.crm-badge` already defines `display: inline-flex`, `border-radius: 999px`, `padding`, `font-size`, `font-weight`, `letter-spacing`. Don't wrap it in `inline-flex rounded-full px-3 py-1 text-xs font-medium`.
2. **Table borders are self-contained.** After the CSS fix, `.crm-table tbody tr` has `border-top`. Don't add `divide-y`.
3. **The orchestrator is separate.** It's at `orchestrator.grandeandgordo.com` / `ai-engine.grandeandgordo.com`. The CRM proxy is in `ai-proxy.ts`.
4. **Client activities may be empty.** The webhook receiver creates them, but existing clients won't have any. Add an empty state.
5. **Astro v4 + Tailwind v4.** The project uses `@import "tailwindcss"` in `global.css` (Tailwind v4 syntax).
6. **The portal is a separate Astro build inside `gordocrm/portal/`.** Run with `cd gordocrm/portal && npm run dev`.
7. **Backend is a Cloudflare Worker inside `gordocrm/src/server.ts`.** Run with `cd gordocrm && wrangler dev`.

## 🎯 Success Criteria for Next Session

When the next model finishes, verify:
- [ ] Client assets page loads real assets (backend fix already deployed)
- [ ] All pages use only `--crm-*` colors
- [ ] Reusable components adopted where appropriate
- [ ] Admin can trigger AI Engine execution
- [ ] Admin can upload assets
- [ ] Client dashboard shows real timeline/activity
- [ ] Client table has ≤7 columns
- [ ] Zero placeholder data visible

## 📝 Plan File Location
`/Users/alangreydop/.gstack/projects/alangreydop-gordo/crm-system-verification-plan.md`
