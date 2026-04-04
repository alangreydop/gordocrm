# Grande&Gordo CRM

CRM portal para Grande&Gordo desplegado sobre Cloudflare:

- `API`: Cloudflare Worker con `Hono`
- `DB`: Cloudflare `D1`
- `Portal`: Astro estatico servido desde Cloudflare

## Stack

| Capa | Tecnologia |
| --- | --- |
| Runtime API | Cloudflare Workers |
| HTTP | Hono |
| ORM | Drizzle ORM |
| Base de datos | Cloudflare D1 |
| Frontend | Astro estatico + fetch al API |
| Auth | Cookie httpOnly + sesiones en D1 |
| Storage futuro | Cloudflare R2 |

## Arquitectura

El repo tiene dos apps:

- `src/`: API worker con rutas `/api/portal/*`
- `portal/`: portal estatico que consume esa API desde el navegador

La sesion se guarda en D1 y viaja en cookie `gg_session`. En produccion, portal y API deben vivir bajo el mismo dominio raiz para compartir cookie, por ejemplo:

- `crm.grandegordo.com`
- `api.grandegordo.com`

Y el worker debe recibir `SESSION_COOKIE_DOMAIN=.grandegordo.com`.

## Primer arranque

```bash
npm install
cd portal && npm install && cd ..
cp .env.example .env
```

## Configurar D1

1. Crear la base:

```bash
npx wrangler d1 create gordocrm
```

2. Copiar el `database_id` que devuelve Cloudflare en [wrangler.toml](/tmp/gordocrm/wrangler.toml).

3. Aplicar la migracion local:

```bash
npm run db:migrate
```

4. Seed local del admin:

```bash
npm run db:seed
```

Credenciales por defecto:

- `admin@grandegordo.com`
- `changeme123`

## Desarrollo

API:

```bash
npm run dev
```

Portal:

```bash
cd portal
npm run dev
```

Defaults locales:

- API: `http://127.0.0.1:8787`
- Portal: `http://localhost:4321`

## Produccion

Checklist minimo:

1. Crear la D1 real y actualizar `database_id` en [wrangler.toml](/tmp/gordocrm/wrangler.toml).
2. Ejecutar `npm run db:migrate:remote`.
3. Ejecutar `npm run db:seed:remote`.
4. Desplegar el API worker con `npm run deploy`.
5. Desplegar el portal estatico en Cloudflare Pages.
6. Configurar estas variables:
   - `APP_ENV=production`
   - `CORS_ORIGIN=https://crm.tu-dominio.com`
   - `SESSION_SECRET=<secreto-largo>`
   - `SESSION_COOKIE_DOMAIN=.tu-dominio.com`
   - `API_URL=https://api.tu-dominio.com`
   - `PUBLIC_API_URL=https://api.tu-dominio.com`

## Migraciones

- Generar SQL nuevo: `npm run db:generate`
- Aplicar en local: `npm run db:migrate`
- Aplicar en remoto: `npm run db:migrate:remote`

## Notas

- `Supabase` ya no es la linea oficial de este repo.
- `D1` es la base primaria y el repo ya esta orientado a Cloudflare como runtime.
- El portal ya no depende de SSR ni del adapter `@astrojs/cloudflare`.
- `REDIS`, `Airtable`, `Stripe`, `R2`, `Resend` quedan como integraciones opcionales o fases futuras.
