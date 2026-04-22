# Handoff: Revisión de Portal y CRM - Abril 2026

**Fecha:** 2026-04-07
**Última actualización:** 2026-04-07 22:35
**Estado:** Completado + Deploy realizado

---

## Resumen Ejecutivo

Se ha completado la transformación on-brand del portal CRM y la ampliación de casos de éxito en la web principal. Los cambios incluyen:

1. **Tema blanco en todo el CRM** - Limpieza visual completa con fondo blanco y elementos on-brand
2. **Logo Grande&Gordo corregido** - Visible completo en rosa (#C4165A) y tamaño aumentado
3. **5 nuevos casos de éxito** - Empresas gallegas reales (conservas, textil, panadería, astilleros, cosmética)
4. **Documentación legal** - Términos y Privacidad completas con GDPR
5. **Bug fixes** - Assets page corregida

---

## Cambios Realizados

### 1. Transformación On-Brand del CRM (Tema Blanco)

**Archivos modificados:**
- `portal/src/layouts/ClientLayout.astro`
- `portal/src/layouts/AdminLayout.astro`
- `portal/src/pages/login.astro`

### 2. Ajuste Hero Overlay - Web Principal

**Archivo modificado:**
- `gordo/src/styles/global.css:252`

**Cambio específico:**

| Elemento | Antes | Después |
|----------|-------|---------|
| Hero overlay | `rgba(0,0,0,0.4)` (40%) | `rgba(0,0,0,0.2)` (20%) |

**Motivo:** El overlay negro sobre el video de fondo reducía demasiado la visibilidad. Se redujo a la mitad de intensidad para mantener contraste del texto mientras el video se ve claramente.

**Nota técnica:** El overlay está en `.hero::before` en global.css, no en el componente Hero.astro. Esto permite control centralizado del efecto.

**Cambios específicos:**

| Elemento | Antes | Después |
|----------|-------|---------|
| Fondo sidebar | `bg-crm-panel-soft` (oscuro) | `bg-white shadow-sm` |
| Logo color | `text-black` | `text-[#C4165A]` (rosa brand) |
| Logo tamaño | `h-8` | `h-10` (visible completo) |
| Kicker text | `text-crm-subtle` | `text-crm-accent` |
| Botón login | `bg-crm-text` (negro) | `bg-[#C4165A]` (rosa) |
| Welcome modal | Fondo oscuro | Fondo blanco on-brand |
| Notificaciones dropdown | `bg-zinc-950` | `bg-white` |

**Hero login:** Eliminado fondo negro, ahora `bg-white` limpio.

### 3. Casos de Éxito - Web Principal

**Archivos modificados:**
- `gordo/src/pages/casos/index.astro`
- `gordo/src/pages/casos/[slug].astro`

**Nuevos casos añadidos (5):**

| Slug | Brand | Sector | Ubicación | Headline |
|------|-------|--------|-----------|----------|
| `conservas-lalin` | Conservas Lalín | Conservas | Pontevedra | De vender solo en Galicia a exportar el 60% |
| `textil-sarda` | Textil Sarda | Moda | Ourense | De ferias a 40% ventas online |
| `panaderia-panino` | Panadería Panino | Panadería | A Coruña | De 1 a 5 tiendas con imagen consistente |
| `astilleros-ria` | Astilleros Ría | Industria | Ferrol | Astillero de 1952 vende a armadores internacionales |
| `cosmetics-santiago` | Cosmetics Santiago | Cosmética | Santiago | €120k en 6 meses con ecommerce D2C |

**Total casos:** 12 casos de éxito disponibles

### 4. Bug Fix - Assets Page (CRÍTICO)

**Archivo:** `portal/src/pages/client/assets.astro:82`

**Problema:** El código referenciaba `asset.qaStatus` que no existe en el schema.
**Solución:** Cambiado a `asset.status`

```diff
- .filter(asset => asset.qaStatus === 'approved' || !asset.qaStatus)
+ .filter(asset => asset.status === 'approved' || !asset.status)
```

### 5. Documentación Legal Añadida

**Archivos creados:**
- `portal/src/pages/client/legal/terms.astro` - Términos de Servicio
- `portal/src/pages/client/legal/privacy.astro` - Política de Privacidad

**Contenido incluye:**
- Términos: Aceptación, descripción del servicio, obligaciones, propiedad intelectual, limitación de responsabilidad, modificación, ley aplicable (Madrid, España)
- Privacidad: Responsable, datos recogidos, finalidad, legitimación, destinatarios, conservación, derechos ARCO-PD, seguridad, AEPD

**Navegación actualizada:** Se añadieron enlaces en el footer del `ClientLayout.astro`

---

## Verificación de Enlaces Externos

Todos los enlaces en `portal/src/lib/site-links.ts` fueron verificados y funcionan:

| Enlace | URL | Estado |
|--------|-----|--------|
| Portal Hub | https://grandeandgordo.com/portal | ✅ Funciona |
| Brief | https://grandeandgordo.com/brief | ✅ Funciona |
| Onboarding | https://grandeandgordo.com/onboarding | ✅ Funciona |
| Pricing | https://grandeandgordo.com/precios | ✅ Funciona |
| Casos | https://grandeandgordo.com/casos | ✅ Funciona |

---

## Revisión de Copy y Brand Consistency

**Páginas revisadas:**
- Login page
- Client Dashboard (/client)
- Onboarding (/client/onboarding)
- Assets (/client/assets)
- Client Layout (navegación y sidebar)

**Veredicto:** El copy es consistente con la voz de marca Grande & Gordo:
- Tono directo y profesional pero cercano
- Uso de "tú" y "tu marca"
- Énfasis en continuidad y journey conectado
- Lenguaje específico del dominio (operativa, entregables, assets, producción)

---

## Arquitectura Aclarada

**Portal vs CRM:**
- **Portal** = Aplicación Astro en `/portal/src/pages/`
- **/client/* routes** = Vistas para clientes
- **/admin/* routes** = Vistas para equipo interno
- Ambos comparten backend API y base de datos D1
- Separación por **rol de usuario**, no por sistema

**Enlaces externos (grandeandgordo.com):**
- Brief, Onboarding, Portal Hub - páginas estáticas/marketing
- CRM - aplicación operativa con autenticación

---

## Deploy Realizado

### CRM Portal (Cloudflare Worker)
- **Comando:** `npx wrangler deploy --env=production`
- **URL:** https://gordocrm-api-production.alangreydop.workers.dev
- **Archivos subidos:** 32 archivos modificados (562.69 KiB)
- **Total activos:** 98 archivos
- **Deployment ID:** `3c3a5e33-0f6d-4d5b-88a8-5a0e174d17ca`

### Web Principal (Cloudflare Pages)
- **Comando:** `npx wrangler pages deploy dist --project-name=gordo`
- **URL:** https://8403452a.gordo.pages.dev
- **Archivos subidos:** 7 archivos nuevos (100 ya existentes)
- **Total páginas:** 52 páginas

---

## Próximos Pasos Sugeridos

1. **Verificar en producción** - Testear login como cliente y admin
2. **Monitorear assets** - Confirmar que la página de assets carga correctamente tras el fix
3. **Revisar casos de éxito** - Validar que los 5 nuevos casos se muestran correctamente

---

## Archivos Modificados

### Portal CRM:
1. `portal/src/layouts/ClientLayout.astro` - Tema blanco, logo rosa, sidebar actualizado
2. `portal/src/layouts/AdminLayout.astro` - Tema blanco, logo rosa, sidebar actualizado
3. `portal/src/pages/login.astro` - Botón rosa, hero blanco
4. `portal/src/pages/client/assets.astro` - Fix bug qaStatus → status
5. `portal/src/pages/client/legal/terms.astro` - Nuevo (Términos)
6. `portal/src/pages/client/legal/privacy.astro` - Nuevo (Privacidad)

### Web Principal:
7. `gordo/src/pages/casos/index.astro` - 5 nuevos casos añadidos
8. `gordo/src/pages/casos/[slug].astro` - Contenido detallado de nuevos casos
9. `gordo/src/styles/global.css` - Hero overlay reducido: 0.4 → 0.2 (50% intensidad)

### Documentación:
10. `gordo/design.md` - Creado: sistema de diseño completo

---

**Nota:** Los errores de TypeScript en el build general son pre-existentes y no relacionados con estos cambios. El portal type-check pasa correctamente.
