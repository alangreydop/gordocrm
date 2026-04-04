# CRM Portal — Handoff Cloudflare + D1

Estado actual y forma correcta de continuar este repo.

## Decision tomada

La linea oficial del proyecto ya no es `Supabase/Postgres`.

La nueva base es:

- `API` en Cloudflare Workers
- `DB` en Cloudflare D1
- `Portal` en Astro estatico servido por el mismo Worker

## Lo que ya esta adaptado

### Backend

- `src/server.ts`
  - Reescrito a `Hono`
  - Exporta un Worker listo para `wrangler deploy`
- `src/api/routes/portal/*`
  - Mantienen las rutas del portal
  - `/api/portal/auth`
  - `/api/portal/clients`
  - `/api/portal/jobs`
  - `/api/portal/dashboard`
- `src/lib/auth.ts`
  - Sesiones en `D1`
  - Cookie `gg_session`
  - Hash del token de sesion antes de guardarlo
- `src/lib/config.ts`
  - Config tipada para Cloudflare runtime
  - Bloquea deploys inseguros en produccion si faltan `SESSION_SECRET` o `CORS_ORIGIN`

### Base de datos

- `db/schema.ts`
  - Schema Drizzle para SQLite/D1
- `db/migrations/0000_initial_schema.sql`
  - Migracion inicial D1
- `db/drizzle.config.ts`
  - Drizzle Kit configurado con driver `d1-http`
- `db/seed.ts`
  - Seed del admin via `wrangler d1 execute`

### Portal

- `portal/astro.config.mjs`
  - Build estatico
- `portal/src/lib/api-client.ts`
  - Usa mismo origen en produccion y `http://127.0.0.1:8787` en local
- `portal/src/lib/session.ts`
  - Reexport de helpers cliente
- layouts y forms
  - logout contra la API real
  - guards cliente alineados con Worker local
- paginas de detalle
  - pasan a query params (`/detail?id=...`) para evitar rutas dinamicas SSR

## Estrategia de despliegue

### Desarrollo local

1. API worker:

```bash
npm run dev
```

2. Portal:

```bash
cd portal
npm run dev
```

3. Base local:

```bash
npm run db:migrate
npm run db:seed
```

### Produccion

Desplegar un solo servicio dentro de Cloudflare:

1. `gordocrm-api-production`
   - Worker
   - binding D1 `DB`
   - assets estaticos servidos desde `portal/dist`

### Dominio recomendado

El camino mas simple es poner un solo dominio al Worker completo, por ejemplo:

- `crm.tu-dominio.com`

Si algun dia separas frontend y API, entonces si necesitarias coordinar `CORS_ORIGIN` y `SESSION_COOKIE_DOMAIN`.

## Variables importantes

### API worker

- `APP_ENV`
- `CORS_ORIGIN`
- `SESSION_SECRET`

### Para Drizzle/seed remoto

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_DATABASE_ID`
- `CLOUDFLARE_DATABASE_NAME`
- `CLOUDFLARE_D1_TOKEN`

## Scripts que ahora importan

- `npm run dev`
- `npm run deploy`
- `npm run build:portal`
- `npm run db:generate`
- `npm run db:migrate`
- `npm run db:migrate:remote`
- `npm run db:seed`
- `npm run db:seed:remote`

## Admin por defecto

- email: `admin@grandegordo.com`
- password: `changeme123`

Cambiarlo nada mas sembrar produccion.

## Lo que ya no es verdad

No seguir usando estas premisas:

- "La base es Supabase"
- "Solo hay que poner DATABASE_URL"
- "El backend corre en Fastify/Node"
- "Se despliega como servicio Node tradicional"
- "El portal necesita SSR para funcionar"

## Siguiente trabajo recomendado

1. Instalar dependencias y regenerar lockfiles.
2. Ejecutar typecheck y build.
3. Crear la D1 real en Cloudflare.
4. Apuntar un dominio al Worker unico cuando quieras dejar de usar `workers.dev`.
5. Luego abordar assets en R2 y colas Cloudflare si hiciera falta.
