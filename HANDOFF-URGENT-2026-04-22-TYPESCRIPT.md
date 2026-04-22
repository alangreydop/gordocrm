# Handoff Urgente — TypeScript Fixes Pre-Deploy
**Fecha:** 2026-04-22 10:35
**Branch:** `main`
**Estado:** 4 archivos fixeados, 14 errores TS restantes en 7 archivos
**Objetivo:** `tsc --noEmit` limpio → commit → push → deploy

---

## Qué se hizo en esta sesión

Se aplicaron fixes quirúrgicos para reducir errores TypeScript de ~25 a 14.

| Archivo | Fix aplicado |
|---------|-------------|
| `src/types/index.ts` | Añadido `aiEngineToken: string` a `AppVariables` (fix `ai-proxy.ts`) |
| `db/schema.ts` | Importado `foreignKey`; movido `originalInvoiceId` de `.references(() => invoices.id)` a constraint `foreignKey` en 3er argumento. Elimina referencia circular que causaba `TS7022` |
| `src/api/routes/ai-proxy.ts` | Middleware `return next()`; `base64Url(data: ArrayBuffer \| Uint8Array)` |
| `src/api/routes/admin/invoices.ts` | Importado `Database`; `AppContext['db']` → `Database`; `parseInt(parts[1] \|\| '0')`; `calculateInvoiceTotals` con tipo genérico explícito; `getIssuerData` con `exactOptionalPropertyTypes` fix |

---

## Errores restantes (bloquean deploy)

**Total: 14 errores en 7 archivos.**

### 1. `src/api/routes/admin/invoices.ts` (1 error)
- **L361**: `isRectificative: 0` → columna es `integer({ mode: 'boolean' })`. Cambiar a `false`.

### 2. `src/api/routes/portal/brief-assistant.ts` (3 errores)
- **L99**: `briefData` es `Partial<...>`, insert requiere `email` no-opcional. Cast a `$inferInsert` o construir objeto completo.
- **L100**: `inserted[0].id` → `inserted[0]?.id` (posiblemente undefined).
- **L118**: `STAGE_PROMPTS[currentStage]` puede ser `undefined` (key `FINALIZING` no existe). Usar `?? ''`.

### 3. `src/api/routes/portal/briefs.ts` (1 error)
- **L201**: `mapBriefTypeToJobType` devuelve `'image' \| 'video' \| null`. `jobs.type` requiere `string`. Añadir fallback: `\|\| 'image'`.

### 4. `src/api/routes/portal/cron.ts` (3 errores)
- **L22**: Falta `CRON_SECRET?: string` en `AppBindings` (`src/types/index.ts`).
- **L38, L42**: Uso incorrecto de Drizzle API. `Date` y `boolean` no son `SQLWrapper`. Revisar sintaxis de `.set()` / `.where()`.

### 5. `src/api/routes/portal/jobs.ts` (3 errores)
- **L45, L46**: `Uint8Array` vs `ArrayBuffer` (mismo patrón fixeado en `ai-proxy.ts`).
- **L550**: `error` es `unknown`. Cast a `Error` o usar `instanceof`.

### 6. `src/api/routes/webhooks/lead-won.ts` (1 error)
- **L207**: Falta `PORTAL_URL?: string` en `AppBindings` (`src/types/index.ts`).

### 7. `src/lib/webhook-signature.ts` (2 errores)
- **L84**: `aByte` / `bByte` posiblemente `undefined`. Añadir bounds check o non-null assertion.

---

## Cómo verificar progreso

```bash
cd /Users/alangreydop/gordocrm
npx tsc --noEmit          # Debe dar 0 errores
npx astro build           # Portal build (ya pasa, pero verificar)
```

## Una vez limpio

```bash
git add -A
git commit -m "fix(ts): resolve all TypeScript errors pre-deploy"
git push origin main
# Deploy manual o automático vía Cloudflare Pages
```

---

## Notas

- **Portal build pasa** (`npx astro build` en `portal/` → 35 pages OK).
- **No hay cambios en runtime testeados** — solo fixes de tipos.
- `db/schema.ts` cambió la definición de `originalInvoiceId` a constraint `foreignKey`. Esto es semánticamente equivalente, pero si hay migraciones pendientes que referencian la vieja sintaxis, revisar.
- Los archivos modificados en esta sesión NO están commiteados todavía.
