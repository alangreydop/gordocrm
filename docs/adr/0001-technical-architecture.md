# ADR-0001: Technical Architecture & Stack

**Status:** Accepted  
**Date:** 2026-04-01  
**Context:** Informed by [GRA-2](/GRA/issues/GRA-2) (product scope) and [GRA-3](/GRA/issues/GRA-3) (dev environment)

---

## Context

Grande&Gordo is an AI content production system for mid-market ecommerce brands. One studio session trains a proprietary Flux LoRA per product; subsequent asset generation is a software operation. The full v1 pipeline is already built — this ADR documents the foundational decisions for review and onboarding.

---

## 1. System Architecture

```
Client Brief (WhatsApp / Email / Slack)
          │
          ▼
  ┌───────────────┐
  │  Brief Worker  │  Parses incoming brief; validates client; creates Airtable record
  └───────┬───────┘
          │  enqueue: checkout.create
          ▼
  ┌───────────────┐
  │  Stripe Worker │  Creates or retrieves checkout session; sends payment link via email
  └───────┬───────┘
          │  webhook: checkout.session.completed
          ▼
  ┌────────────────┐
  │  LoRA Worker   │  Submits training job to fal.ai; polls until done; stores model ref in Airtable
  └───────┬────────┘
          │  enqueue: generation.run
          ▼
  ┌──────────────────────┐
  │  Generation Worker   │  Runs Flux image + Kling video generation on fal.ai
  └───────┬──────────────┘
          │  enqueue: qa.check
          ▼
  ┌──────────────────┐
  │     QA Worker    │  GPT-4V reviews each asset against brief; approves or rejects
  └───────┬──────────┘
          │  enqueue: delivery.send  (approved assets only)
          ▼
  ┌──────────────────┐
  │  Delivery Worker │  Uploads to Cloudflare R2; generates signed URLs; sends email via Resend
  └──────────────────┘
```

Each worker is a BullMQ processor. Workers are stateless and horizontally scalable. Redis holds all queue state; Airtable is the record of truth for client and job metadata.

---

## 2. API Design — REST

**Decision:** REST over Fastify. No GraphQL, no tRPC for v1.

**Rationale:**
- The surface area is small: inbound webhooks (Stripe) + a handful of internal admin endpoints.
- No client-facing portal in v1, so there is no complex query/subscription use case that would motivate GraphQL.
- Fastify's built-in schema validation (JSON Schema) covers all input validation needs.

**Key routes:**

| Method | Path                        | Purpose                                      |
|--------|-----------------------------|----------------------------------------------|
| GET    | `/health`                   | Liveness check                               |
| POST   | `/webhooks/stripe`          | Stripe event ingress (signature-verified)    |
| POST   | `/api/briefs`               | Internal: submit a parsed brief              |
| GET    | `/api/jobs/:jobId`          | Internal: check pipeline job status          |
| POST   | `/api/jobs/:jobId/retry`    | Internal: manually retry a failed job        |
| GET    | `/api/clients/:clientId`    | Internal: fetch Airtable client record       |

All `/api/*` routes are protected by API key (see Auth section).

---

## 3. Database / Persistence

| Concern                       | Store              | Why                                                         |
|-------------------------------|--------------------|-------------------------------------------------------------|
| Client & job metadata         | **Airtable**       | Already in use; non-engineers can query/edit; no migration overhead |
| LoRA model references         | **Airtable**       | Same base; linked to client record                          |
| Job queue state               | **Redis** (BullMQ) | Native BullMQ requirement; ephemeral; fast                  |
| Generated assets (blobs)      | **Cloudflare R2**  | S3-compatible; no egress fees; CDN-friendly                 |
| Signed delivery URLs          | Generated on demand from R2; not persisted                  |

**No traditional relational database in v1.** Airtable satisfies all structured-data needs at current scale. If client volume outgrows Airtable API rate limits, the migration path is to PostgreSQL with the same field schema.

**Airtable schema sketch (primary tables):**

| Table       | Key fields                                                                                          |
|-------------|-----------------------------------------------------------------------------------------------------|
| `Clients`   | `id`, `name`, `email`, `stripe_customer_id`, `subscription_status`, `created_at`                  |
| `Jobs`      | `id`, `client_id` (link), `status` (enum), `brief_text`, `lora_model_id`, `asset_count`, `delivered_at` |
| `Assets`    | `id`, `job_id` (link), `type` (image/video), `r2_key`, `qa_status`, `qa_notes`                    |

---

## 4. Auth Strategy

| Surface                  | Mechanism                                                              |
|--------------------------|------------------------------------------------------------------------|
| Stripe webhooks          | `stripe-signature` header verified with `STRIPE_WEBHOOK_SECRET`       |
| fal.ai callbacks         | Signed callback payload verified with `FAL_KEY`                       |
| Internal `/api/*` routes | Static API key in `Authorization: Bearer <token>` — key in env        |
| No end-user auth in v1   | No client portal → no session management, no OAuth, no JWTs needed   |

The internal API key is rotated manually. If an admin UI is added in v2, migrate to short-lived JWTs.

---

## 5. Hosting & Deployment

| Component     | Target                         | Notes                                               |
|---------------|--------------------------------|-----------------------------------------------------|
| Node.js server + workers | **Render** (single service, web + background workers) | Simple deploy from `main`; managed TLS; auto-sleep off for workers |
| Redis         | **Upstash** (managed Redis)    | Serverless pricing; no ops overhead; BullMQ compatible |
| Assets        | **Cloudflare R2**              | Already decided; no egress fees                    |
| CI/CD         | **GitHub Actions**             | Already configured (typecheck → lint → test)       |
| Secrets       | Render environment variables   | Mirrors `.env.example`                             |

**Deployment flow:** push to `main` → GitHub Actions CI passes → Render auto-deploys. No staging environment for v1 (low team size; manual QA sufficient pre-launch).

---

## 6. Key Third-Party Integrations

| Service         | Purpose                              | SDK / approach                  |
|-----------------|--------------------------------------|---------------------------------|
| **Stripe**      | Subscription checkout + webhooks     | `stripe` npm package            |
| **fal.ai**      | Flux LoRA training + image/video gen | `@fal-ai/client` npm package    |
| **OpenAI**      | GPT-4V automated asset QA           | `openai` npm package            |
| **Cloudflare R2** | Blob storage + signed URL delivery | `@aws-sdk/client-s3` (S3-compat)|
| **Airtable**    | Client & job record of truth        | `airtable` npm package          |
| **Resend**      | Transactional email (delivery + onboarding) | `resend` npm package       |

---

## Consequences

- **Airtable as primary DB** is fast to operate but has API rate limits (5 req/s per base). Acceptable for v1 volume. Monitor and migrate if needed.
- **No client portal** means all delivery is email-based. This is a deliberate v1 constraint per [GRA-2](/GRA/issues/GRA-2).
- **Render for hosting** means cold starts are possible if the service is set to auto-sleep; disable auto-sleep for worker processes.
- This ADR unblocks [GRA-5](/GRA/issues/GRA-5) — MVP feature implementation.
