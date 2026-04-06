# CRM On-Brand - Grande&Gordo

## Fecha: 2026-04-06

---

## Resumen

Se completó la alineación del CRM con la identidad visual de Grande&Gordo, siguiendo los mismos patrones de diseño de la web principal.

---

## Cambios Realizados

### 1. Logo en Layouts

**Archivos modificados:**
- `/portal/src/layouts/AdminLayout.astro`
- `/portal/src/layouts/ClientLayout.astro`

**Cambios:**
- Añadido logo SVG de Grande&Gordo en el header de ambos layouts
- Logo de 32px de altura (h-8) con viewBox original
- Layout con flexbox para alinear logo + texto

**Estructura:**
```html
<div class="flex items-center gap-3">
  <svg class="h-8 w-auto">[G&G Logo]</svg>
  <div>
    <p class="text-xs uppercase tracking">Grande & Gordo</p>
    <h1 class="text-xl font-black">CRM operativo / Portal cliente</h1>
  </div>
</div>
```

### 2. Tipografía Alineada

**Fuentes utilizadas:**
- **Satoshi** (variable): cuerpo de texto, UI
- **LibreBaskerville** (itálica/regular): kickers, subtítulos

**Clases CRM:**
```css
.crm-kicker {
  font-family: 'LibreBaskerville', Georgia, serif;
  font-size: 0.72rem;
  font-weight: 500;
  letter-spacing: 0.24em;
  text-transform: uppercase;
}
```

### 3. Colores G&G

**Variables CSS:**
```css
:root {
  --gg-black: #000000;
  --gg-zinc-950: #09090b;
  --gg-zinc-900: #18181b;
  --gg-zinc-800: #27272a;
  --gg-accent: #C4165A;        /* Rosa G&G */
  --gg-accent-hover: #a00f49;
  --gg-accent-light: #f5709a;
}
```

---

## Estado del Deploy

**Worker:** `gordocrm-api-production`
- **URL:** https://gordocrm-api-production.alangreydop.workers.dev
- **Version ID:** 09186a6b-5d28-44e1-a314-19d8575012aa
- **Assets:** 55 archivos (17 actualizados)
- **Bundle:** 472.29 KiB / gzip: 94.08 KiB

---

## Páginas Disponibles

### Admin (/admin)
- Dashboard → `/admin`
- Clientes → `/admin/clients`
- Trabajos → `/admin/jobs`
- Briefs → `/admin/briefs` (NUEVO)
- Configuración → `/admin/settings`

### Client Portal (/client)
- Resumen → `/client`
- Assets → `/client/assets` (NUEVO)
- Historial → `/client/history` (NUEVO)
- Perfil → `/client/profile`
- Job Detail → `/client/jobs/detail`

---

## Tareas Completadas

| # | Task | Estado |
|---|------|--------|
| #1 | Mejorar CRM on-brand | ✅ COMPLETADA |
| #2 | Portal cliente | ✅ COMPLETADA |
| #3 | Dashboard admin | ✅ COMPLETADA |
| #4 | Sistema de briefs | ✅ COMPLETADA |
| #7 | Wrappers APIs | ✅ COMPLETADA |

---

## Próximos Pasos (Opcional)

1. **Notificaciones en tiempo real** - WebSocket/polling para portal cliente
2. **Mejoras de UX** - Toast notifications, loading states
3. **Bulk actions** - Para gestión de briefs
4. **Export a CSV** - Para reportes de clientes/trabajos

---

## Metadata

```json
{
  "date": "2026-04-06",
  "files_modified": 2,
  "deploy_status": "success",
  "version_id": "09186a6b-5d28-44e1-a314-19d8575012aa",
  "onbrand_status": "complete"
}
```
