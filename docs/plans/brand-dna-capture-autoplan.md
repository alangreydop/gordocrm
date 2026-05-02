# Brand DNA Capture Autoplan

Captured: 2026-05-01
Branch: release/production-hardening
Base: main

## Problem

Brand assets currently prove that a client uploaded material. They do not extract brand DNA.

That makes the product weaker than the UI promises. The client uploads logo, palette,
typography, or a manual, but production still depends on a human filling
`clients.brand_graph` by hand in `/admin/brand-graphs`.

## Premises

1. Brand assets should become structured brand intelligence automatically.
2. Manual Brand Graph editing should stay as override and correction, not the primary path.
3. Capture must run inside the existing CRM Worker + D1 + R2 model.
4. No production deploy, no new external infra, no invented bindings.
5. The system should fail closed: if capture cannot run, assets remain stored and the admin sees why.

## Current State

| Area | Existing Code | What It Does | Gap |
| --- | --- | --- | --- |
| Upload | `src/api/routes/portal/upload.ts` | Stores files in R2 and rows in `assets` | No analysis step |
| Readiness | `src/lib/brand-assets-readiness.ts` | Checks minimum uploaded materials | Does not infer brand DNA |
| Manual graph | `src/api/routes/portal/brand-graphs.ts` | GET/PUT JSON in `clients.brand_graph` | Admin-only manual entry |
| Vector graph | `src/lib/brand-graph.ts` + `brand_graph_vectors` | Reads vectors and computes coverage | No writer exists |
| QA | `src/lib/qa-engine.ts` | Scores generated assets against `clients.brand_graph` | Depends on manual graph |
| Reasoning worker | `src/lib/reasoning-worker.ts` | Can inject `brand_graph_vectors` | Vectors are empty unless manually seeded elsewhere |

## Target State

Client uploads brand assets. The CRM stores them, queues or runs capture, extracts a structured
Brand Graph, writes vectors, computes coverage, and shows capture status in admin.

```text
Client upload
  -> R2 object + assets row
  -> brand_capture_runs row
  -> BrandCaptureService
      -> read relevant R2 assets
      -> extract structured JSON
      -> upsert clients.brand_graph
      -> replace/merge brand_graph_vectors source=asset_derived
      -> upsert brand_graph_coverage
      -> update dataset_status captured/trained boundary
  -> admin/client surfaces show status and failures
```

## Recommended Implementation

Build this as an internal service plus one admin endpoint, not as a new platform.

### Phase 1: Data Model

Add a migration and Drizzle schema for `brand_capture_runs`.

Fields:

| Field | Type | Purpose |
| --- | --- | --- |
| `id` | text pk | Run id |
| `client_id` | text fk | Client |
| `status` | text | `pending`, `processing`, `completed`, `failed`, `skipped` |
| `trigger` | text | `upload`, `admin`, `scheduled` |
| `asset_ids` | text | JSON array of asset ids included |
| `asset_hash` | text | Stable hash of asset ids, R2 keys, and update timestamps |
| `summary` | text | Human-readable result |
| `error` | text | Failure reason |
| `created_at` | timestamp_ms | Created |
| `started_at` | timestamp_ms nullable | Started |
| `completed_at` | timestamp_ms nullable | Completed |
| `updated_at` | timestamp_ms | Updated |

Indexes:

- `idx_brand_capture_runs_client_created`
- `idx_brand_capture_runs_status`
- `idx_brand_capture_runs_client_status`
- unique `idx_brand_capture_runs_client_hash` on `client_id, asset_hash`

No new table for extracted data is needed in v1 because the repo already has:

- `clients.brand_graph`
- `brand_graph_vectors`
- `brand_graph_coverage`

Also persist durable upload metadata in `assets.metadata` for brand assets:

```json
{
  "contentType": "image/png",
  "bucket": "BRANDS",
  "brandAssetType": "logo",
  "captureEligible": true
}
```

This is not optional. `assets.type` currently only represents `image | video`, so PDFs,
SVGs, and fonts cannot be handled safely from `assets.type`.

### Phase 2: Capture Service

Add `src/lib/brand-capture.ts`.

Responsibilities:

1. Load brand assets for a client from `assets` where `category = "assets"`.
2. Classify asset type from `r2Key` using existing readiness extraction logic.
3. Read only capture-relevant files from the bucket recorded in `assets.metadata.bucket`.
4. Build a compact input:
   - logo image or SVG text
   - palette document/image
   - typography/font evidence
   - identity manual if present
   - existing `clients.brand_graph` as prior context
5. Call one extractor adapter.
6. Validate with Zod.
7. Save outputs.

Extractor output schema:

```ts
{
  colorPalette: string[];
  typography: {
    primary?: string;
    secondary?: string;
    notes?: string;
  };
  emotionalTone?: string;
  lighting?: string;
  angles?: string;
  materials?: string;
  compositionRules?: string;
  doNotUse?: string;
  confidence: number;
  evidence: Array<{
    assetId: string;
    claim: string;
    confidence: number;
  }>;
}
```

### Phase 3: Extractor Adapter

Use the existing provider pattern, not a new dependency layer.

Preferred v1:

- Use `ANTHROPIC_API_KEY` because `qa-engine.ts` already uses Anthropic vision.
- Use `OPENAI_API_KEY` only if we decide to standardize extraction there later.
- If neither key exists, mark capture run `failed` with a clear error.

Important constraint:

PDF/font extraction in Workers is limited. V1 should support:

- Images: send to vision model.
- SVG/logo text: read as text if small.
- PDFs/fonts/manuals: include metadata and filename in v1, then add PDF text extraction later if needed.

This is less magical than pretending fonts and PDFs are solved. It ships value without lying.

Do not reuse the QA call path directly. Brand capture gets its own extractor adapter so
QA scoring and brand extraction can evolve independently while sharing the same secret.

### Phase 4: Triggers

Add two triggers:

1. Automatic after brand asset upload:
   - In `uploadRoutes.post("/brand-assets")`, after asset insert and readiness sync, call `scheduleBrandCapture`.
   - Default behavior: create or reuse a `pending` run. Do not call the model inside the upload request.
   - Only allow future inline capture for a tiny path behind hard caps: one SVG or one image under 1 MB.

2. Manual admin recapture:
   - `POST /api/portal/brand-graphs/clients/:id/capture`
   - Admin only.
   - Runs capture for that client and returns run summary.

Do not depend on cron for first release. Cron can retry pending/failed runs later.

`scheduleBrandCapture` must coalesce work:

- Compute `asset_hash`.
- If a `pending` or `processing` run already exists for the same `client_id, asset_hash`, return it.
- Do not create unbounded runs on repeated uploads or page refreshes.

### Phase 5: Persistence Rules

When capture succeeds:

1. Merge into `clients.brand_graph`.
   - V1 never overwrites a non-empty manual field by default.
   - Preserve admin-written `doNotUse` unless admin explicitly requests overwrite in the recapture endpoint.
   - Replace `colorPalette` only if extracted palette has at least 2 valid hex colors.
   - Keep existing fields when extraction is low-confidence.

2. Upsert vectors:
   - Replace previous `asset_derived` vectors only inside the same D1 transaction/batch as the replacement inserts.
   - Insert bounded rows for `color`, `typography`, `composition`, `lighting`, `style`, and optional `mood`.
   - Keep `manual` vectors untouched.
   - Cap each vector `value` to a short JSON payload so `reasoning-worker` context does not blow up.

3. Upsert coverage:
   - Export coverage calculation/writer helpers from `brand-graph.ts`.
   - Reflect the existing SQL unique `(client_id, dimension)` constraint in Drizzle schema.
   - Always refresh coverage after vector replacement. Stored coverage wins in `getBrandGraphContext`, so stale rows are dangerous.

4. Dataset status:
   - `pending_capture` -> `captured` means required files exist.
   - `captured` -> `trained` means Brand DNA vectors and coverage are QA-ready.
   - Never downgrade `trained`, `active`, or `archived`.
   - UI copy must distinguish "assets captured" from "ADN de marca capturado".

### Phase 6: UI Integration

Minimal UI, high leverage:

1. Admin client detail:
   - Show `brandReadiness`.
   - Show latest capture run status.
   - Add `Capturar ADN de marca` button.
   - Link to `/admin/brand-graphs`.

2. Admin Brand Graph editor:
   - Add "generated from assets" status.
   - Show evidence/confidence summary.
   - Keep manual save flow.

3. Client Brand Assets:
   - After upload, show "ADN de marca en análisis" when capture is running.
   - Do not expose model internals.
   - Use a dedicated brand-assets endpoint or adjust `/api/portal/assets` so uploaded brand assets are visible while `status = "pending"`.

## Architecture

```text
portal/src/pages/client/brand-assets.astro
        |
        v
src/api/routes/portal/upload.ts
        |
        +--> assets row + R2 object
        |
        +--> src/lib/brand-assets-readiness.ts
        |
        +--> src/lib/brand-capture.ts
                |
                +--> R2 BRANDS/ASSETS
                +--> Anthropic/OpenAI adapter
                +--> clients.brand_graph
                +--> brand_graph_vectors
                +--> brand_graph_coverage
                +--> brand_capture_runs

src/api/routes/portal/brand-graphs.ts
        |
        +--> manual GET/PUT
        +--> admin POST capture
```

## Error And Rescue Registry

| Failure | User Impact | Rescue |
| --- | --- | --- |
| No model key configured | Upload works, capture fails | Store failed run with exact missing secret |
| R2 read fails | Capture cannot inspect asset | Failed run names asset id and key |
| Unsupported file type | Partial capture | Skip file, continue with evidence summary |
| Model returns invalid JSON | No bad graph written | Retry once, then failed run |
| Low confidence extraction | Avoid bad automation | Write partial fields only, require admin review |
| Existing manual graph conflicts | Admin work overwritten | Merge conservatively, preserve manual fields |
| Capture runs twice | Duplicate or stale vectors | Coalesce by `client_id + asset_hash`, write vectors/coverage transactionally |
| Large files exceed Worker limits | Timeout | Mark pending/manual and cap inline processing |
| Wrong R2 bucket read | Capture fails or analyzes wrong object | Persist bucket in `assets.metadata` at upload |
| Stale coverage rows | Reasoning worker gets false readiness | Refresh coverage in the same write path as vectors |

## Test Plan

Unit tests:

- `extractBrandAssetType` handles current and legacy R2 keys.
- capture schema rejects malformed model output.
- merge logic preserves manual fields.
- vector writer replaces only `asset_derived` rows.
- dataset transition does not downgrade advanced statuses.
- asset metadata persists original content type, bucket, and brand asset type.
- capture run coalesces repeated schedules by `client_id + asset_hash`.
- malformed existing `clients.brand_graph` is handled without losing data.

Route tests:

- brand asset upload creates capture run when minimum inputs exist.
- admin recapture requires admin role.
- failed capture returns clear error and stores run.

Integration-level tests with fake R2/model:

- logo + palette + font -> `clients.brand_graph` + vectors + coverage.
- unsupported manual PDF -> partial capture, not total failure.
- existing manual graph + new extraction -> conservative merge.
- pending upload returns success even if capture cannot run.
- stale coverage rows are refreshed after vector replacement.
- wrong or missing bucket metadata fails with a clear run error.

Verification commands:

```bash
npm run typecheck
npm test
```

`npm run build` currently fails in this workspace because `dist/` has root-owned files.
Use `tsc --noEmit` for type verification until permissions are fixed.

## NOT In Scope For V1

- Full PDF parsing in Workers.
- Training LoRA models.
- New external queues or Durable Objects.
- Replacing the existing manual Brand Graph editor.
- Autonomously approving generated production assets from a low-confidence graph.

## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|----------------|-----------|-----------|----------|
| 1 | CEO | Build capture into existing CRM, not a separate service | Mechanical | Pragmatic | Existing upload, R2, D1, QA, and Brand Graph surfaces already exist | New microservice |
| 2 | CEO | Keep manual Brand Graph as override | Mechanical | Completeness | Automation needs correction path and auditability | Fully automatic only |
| 3 | Eng | Add `brand_capture_runs` | Mechanical | Explicit over clever | Need observable status and failures | Silent background side effects |
| 4 | Eng | Use existing `clients.brand_graph` and vector tables | Mechanical | DRY | Schema already has the destination data structures | New duplicate brand DNA table |
| 5 | Eng | Run inline v1 with caps, add pending run fallback | Taste | Pragmatic | Simpler than queues, but needs timeout guard | Full queue/DO worker now |
| 6 | Eng | Prefer Anthropic adapter first | Taste | DRY | QA already uses Anthropic vision | Introduce OpenAI-only path immediately |
| 7 | Design | Add minimal status UI instead of a new wizard | Mechanical | Explicit over clever | User needs truth: captured, failed, pending | Multi-step onboarding redesign |
| 8 | Eng | Default to pending/coalesced capture, not inline model calls | Mechanical | Completeness | Upload reliability beats synchronous magic | Inline capture in upload request |
| 9 | Eng | Persist bucket/contentType/brandAssetType in metadata | Mechanical | Explicit over clever | `assets.type` cannot represent PDFs/fonts/SVGs | Infer everything from filename |
| 10 | Eng | V1 never overwrites manual graph fields by default | Mechanical | User sovereignty | Current graph JSON has no field provenance | Automatic overwrite |

## CEO Review

Premise challenge:

- The real customer problem is not "store brand assets". It is "production should inherit the client's brand without Alan or an admin retyping it". Valid.
- A second premise is that uploaded files contain enough signal. Partly true. Logo and palette do; fonts and PDFs may not be readable in Workers v1.
- A third premise is that automatic capture should happen immediately. True for small image/SVG assets, risky for large PDFs.

What already exists:

- Upload, R2 storage, and asset rows already exist.
- Manual Brand Graph already exists.
- QA already consumes `clients.brand_graph`.
- Reasoning worker already consumes `brand_graph_vectors`.
- Coverage model already exists.

Dream state:

```text
CURRENT: uploads are a checklist
THIS PLAN: uploads produce Brand Graph + vectors with admin review
12-MONTH IDEAL: every generated asset, brief, QA decision, and creative plan is conditioned on live brand memory
```

Implementation alternatives:

| Approach | Effort | Risk | Pros | Cons | Decision |
| --- | --- | --- | --- | --- | --- |
| Inline capture in CRM Worker | Low | High | Looks instant | Can break uploads under Worker limits | Not V1 default |
| Pending run + admin/cron execution | Low | Low | Upload stays reliable, capture is observable | Less instant | V1 default |
| Queue/Durable Object capture worker | Medium | Low runtime risk | Better retries | More infra and config | Later |
| External AI Engine owns capture | Medium | Medium | Keeps AI work outside CRM | More coupling and auth | Not V1 |

Mode: selective expansion.

Scope expansions approved:

- Capture run table.
- Admin recapture endpoint.
- Conservative merge rules.
- Status UI.
- Asset metadata persistence.
- Coalesced capture run idempotency.
- Coverage writer helper.

Deferred:

- PDF text extraction.
- Durable queue.
- LoRA/model training.

## Design Review

UI scope: yes.

Score: 7/10.

The UI should not pretend "ADN captured" if the model failed or only extracted partial data. The admin needs a small operational panel, not a new product surface.

Required states:

- No brand assets.
- Assets uploaded, capture pending.
- Capture running.
- Capture completed with confidence.
- Capture failed with reason and retry button.
- Manual override present.

## Engineering Review

Architecture score: 8/10 if kept inside existing surfaces.

Critical implementation notes:

- Do not call the model before the R2 insert and DB asset row succeed.
- Do not overwrite manual Brand Graph fields blindly.
- Do not rely on `dataset_status` as capture truth. Use `brand_capture_runs` and coverage.
- Keep extractors behind an interface so tests can use a fake model.
- Do not run normal model capture inline in upload. Create a pending/coalesced run.
- Do not read R2 from `BRANDS || ASSETS` guessing. Persist and use bucket metadata.
- Do not delete old vectors without a transaction/batch replacement plan.

Dependency graph:

```text
upload route
  -> brand-assets-readiness
  -> brand-capture service
      -> capture repository
      -> R2 reader
      -> model adapter
      -> brand graph writer
      -> vector writer
      -> coverage writer
```

Test diagram:

```text
Upload complete assets
  -> schedule capture
  -> fake model response
  -> graph merge
  -> vectors write
  -> coverage update
  -> status returned

Admin recapture
  -> auth admin
  -> run capture
  -> latest run visible

Failure path
  -> model missing/invalid
  -> no graph write
  -> failed run
  -> UI error state
```

## DX Review

DX scope: yes, internal developer/operator API.

Score: 7/10.

Developer-facing requirements:

- Fake extractor for tests.
- One clear error type for capture failures.
- One command path for verification: `npm run typecheck && npm test`.
- No new secret required if Anthropic is already configured for QA.
- If using OpenAI later, document exact secret and fallback.

## Final Recommendation

Implement V1 in this order:

1. Migration + schema for `brand_capture_runs`.
2. Persist `contentType`, `bucket`, and `brandAssetType` in brand asset upload metadata.
3. Add `brand-capture.ts` with fake extractor tests first.
4. Add coverage/vector writer helpers with transactional replacement semantics.
5. Add Anthropic vision extractor adapter behind interface.
6. Add upload trigger that creates a pending/coalesced capture run.
7. Add admin recapture endpoint.
8. Add admin/client status UI.
9. Full tests, including failure and concurrency cases.

This turns brand assets from storage into operational brand memory without adding a new platform.

## Outside Voice Review Addendum

Autoplan dual voices flagged the same core risks:

| Risk | Consensus | Plan Change |
| --- | --- | --- |
| Inline capture can break uploads | Confirmed | Default to pending/coalesced runs |
| R2 bucket ambiguity | Confirmed | Persist bucket in metadata |
| Asset MIME/type ambiguity | Confirmed | Persist content type and brand asset type |
| Manual graph overwrite risk | Confirmed | V1 never overwrites non-empty manual fields by default |
| Coverage can go stale | Confirmed | Export writer helper and refresh coverage with vector writes |
| Concurrent recapture can corrupt vectors | Confirmed | Add idempotency and transaction/batch replacement |
