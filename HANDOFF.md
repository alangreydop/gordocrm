# CRM Portal — Handoff & Setup Guide

Estado actual del proyecto y pasos para ponerlo en marcha en otro entorno con Claude Code.

## Resumen del proyecto

Portal CRM para Grande&Gordo que gestiona clientes y trabajos de produccion de contenido AI. Tiene dos roles: **admin** (gestion completa) y **client** (ver sus trabajos).

## Lo que esta hecho

### Fase 1 — Documento de arquitectura
- ADR de stack tecnico: `docs/adr/0001-technical-architecture.md`

### Fase 2 — Scaffolding + autenticacion
- **Base de datos**: Schema con 5 tablas (users, clients, jobs, assets, sessions)
  - Drizzle ORM config: `db/schema.ts`, `db/index.ts`, `db/drizzle.config.ts`
  - Migracion SQL: `db/migrations/0000_initial_schema.sql`
  - Seed script: `db/seed.ts` (crea admin por defecto)
- **Backend Fastify** (`src/`):
  - Server: `src/server.ts` (puerto 3000)
  - Auth: login, logout, /me con sesiones server-side + cookie httpOnly
  - Middleware: `requireAuth`, `requireAdmin`
  - Passwords: bcrypt 12 rounds
- **Portal Astro SSR** (`portal/`):
  - Astro 6 + React islands + Tailwind CSS 4
  - Layouts: `AdminLayout` (sidebar oscuro), `ClientLayout` (sidebar azul)
  - Login funcional con redirect por rol
  - Paginas protegidas con auth guard

### Fase 3 — CRUD APIs + paginas con datos reales
- **Clients API** (`/api/portal/clients`):
  - GET / — lista con conteo de trabajos
  - GET /:id — detalle + trabajos del cliente
  - POST / — crear cliente
  - PATCH /:id — actualizar cliente
- **Jobs API** (`/api/portal/jobs`):
  - GET / — lista (admin: todos; client: solo los suyos)
  - GET /:id — detalle + assets
  - POST / — crear trabajo (admin only)
  - PATCH /:id — cambiar estado/datos (admin only)
- **Dashboard** (`/api/portal/dashboard/stats`):
  - Trabajos activos, completados este mes, total clientes
- **Paginas admin**: dashboard KPIs, clientes (lista/detalle/nuevo), trabajos (lista/detalle/nuevo con status controls)
- **Paginas client**: mis trabajos (lista/detalle con assets)

## Estructura del proyecto

```
.
├── db/                          # Base de datos
│   ├── schema.ts                # Drizzle ORM schema (5 tablas)
│   ├── index.ts                 # Conexion PostgreSQL pool
│   ├── drizzle.config.ts        # Config Drizzle Kit
│   ├── migrations/
│   │   └── 0000_initial_schema.sql  # SQL para crear tablas
│   └── seed.ts                  # Crear admin inicial
├── src/                         # Backend Fastify
│   ├── server.ts                # Entry point (puerto 3000)
│   ├── lib/
│   │   ├── auth.ts              # Auth: sessions, bcrypt, middleware
│   │   └── config.ts            # Env validation (zod)
│   ├── api/routes/portal/
│   │   ├── auth.ts              # Login/logout/me
│   │   ├── clients.ts           # CRUD clientes
│   │   ├── jobs.ts              # CRUD trabajos
│   │   └── dashboard.ts         # Stats endpoint
│   ├── types/index.ts           # Tipos de dominio
│   └── workers/index.ts         # (placeholder para BullMQ workers)
├── portal/                      # Frontend Astro SSR
│   ├── astro.config.mjs         # Astro 6 + React + Tailwind + Node adapter
│   ├── src/
│   │   ├── layouts/             # AdminLayout, ClientLayout, BaseLayout
│   │   ├── lib/
│   │   │   ├── session.ts       # SSR session helper
│   │   │   └── api-client.ts    # Fetch wrapper con cookie forwarding
│   │   ├── pages/
│   │   │   ├── login.astro      # Login page
│   │   │   ├── admin/           # Dashboard, clientes, trabajos
│   │   │   └── client/          # Mis trabajos, perfil
│   │   └── styles/global.css    # Tailwind import
│   └── package.json
├── docs/adr/                    # Decisiones de arquitectura
├── .env.example                 # Variables de entorno necesarias
├── package.json                 # Dependencies + scripts
└── tsconfig.json
```

## Lo que falta por hacer

### Prioritario (para que funcione)

1. **Crear repo en GitHub** y hacer push del codigo
2. **Configurar Supabase**:
   - Crear proyecto en Supabase (o usar existente)
   - Ejecutar la migracion SQL en Supabase SQL Editor
   - Copiar el DATABASE_URL al `.env`
   - Ejecutar `npm run db:seed` para crear admin

### Siguiente paso (Fase 4 — Mejoras)

- **Gestion de assets**: upload de imagenes/videos a R2, galeria en detalle de trabajo
- **Notificaciones email**: enviar email cuando cambia el estado de un trabajo (Resend)
- **Busqueda y filtros**: buscar clientes/trabajos, filtrar por estado/plataforma
- **Paginacion**: para listas grandes de clientes/trabajos
- **Dashboard avanzado**: graficas de tendencia, ingresos (requiere Stripe)
- **Deploy**: Render para backend + Astro SSR, o Cloudflare Workers

## Setup paso a paso (nuevo entorno)

### 1. Clonar y instalar

```bash
# Clonar el repo (una vez este en GitHub)
git clone https://github.com/TU-USUARIO/TU-REPO.git
cd TU-REPO

# Instalar dependencias (backend + portal)
npm install
cd portal && npm install && cd ..
```

### 2. Configurar Supabase

```bash
# Copiar ejemplo de env
cp .env.example .env
```

Editar `.env` con los valores reales. Lo minimo para el CRM:

```env
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:[TU-PASSWORD]@db.[TU-PROJECT-REF].supabase.co:5432/postgres
```

Las demas variables (Stripe, fal.ai, R2, etc.) son para features futuras — el CRM arranca solo con `DATABASE_URL`.

> **Nota**: el config.ts actual valida TODAS las variables. Para desarrollo sin todas las keys, modifica `src/lib/config.ts` y pon `.optional()` en las variables que no necesites todavia.

### 3. Crear tablas en Supabase

Opcion A — SQL Editor en el dashboard de Supabase:
1. Ve a tu proyecto → SQL Editor
2. Pega el contenido de `db/migrations/0000_initial_schema.sql`
3. Ejecuta

Opcion B — Desde la terminal (requiere DATABASE_URL en .env):
```bash
npm run db:migrate
```

### 4. Crear usuario admin

```bash
npm run db:seed
# Crea: admin@grandegordo.com / changeme123
# Puedes pasar parametros: npm run db:seed -- tu@email.com tuPassword tuNombre
```

### 5. Arrancar en desarrollo

```bash
# Terminal 1 — Backend (puerto 3000)
npm run dev

# Terminal 2 — Portal (puerto 4321)
cd portal
npm run dev
```

Abrir `http://localhost:4321/login` y entrar con las credenciales del seed.

### 6. Hacerlo con Claude Code

Si quieres continuar el desarrollo con Claude Code en otro environment:

```bash
# Desde la raiz del proyecto clonado
claude

# Pedirle que:
# - Revise el codigo actual y entienda la arquitectura
# - Implemente la feature que necesites (assets, email, filtros, etc.)
# - Haga los cambios necesarios en config.ts para que las variables sean opcionales
```

Contexto clave para darle a Claude Code:
- "Este es un CRM portal con Fastify backend (src/) y Astro SSR frontend (portal/)"
- "La base de datos es PostgreSQL via Supabase con Drizzle ORM"
- "Las rutas API estan en src/api/routes/portal/"
- "Las paginas estan en portal/src/pages/"
- "Usa cookie-based sessions, no JWT"

## Variables de entorno

| Variable | Requerida | Para que |
|----------|-----------|----------|
| `DATABASE_URL` | Si | PostgreSQL (Supabase) |
| `PORT` | No (default 3000) | Puerto del backend |
| `NODE_ENV` | No (default development) | Entorno |
| `STRIPE_SECRET_KEY` | Fase 4+ | Pagos |
| `FAL_KEY` | Fase 4+ | Generacion AI |
| `OPENAI_API_KEY` | Fase 4+ | QA automatizado |
| `R2_*` | Fase 4+ | Storage de assets |
| `AIRTABLE_*` | Legacy | Migracion desde Airtable |
| `REDIS_URL` | Fase 4+ | Colas de trabajo |
| `RESEND_API_KEY` | Fase 4+ | Emails transaccionales |

## Credenciales por defecto

| Usuario | Password | Rol |
|---------|----------|-----|
| admin@grandegordo.com | changeme123 | admin |

Cambiar inmediatamente en produccion.
