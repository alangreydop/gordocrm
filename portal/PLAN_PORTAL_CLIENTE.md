# Plan: Completar Funcionalidades del Portal Cliente

## Objetivo
Implementar 6 funcionalidades pendientes en el portal cliente de Grande&Gordo para proporcionar una experiencia completa de visualización, aprobación y gestión de assets.

---

## Tareas (con dependencias)

### Tarea 1: Sistema de Feedback/Aprobación en Entregables
**Blocking:** ninguna  
**Prioridad:** ALTA  
**Archivos:** `portal/src/pages/client/jobs/detail.astro`, `src/api/routes/portal/jobs.ts`

**Criterios de Aceptación:**
- [ ] Botones "Aprobar" / "Solicitar Cambios" en vista de job
- [ ] Campo de comentarios obligatorio para "Solicitar Cambios"
- [ ] Estado del job se actualiza en backend
- [ ] Notificación al equipo cuando cliente aprueba/rechaza

---

### Tarea 2: Vista Completa de Assets Aprobados con Descarga
**Blocking:** ninguna  
**Prioridad:** ALTA  
**Archivos:** `portal/src/pages/client/assets.astro`, `src/api/routes/portal/assets.ts` (nuevo)

**Criterios de Aceptación:**
- [ ] Grid con todos los assets aprobados del cliente
- [ ] Preview de imagen/video
- [ ] Botón de descarga directo
- [ ] Filtro por proyecto/fecha

---

### Tarea 3: Historial de Trabajos Completados
**Blocking:** ninguna  
**Prioridad:** MEDIA  
**Archivos:** `portal/src/pages/client/history.astro`

**Criterios de Aceptación:**
- [ ] Lista cronológica de jobs completados
- [ ] Estado visual (aprobado/rechazado/pendiente)
- [ ] Link a detalle de cada job
- [ ] Paginación o infinite scroll

---

### Tarea 4: Estado de Capacidad Consumida vs Disponible
**Blocking:** ninguna  
**Prioridad:** MEDIA  
**Archivos:** `portal/src/pages/client/dashboard.astro`, `src/api/routes/portal/dashboard.ts`

**Criterios de Aceptación:**
- [ ] Progress bar o medidor visual
- [ ] Créditos/tiempo consumido vs total
- [ ] Proyección de consumo a ritmo actual
- [ ] Alerta cuando esté cerca del límite

---

### Tarea 5: Timeline Visual del Proyecto
**Blocking:** Tarea 3 (historial)  
**Prioridad:** BAJA  
**Archivos:** `portal/src/pages/client/timeline.astro`

**Criterios de Aceptación:**
- [ ] Vista cronológica tipo línea de tiempo
- [ ] Hitos del proyecto (kickoff, entregas, aprobaciones)
- [ ] Estado actual del proyecto
- [ ] Próximos entregables estimados

---

### Tarea 6: Notificaciones de Nuevos Assets
**Blocking:** Tarea 1 (feedback)  
**Prioridad:** BAJA  
**Archivos:** `portal/src/components/Notifications.tsx`, backend WebSocket o polling

**Criterios de Aceptación:**
- [ ] Badge con contador de notificaciones
- [ ] Lista de notificaciones (nuevo asset, job aprobado, etc.)
- [ ] Marcar como leída
- [ ] Opción de email notifications

---

## Estrategia de Ejecución

### Fase 1: Parallel Dispatch (Tareas Independientes)
Las tareas 1-4 son **INDEPENDIENTES** → ejecutar en paralelo con 2-4 agentes:
- Agente A → Tarea 1 (Feedback/Aprobación)
- Agente B → Tarea 2 (Assets con Descarga)
- Agente C → Tarea 3 (Historial)
- Agente D → Tarea 4 (Capacity Tracking)

### Fase 2: Dependencias
- Tarea 5 (Timeline) → espera a Tarea 3
- Tarea 6 (Notificaciones) → espera a Tarea 1

### Fase 3: Integración
- Verificar no conflictos entre branches
- Test suite completo
- Deploy a staging

---

## Metadata
```json
{
  "goal": "Completar 6 funcionalidades del portal cliente",
  "estimated_hours": 12,
  "priority": "HIGH",
  "dependencies": {
    "5": [3],
    "6": [1]
  }
}
```
