# Grande&Gordo CRM

CRM portal para Grande&Gordo desplegado sobre Cloudflare:

- `API + Portal`: un Cloudflare Worker con `Hono` y `Static Assets`
- `DB`: Cloudflare `D1`
- `Portal`: Astro estatico compilado dentro del mismo despliegue

## Stack

| Capa | Tecnologia |
| --- | --- |
| Runtime API | Cloudflare Workers |
| HTTP | Hono |
| ORM | Drizzle ORM |
| Base de datos | Cloudflare D1 |
| Frontend | Astro estatico servido como asset del Worker |
| Auth | Cookie httpOnly + sesiones en D1 |
| Storage futuro | Cloudflare R2 |

## Arquitectura

El repo tiene dos piezas:

- `src/`: API worker con rutas `/api/portal/*`
- `portal/`: frontend Astro que se compila a `portal/dist` y se sirve desde el mismo Worker

La sesion se guarda en D1 y viaja en cookie `gg_session`. En la estrategia actual, el mismo Worker sirve el portal y la API, asi que no hace falta separar `crm.*` y `api.*` para que el login funcione.

## Lo que ya cubre el CRM

- Dashboard admin con foco en pipeline, urgencias, margen y reviews proximas
- Ficha completa de cliente con:
  - plan
  - account manager
  - estado de dataset
  - capacidad mensual
  - segmento
  - perfil de margen
  - notas internas
  - proxima review
- Provision y reseteo de acceso al portal cliente desde la ficha del cliente
- Cambio de contrasena para admin y cliente
- Ficha de trabajo con:
  - due date
  - units planned / consumed
  - costes AI estimados y reales
  - margen estimado
  - benchmark
  - stack lane
  - candidatos y stack ganador
  - riesgo legal
  - portabilidad
  - demanda estructural
  - notas internas
- Gestion de assets con QA y `deliveryUrl`
- Portal cliente mostrando solo assets aprobados y el contacto operativo `hola@grandeandgordo.com`

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
4. Configurar estas variables:
   - `APP_ENV=production`
   - `CORS_ORIGIN=https://tu-worker-o-dominio.com`
   - `SESSION_SECRET=<secreto-largo>`
5. Desplegar todo con `npm run deploy`

`npm run deploy` compila `portal/` y publica un unico Worker con API + assets estaticos.

## Migraciones

- Generar SQL nuevo: `npm run db:generate`
- Aplicar en local: `npm run db:migrate`
- Aplicar en remoto: `npm run db:migrate:remote`

## Notas

- `Supabase` ya no es la linea oficial de este repo.
- `D1` es la base primaria y el repo ya esta orientado a Cloudflare como runtime.
- El portal ya no depende de SSR ni del adapter `@astrojs/cloudflare`.
- El portal ya no necesita Cloudflare Pages para funcionar.
- `REDIS`, `Airtable`, `Stripe`, `R2`, `Resend` quedan como integraciones opcionales o fases futuras.
