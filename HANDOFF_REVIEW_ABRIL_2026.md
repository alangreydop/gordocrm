# Handoff: Revisión de Portal y CRM - Abril 2026

**Fecha:** 2026-04-07
**Estado:** Completado

## Resumen

Se ha completado la revisión solicitada del briefing, enlaces, onboarding, documentación legal y copy del portal/CRM.

## Cambios Realizados

### 1. Bug Fix - Assets (CRÍTICO)
**Archivo:** `portal/src/pages/client/assets.astro:82`

**Problema:** El código referenciaba `asset.qaStatus` que no existe en el schema.
**Solución:** Cambiado a `asset.status`

```diff
- .filter(asset => asset.qaStatus === 'approved' || !asset.qaStatus)
+ .filter(asset => asset.status === 'approved' || !asset.status)
```

### 2. Documentación Legal Añadida

**Archivos creados:**
- `portal/src/pages/client/legal/terms.astro` - Términos de Servicio
- `portal/src/pages/client/legal/privacy.astro` - Política de Privacidad

**Contenido incluye:**
- Términos: Aceptación, descripción del servicio, obligaciones, propiedad intelectual, limitación de responsabilidad, modificación, ley aplicable (Madrid, España)
- Privacidad: Responsable, datos recogidos, finalidad, legitimación, destinatarios, conservación, derechos ARCO-PD, seguridad, AEPD

**Navegación actualizada:** Se añadieron enlaces en el footer del `ClientLayout.astro`

### 3. Verificación de Enlaces Externos

Todos los enlaces en `portal/src/lib/site-links.ts` fueron verificados y funcionan:

| Enlace | URL | Estado |
|--------|-----|--------|
| Portal Hub | https://grandeandgordo.com/portal | ✅ Funciona |
| Brief | https://grandeandgordo.com/brief | ✅ Funciona |
| Onboarding | https://grandeandgordo.com/onboarding | ✅ Funciona |
| Pricing | https://grandeandgordo.com/precios | ✅ Funciona |
| Casos | https://grandeandgordo.com/casos | ✅ Funciona |

### 4. Revisión de Copy y Brand Consistency

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

## Próximos Pasos Sugeridos

1. **Deploy a producción** - Los cambios están listos para deploy
2. **Verificar en producción** - Testear login como cliente y admin
3. **Monitorear assets** - Confirmar que la página de assets carga correctamente tras el fix

## Archivos Modificados

1. `portal/src/pages/client/assets.astro` - Fix bug qaStatus → status
2. `portal/src/pages/client/legal/terms.astro` - Nuevo (Términos)
3. `portal/src/pages/client/legal/privacy.astro` - Nuevo (Privacidad)
4. `portal/src/layouts/ClientLayout.astro` - Añadidos enlaces legales en footer

---

**Nota:** Los errores de TypeScript en el build general son pre-existentes y no relacionados con estos cambios. El portal type-check pasa correctamente.
