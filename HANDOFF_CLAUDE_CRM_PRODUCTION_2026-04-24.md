# Handoff Para Claude - CRM Production Readiness

Fecha: 2026-04-24  
Repo: `/Users/alangreydop/gordocrm`  
Branch: `release/production-hardening`  
Commit desplegado: `e54da4c` - `fix: harden crm admin and invoicing for production`  
Worker producción: `gordocrm-api-production`  
Deploy version: `16394521-5d1a-4306-9a1b-db60e043ea31`

## Estado Actual

El CRM quedó commiteado, pusheado y desplegado en producción desde la rama `release/production-hardening`.

El worktree estaba limpio al finalizar. El push se hizo a:

```bash
origin/release/production-hardening
```

## Cambios Principales

### Facturación

Se sustituyó el placeholder anterior de PDF por generación real con `pdf-lib`.

Archivo nuevo:

```text
/Users/alangreydop/gordocrm/src/lib/invoice-pdf.ts
```

La factura generada replica la estructura de la factura real entregada como referencia:

- Página 1 con fecha, descripción, número de factura, bloque de emisor, bloque `Billed To`, total destacado, tabla negra de conceptos y resumen inferior.
- Página 2 con método de pago y datos bancarios.
- Logo real de Grande&Gordo desde:

```text
https://logos.grandeandgordo.com/logoggblanco.png
```

Endpoints PDF:

```text
GET /api/admin/invoices/:id/pdf?download=1
GET /api/portal/invoices/:id/pdf?download=1
```

Sin `download=1`, devuelven JSON:

```json
{
  "pdf": "base64",
  "mimeType": "application/pdf",
  "invoiceNumber": "...",
  "filename": "...",
  "generatedAt": "..."
}
```

### Seguridad Y Producción

- `admin/kanban` API protegida con `requireAdmin`.
- CSP ajustado para que los scripts del portal funcionen en producción.
- CORS ampliado para métodos usados por el CRM.
- AI Engine ya no usa secret hardcodeado ni localhost en producción.
- AI Engine usa:

```text
AI_ENGINE_URL
AI_ENGINE_JWT_SECRET
```

- Webhooks de AI Engine ya no hacen fallback a localhost en producción.
- Facturación ya no usa fallback fiscal fake como `B00000000` o `Calle Ejemplo`.
- Si faltan datos fiscales del emisor, crear factura devuelve error explícito.
- Vistas de facturas sanitizadas con `escapeHtml` donde renderizan datos dinámicos.
- Bug de `api is not defined` en detalle de factura cliente corregido.

### Dependencias

Se añadió:

```text
pdf-lib@^1.17.1
```

Se eliminaron dependencias no usadas en runtime:

```text
bullmq
ioredis
```

Se actualizó:

```text
hono@^4.12.14
```

Motivo: eliminar vulnerabilidades moderadas de producción y reducir superficie innecesaria.

## Validaciones Pasadas

Ejecutado correctamente:

```bash
npm run typecheck
npm run build
npm run build:portal
npm audit --omit=dev --audit-level=moderate
```

Resultado audit producción:

```text
found 0 vulnerabilities
```

También se generó localmente un PDF sintético en:

```text
/tmp/gordocrm-invoice-test.pdf
```

Y se renderizó visualmente para comprobar que el layout coincide con la referencia.

## Smoke Checks Producción

Rutas públicas/estáticas:

```text
https://crm.grandeandgordo.com/login/ -> 200
https://crm.grandeandgordo.com/admin/ -> 200
https://crm.grandeandgordo.com/admin/invoices/ -> 200
https://crm.grandeandgordo.com/admin/kanban/ -> 200
https://crm.grandeandgordo.com/client/invoices/ -> 200
https://crm.grandeandgordo.com/client/invoices/detail/ -> 200
```

Health:

```text
https://crm.grandeandgordo.com/health -> 200
```

Respuesta health:

```json
{
  "status": "ok",
  "runtime": "cloudflare-workers",
  "database": "d1",
  "environment": "production"
}
```

Endpoints protegidos sin auth:

```text
/api/admin/kanban/columns -> 401
/api/admin/invoices -> 401
/api/portal/invoices -> 401
/api/ai/jobs -> 401
/api/admin/invoices/test/pdf?download=1 -> 401
/api/portal/invoices/test/pdf?download=1 -> 401
```

## Secrets Producción Confirmados

Comando usado:

```bash
npx wrangler secret list --env production
```

Secrets existentes:

```text
AI_ENGINE_JWT_SECRET
CRON_SECRET
LEAD_TRANSFER_SECRET
SESSION_SECRET
WEBHOOK_SECRET
```

## Archivos Relevantes

Facturación:

```text
/Users/alangreydop/gordocrm/src/lib/invoice-pdf.ts
/Users/alangreydop/gordocrm/src/api/routes/admin/invoices.ts
/Users/alangreydop/gordocrm/src/api/routes/portal/invoices.ts
/Users/alangreydop/gordocrm/portal/src/pages/admin/invoices.astro
/Users/alangreydop/gordocrm/portal/src/pages/admin/invoices/detail.astro
/Users/alangreydop/gordocrm/portal/src/pages/admin/invoices/new.astro
/Users/alangreydop/gordocrm/portal/src/pages/client/invoices/index.astro
/Users/alangreydop/gordocrm/portal/src/pages/client/invoices/detail.astro
```

Admin hardening:

```text
/Users/alangreydop/gordocrm/src/api/routes/admin/kanban.ts
/Users/alangreydop/gordocrm/portal/src/pages/admin/kanban.astro
```

AI Engine:

```text
/Users/alangreydop/gordocrm/src/api/routes/ai-proxy.ts
/Users/alangreydop/gordocrm/src/api/routes/portal/jobs.ts
/Users/alangreydop/gordocrm/src/api/routes/portal/webhooks.ts
/Users/alangreydop/gordocrm/src/types/index.ts
/Users/alangreydop/gordocrm/src/lib/config.ts
```

Global:

```text
/Users/alangreydop/gordocrm/src/server.ts
/Users/alangreydop/gordocrm/package.json
/Users/alangreydop/gordocrm/package-lock.json
```

## Pendientes Para Claude

### 1. QA Autenticado Real

Hacer pruebas con usuario admin y usuario cliente reales.

Flujos mínimos:

```text
Admin login
Admin dashboard
Admin kanban
Admin invoices list
Crear factura
Emitir factura
Descargar PDF admin
Enviar factura por email si RESEND_API_KEY está configurado
Marcar factura como pagada
Cancelar factura no pagada
Cliente login
Cliente invoices list
Cliente invoice detail
Descargar PDF cliente
Subir justificante
```

### 2. Verificar Config Fiscal Real

La creación de facturas ahora exige datos fiscales reales del emisor en tabla `config`.

Claves esperadas:

```text
issuer_tax_id
issuer_legal_name
issuer_address_line1
issuer_city
issuer_postal_code
issuer_country
issuer_email
```

Opcionales útiles:

```text
issuer_phone
issuer_registration_number
invoice_footer
default_payment_method
default_payment_notes
```

El PDF usa `default_payment_notes` en la página 2. Verificar que contiene IBAN/BIC reales.

### 3. Revisar Datos Bancarios En UI Cliente

La vista cliente `/client/invoices` todavía muestra un bloque estático de transferencia con:

```text
ESXX XXXX XXXX XXXX XXXX
```

Aunque el PDF usa `paymentNotes`, esa UI debería conectarse a config real o eliminarse para evitar contradicciones.

Archivo:

```text
/Users/alangreydop/gordocrm/portal/src/pages/client/invoices/index.astro
```

### 4. Merge A Main

Si QA autenticado pasa:

```bash
git checkout main
git pull origin main
git merge --no-ff release/production-hardening
git push origin main
```

Después confirmar si Cloudflare/GitHub deploy debe apuntar a `main` o si la rama operativa seguirá siendo `release/production-hardening`.

### 5. Riesgo Residual Conocido

El sistema de numeración de facturas sigue generando número al crear borrador y no usa transacción/locking fuerte. En carga normal no debería ser crítico, pero para facturación seria conviene revisar:

- Número definitivo solo al emitir.
- Control de colisiones en concurrencia.
- Migración/índice fiscal por año y serie si procede.

## Comandos Útiles

Validación:

```bash
cd /Users/alangreydop/gordocrm
npm run typecheck
npm run build
npm run build:portal
npm audit --omit=dev --audit-level=moderate
```

Deploy:

```bash
cd /Users/alangreydop/gordocrm
npm run deploy
```

Smoke básico:

```bash
curl -sS https://crm.grandeandgordo.com/health
curl -sS -o /dev/null -w '%{http_code}\n' https://crm.grandeandgordo.com/api/admin/invoices
curl -sS -o /dev/null -w '%{http_code}\n' https://crm.grandeandgordo.com/api/portal/invoices
```

Secrets:

```bash
npx wrangler secret list --env production
```

