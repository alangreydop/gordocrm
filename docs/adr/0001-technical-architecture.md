# ADR-0001: CRM Portal on Cloudflare

**Status:** Accepted  
**Date:** 2026-04-04

## Context

El CRM de Grande&Gordo necesita:

- coste cercano a cero para poco trafico
- integracion nativa con Cloudflare
- una base relacional simple
- despliegue facil con el menor numero de piezas posible

La direccion anterior con `Supabase/Postgres` ya no encaja con esa prioridad.

## Decision

Adoptamos esta arquitectura:

- `Cloudflare Workers` para la API
- `Cloudflare Workers Static Assets` para servir el portal
- `Hono` como capa HTTP
- `Cloudflare D1` como base de datos principal
- `Drizzle ORM` para schema y consultas
- `Astro` estatico para el portal
- cookies httpOnly con sesiones persistidas en `D1`

## Rationale

### Por que D1

- vive dentro de Cloudflare
- tiene plan gratuito suficiente para un CRM pequeño
- encaja con el runtime serverless del API
- reduce piezas externas y coste operativo

### Por que Hono

- routing ligero para Workers
- buena ergonomia TypeScript
- mas natural que mantener un servidor Node/Fastify dentro de Cloudflare

### Por que unificar API y portal en un solo Worker

- simplifica el despliegue y baja el coste operativo
- evita depender de Pages para un portal pequeno
- reduce problemas de cookies y CORS
- sigue permitiendo que el portal se compile como sitio estatico

## Consequences

### Positivas

- menos infraestructura externa
- stack coherente con Cloudflare
- despliegue barato y simple
- una sola origin para portal y API

### Tradeoffs

- `D1` usa SQLite semantics, no Postgres
- las migraciones se aplican con `wrangler d1 migrations apply`
- las rutas dinamicas del portal se resuelven en cliente con query params

## Operational rules

1. No introducir de nuevo `DATABASE_URL` como dependencia central.
2. Toda nueva persistencia relacional debe modelarse para `D1`.
3. La configuracion oficial del runtime vive en `wrangler.toml`.
4. El despliegue oficial sirve `portal/dist` desde el mismo Worker que expone `/api/*`.
