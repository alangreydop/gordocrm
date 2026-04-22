# Prompt de Continuación — Grande&Gordo CRM Portal
**Para:** Cualquier modelo de código (Kimi, Claude, GPT-4, etc.)
**Fecha:** 2026-04-22
**Estado:** Work-in-progress, TypeScript fixes pre-deploy

---

## CONTEXTO

Estás trabajando en **`/Users/alangreydop/gordocrm`** — un monorepo CRM + Portal para Grande&Gordo (producción visual con IA).

- **Frontend:** Astro static site en `portal/`, deploy en Cloudflare Pages
- **Backend:** Cloudflare Workers en `src/`, API REST con Hono + Drizzle ORM + D1
- **Framework:** Astro (NO cambiar)
- **Branch:** `main`
- **Objetivo inmediato:** Limpiar todos los errores TypeScript (`tsc --noEmit`), commitear, pushear, deploy.

---

## ESTADO ACTUAL (NO REPETIR LO YA HECHO)

Una sesión anterior aplicó fixes quirúrgicos en 4 archivos. **Estos cambios están en working tree pero NO commiteados.**

Archivos modificados en working tree:
```
M db/schema.ts
M src/api/routes/admin/invoices.ts
M src/api/routes/ai-proxy.ts
M src/types/index.ts
```

**NO tocar estos fixes salvo que estén causando nuevos errores.**

---

## ERRORES RESTANTES A FIXEAR

Corre `npx tsc --noEmit` en `/Users/alangreydop/gordocrm` y arregla exactamente estos errores:

### A. `src/api/routes/admin/invoices.ts:361`
```
Type 'number' is not assignable to type 'boolean | SQL<unknown> | Placeholder<string, any> | null | undefined'
```
**Causa:** `isRectificative: 0` en el `.insert(schema.invoices).values({...})`. La columna se define como `integer('is_rectificative', { mode: 'boolean' })`.
**Fix:** Cambiar `isRectificative: 0` → `isRectificative: false`.

### B. `src/api/routes/portal/brief-assistant.ts` (3 errores)
- **L99:** `db.insert(briefSubmissions).values(briefData)` donde `briefData: Partial<...>`. El insert requiere `email` como string no-opcional. **Fix:** Casteo explícito: `values(briefData as typeof briefSubmissions.$inferInsert)`.
- **L100:** `briefData = { id: inserted[0].id }` — `inserted[0]` puede ser undefined. **Fix:** `inserted[0]?.id`.
- **L118:** `response = STAGE_PROMPTS[currentStage as keyof typeof STAGE_PROMPTS]` — `currentStage` puede ser `'FINALIZING'` que no existe en `STAGE_PROMPTS`. **Fix:** `STAGE_PROMPTS[...] ?? ''`.

### C. `src/api/routes/portal/briefs.ts:201`
```
Argument of type 'string | null' is not assignable to parameter of type 'string'
```
**Causa:** `type: mapBriefTypeToJobType(brief.tipo)` devuelve `'image' | 'video' | null`.
**Fix:** `type: mapBriefTypeToJobType(brief.tipo) || 'image'`.

### D. `src/api/routes/portal/cron.ts` (3 errores)
- **L22:** `Property 'CRON_SECRET' does not exist on type 'AppBindings'`.
  **Fix:** Añadir `CRON_SECRET?: string` a `AppBindings` en `src/types/index.ts`.
- **L38, L42:** `Argument of type 'Date' / 'boolean' is not assignable to parameter of type 'SQLWrapper'`.
  **Fix:** Revisar el uso de Drizzle en ese archivo. Probablemente está pasando un `Date` o `boolean` directo a un método que espera `sql\`...\`` o una columna. Verificar la sintaxis de `.set()` o `.where()`.

### E. `src/api/routes/portal/jobs.ts` (3 errores)
- **L45, L46:** `Uint8Array` vs `ArrayBuffer` (mismo patrón que `ai-proxy.ts`). Buscar la función `base64Url` o similar y aceptar `ArrayBuffer | Uint8Array`.
- **L550:** `'error' is of type 'unknown'`. **Fix:** `if (error instanceof Error) ...` o cast `(error as Error).message`.

### F. `src/api/routes/webhooks/lead-won.ts:207`
```
Property 'PORTAL_URL' does not exist on type 'AppBindings'
```
**Fix:** Añadir `PORTAL_URL?: string` a `AppBindings` en `src/types/index.ts`.

### G. `src/lib/webhook-signature.ts:84`
```
'aByte' is possibly 'undefined'
'bByte' is possibly 'undefined'
```
**Fix:** Añadir bounds check antes de la comparación, o usar non-null assertion `aByte!` si la lógica garantiza existencia.

---

## PROTOCOLO DE TRABAJO

1. **Lee cada archivo** antes de editar. No asumas la estructura.
2. **Aplica fixes mínimos** — cambios de tipo, casts, o valores. No reescribas lógica.
3. **Verifica después de cada fix batch:** `npx tsc --noEmit`
4. **Cuando `tsc --noEmit` dé 0 errores:**
   ```bash
   cd /Users/alangreydop/gordocrm
   git add -A
   git commit -m "fix(ts): resolve all TypeScript errors pre-deploy"
   git push origin main
   ```
5. **Post-push:** El deploy a Cloudflare Pages debería ser automático si está configurado. Si no, deploy manual vía `wrangler`.

---

## CONSTRAINTS DUROS

- **NO cambiar de framework** (Astro obligatorio)
- **NO hacer breaking changes** en la API
- **NO eliminar `role="region"`, `aria-label`, etc.** que ya están en el portal
- **Build debe pasar siempre** — si algo rompe, revertir
- **Mínimo cambio posible** — esto es cleanup de tipos, no refactor

---

## COMANDOS DE REFERENCIA RÁPIDA

```bash
# Verificar errores
cd /Users/alangreydop/gordocrm && npx tsc --noEmit

# Build portal (debe pasar)
cd /Users/alangreydop/gordocrm/portal && npx astro build

# Estado de git
cd /Users/alangreydop/gordocrm && git status

# Diff de cambios actuales
cd /Users/alangreydop/gordocrm && git diff
```

---

## DEFINICIÓN DE "HECHO"

- [ ] `npx tsc --noEmit` retorna 0 errores
- [ ] `npx astro build` (en `portal/`) retorna 0 errores
- [ ] Cambios commiteados en `main`
- [ ] Cambios pusheados a `origin/main`
- [ ] Deploy confirmado (URL responde 200)

---

## CONTACTO / CONTEXTO ADICIONAL

Si necesitas entender decisiones de negocio o arquitectura previas, revisa:
- `HANDOFF-URGENT-2026-04-22.md` — Handoff del portal CRM (diseño + accessibility)
- `HANDOFF-URGENT-2026-04-22-TYPESCRIPT.md` — Este handoff (estado TS)
- `docs/technical/work_log.md` — Log histórico de decisiones técnicas
