# Grande & Gordo CRM + Portal - Comprehensive Handoff Document
**Date:** 2026-04-07
**Version:** 4.0 (Ultraplan Complete + Facturación España)
**Project Status:** ✅ Core Infrastructure Stable | ✅ Phase 4 Complete | ✅ Facturación Completa

---

## 🎯 1. Project Vision & Strategic Posture
Grande & Gordo is an **Agentic Production Ecosystem**. The goal is to eliminate administrative friction and elevate the client experience to an "Elite Agency" level.

**Core Philosophy:**
- **Zero Friction:** El cliente debe sentirse guiado, no gestionado.
- **Agentic-First:** De formularios estáticos a conceptualización conversacional.
- **High Signal:** Toda comunicación (interna y externa) es directa, concisa y orientada a valor.
- **España-First:** Facturación con IVA/IRPF, transferencias bancarias, normativa española.

---

## 🛠️ 2. Technical Architecture

### Tech Stack
- **Backend:** Cloudflare Workers + Hono (TypeScript).
- **Database:** Cloudflare D1 (SQLite) with Drizzle ORM.
- **Frontend:** Astro (Static) + Vanilla JS/Tailwind CSS.
- **Email:** Resend API.
- **AI Engine:** External service at `ai-engine.grandeandgordo.com`.
- **Assets:** Cloudflare R2.
- **Pagos:** Transferencia bancaria + factura (NO Stripe).

### Domain & Infrastructure
- **Domain:** `crm.grandeandgordo.com`
- **Deployment:** Wrangler (Cloudflare).

---

## 🚀 3. Implementation Progress (Ultraplan + Superpowers)

### Phase 1-3: Foundation & Communication ✅
- **Onboarding:** Welcome Modal first-time users, Dynamic Breadcrumbs.
- **Transparency:** Progress bars for jobs, Asset counters in jobs list.
- **Proactive Comms:** In-app notifications, Team Messages parsing, Quarterly Review automated emails via Cron.
- **Asset Experience:** Full-screen Lightbox, Asset-specific feedback loop.

### Phase 4: The Polish (Zero Friction) ✅
- **Keyboard Shortcuts:** `Cmd/Ctrl + [J, D, A, P, H]` + `/` for search.
- **Bulk Download:** `JSZip` for one-click download of approved assets.
- **Mobile Responsive:** Sidebar optimized for smartphones.
- **Psychological UX:** Rich "Empty States" with CTAs.

### AI Briefing Assistant (Production) ✅
- **Conversational Interface:** Chat UI at `/client/brief-assistant`.
- **State Machine:** Extracts *Objective → Hook → Style → Audience → CTA*.
- **DB Integration:** Auto-saves to `brief_submissions` with full chat history.
- **Optimized Brief:** JSON output ready for AI Engine.

### The Vault - Semantic Asset Library ✅
- **Route:** `/client/vault`
- **Features:**
  - Search by description, tags, visual style, emotional tone
  - Filter by type, style, tone
  - Video hover-preview (auto-play)
  - Approved assets only, client-visible toggle
- **Schema:** `description`, `tags`, `embedding`, `dominantColors`, `visualStyle`, `emotionalTone`, `clientVisible`

### Operational Kanban - Production Tracking ✅
- **Route:** `/admin/kanban`
- **Features:**
  - 5 columns: Pending, En Progreso, Review, Entregados, Completados
  - Move jobs with ← → buttons
  - Real-time stats, auto-refresh 30s
- **API:** `/api/admin/kanban/*`

### Sistema de Facturación España ✅
- **Routes:** `/api/admin/invoices/*`, `/api/portal/invoices/*`
- **Features:**
  - **Admin:**
    - CRUD completo de facturas
    - Generación automática de número (F2026-001, F2026-002...)
    - Cálculo de importes (subtotal, IVA 21%, IRPF si aplica, total)
    - Estados: draft → issued → sent → paid / cancelled
    - Envío por email con HTML profesional
    - Generación de PDF (SVG base64, expandible con @react-pdf/renderer)
    - Auditoría completa con `invoice_logs`
  - **Cliente:**
    - Ver todas sus facturas
    - Detalle completo con líneas
    - Subir justificante de transferencia
    - Datos bancarios para transferencia
  - **Webhook:** `/api/portal/webhooks/invoice/paid` → trigger producción automática

---

## 📁 4. Key File Map

| Component | Path | Purpose |
| :--- | :--- | :--- |
| **Main Server** | `src/server.ts` | API routing + Cron handlers |
| **DB Schema** | `db/schema.ts` | Single source of truth |
| **AI Assistant** | `src/api/routes/portal/brief-assistant.ts` | Conversational briefing + DB save |
| **The Vault** | `src/api/routes/portal/vault.ts` | Semantic asset library API |
| **Kanban** | `src/api/routes/admin/kanban.ts` | Production tracking API |
| **Invoices Admin** | `src/api/routes/admin/invoices.ts` | Facturación completa admin |
| **Invoices Client** | `src/api/routes/portal/invoices.ts` | Portal cliente facturas |
| **Webhooks** | `src/api/routes/portal/webhooks.ts` | Invoice paid + AI Engine hooks |
| **Vault UI** | `portal/src/pages/client/vault.astro` | Semantic asset library UI |
| **Kanban UI** | `portal/src/pages/admin/kanban.astro` | Production kanban board |
| **Brief Assistant UI** | `portal/src/pages/client/brief-assistant.astro` | Conversational briefing UI |
| **Invoices Client UI** | `portal/src/pages/client/invoices/` | Portal facturas cliente |
| **Invoices Admin UI** | `portal/src/pages/admin/invoices.astro` | Gestión completa facturas |

---

## 🗄️ 5. Database Schema Changes

### `brief_submissions` (Enhanced)
- `objective`, `hook`, `style`, `audience`, `cta` (text)
- `optimizedBrief` (JSON string)
- `chatHistory` (JSON string)
- `status` includes `'in_progress'`

### `assets` (The Vault)
- `description`, `tags`, `embedding`, `dominantColors`, `visualStyle`, `emotionalTone`, `clientVisible`
- Indexes: `idx_assets_status`, `idx_assets_client_visible`, `idx_assets_created_at`

### `invoices` (Existing - Enhanced Usage)
- Full Spanish invoicing: IVA 21%, IRPF optional, series F2026-XXX
- Status flow: `draft` → `issued` → `sent` → `paid` | `cancelled`
- Payment methods: `Transferencia bancaria`, `Tarjeta`, `Efectivo`

### `invoice_items` (Existing)
- Line items with quantity, unitPrice, tax calculations

### `invoice_logs` (Existing)
- Audit trail for all invoice actions

---

## ⚠️ 6. Known Issues & Technical Debt

### TypeScript Errors (Pre-existing)
- `src/api/routes/portal/jobs.ts`: References non-existent fields `qaStatus`, `qaNotes`, `startedAt`. Need schema updates.
- These are legacy issues unrelated to new features.

### PDF Generation
- Current implementation uses SVG base64 placeholder
- Production: integrate @react-pdf/renderer or similar for proper PDF generation
- Email HTML is fully functional

### Invoice Config
- Requires issuer data in `config` table:
  - `issuer_tax_id`, `issuer_legal_name`, `issuer_address_line1`
  - `issuer_city`, `issuer_postal_code`, `issuer_email`

---

## 🏁 7. Next Steps (Growth Engine)

### Immediate (Week 1)
1. **AI Engine Connection:** Wire brief assistant to real LLM
2. **Embedding Pipeline:** Generate embeddings for Vault assets
3. **Configurar datos fiscales:** Populate `config` table with company data
4. **PDF Real:** Integrate @react-pdf/renderer for proper PDF generation

### Short-term (Month 1)
5. **Admin Dashboard:** High-level metrics (revenue, units, client health)
6. **Email Templates:** Branded HTML for all transactional emails
7. **Recordatorios automáticos:** Cron para facturas vencidas

### Medium-term (Quarter 1)
8. **AI Auto-Generation:** One-click variations from approved assets
9. **Team Collaboration:** Internal comments, version history
10. **Analytics Dashboard:** Client-facing metrics (views, engagement, ROI)

---

## 🔐 8. Environment Variables Required

```bash
# Required
DB=<D1 database binding>
AI_ENGINE_WEBHOOK_URL=<AI Engine webhook URL>
RESEND_API_KEY=<Resend API key>
EMAIL_FROM=<facturacion@grandeandgordo.com>

# Optional
CORS_ORIGIN=<Allowed CORS origin>
SESSION_SECRET=<Session signing secret>
FRONTEND_URL=<Frontend URL for redirects>
```

---

## 📊 9. API Endpoints Summary

### Invoices - Admin
| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/api/admin/invoices` | Admin | List all invoices |
| GET | `/api/admin/invoices/:id` | Admin | Invoice detail + items + logs |
| POST | `/api/admin/invoices` | Admin | Create invoice |
| POST | `/api/admin/invoices/:id/items` | Admin | Add items (draft only) |
| POST | `/api/admin/invoices/:id/issue` | Admin | Emit factura |
| POST | `/api/admin/invoices/:id/send` | Admin | Send email |
| POST | `/api/admin/invoices/:id/pay` | Admin | Mark as paid |
| POST | `/api/admin/invoices/:id/cancel` | Admin | Cancel invoice |
| GET | `/api/admin/invoices/:id/pdf` | Admin | Generate PDF (base64) |

### Invoices - Client
| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/api/portal/invoices` | User | List client's invoices |
| GET | `/api/portal/invoices/:id` | User | Invoice detail |
| POST | `/api/portal/invoices/:id/payment-proof` | User | Upload payment proof |

### Webhooks
| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/api/portal/webhooks/invoice/paid` | HMAC | Payment confirmed → trigger production |
| POST | `/api/portal/webhooks/ai-engine` | HMAC | AI Engine events |

---

## 💶 10. Facturas - Flujo Completo

### Admin crea factura:
1. Admin → `/admin/invoices` → "+ Nueva factura"
2. Selecciona cliente, añade conceptos
3. Guarda como `draft`
4. Emite (`issued`) → genera número F2026-XXX
5. Envía por email (`sent`)

### Cliente paga:
1. Cliente → `/client/invoices` → Ver facturas
2. Click en factura → Ver detalle
3. Realiza transferencia bancaria
4. Sube justificante (URL + nota)
5. Admin recibe notificación

### Admin confirma pago:
1. Admin verifica transferencia
2. Marca factura como `paid`
3. Sistema dispara webhook → AI Engine
4. Jobs asociados → `pending` (producción inicia)

---

**Handoff Complete.** Ultraplan + Superpowers + Facturación España implementados.
