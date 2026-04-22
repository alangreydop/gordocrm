// UI presentation helpers — keep separate from API client to avoid tight coupling

export function jobStatusClass(status: string): string {
  return (
    {
      pending: 'crm-badge crm-badge-warning',
      processing: 'crm-badge crm-badge-info',
      completed: 'crm-badge crm-badge-success',
      failed: 'crm-badge crm-badge-danger',
      delivered: 'crm-badge crm-badge-accent',
    }[status] ?? 'crm-badge crm-badge-default'
  );
}

export function jobStatusLabel(status: string): string {
  return (
    {
      pending: 'Pendiente',
      processing: 'En proceso',
      completed: 'Completado',
      failed: 'Fallido',
      delivered: 'Entregado',
    }[status] ?? status
  );
}

export function subscriptionClass(status: string): string {
  return (
    {
      active: 'crm-badge crm-badge-success',
      cancelled: 'crm-badge crm-badge-danger',
      inactive: 'crm-badge crm-badge-default',
    }[status] ?? 'crm-badge crm-badge-default'
  );
}

export function subscriptionLabel(status: string): string {
  return (
    {
      active: 'Activo',
      cancelled: 'Cancelado',
      inactive: 'Inactivo',
    }[status] ?? status
  );
}

export function datasetStatusClass(status: string): string {
  return (
    {
      pending_capture: 'crm-badge crm-badge-warning',
      captured: 'crm-badge crm-badge-info',
      trained: 'crm-badge crm-badge-accent',
      active: 'crm-badge crm-badge-success',
      archived: 'crm-badge crm-badge-default',
    }[status] ?? 'crm-badge crm-badge-default'
  );
}

export function datasetStatusLabel(status: string): string {
  return (
    {
      pending_capture: 'Pendiente captura',
      captured: 'Capturado',
      trained: 'Entrenado',
      active: 'Activo',
      archived: 'Archivado',
    }[status] ?? status
  );
}

export function stackLaneClass(lane: string): string {
  return (
    {
      A: 'crm-badge crm-badge-success',
      B: 'crm-badge crm-badge-info',
      C: 'crm-badge crm-badge-accent',
      D: 'crm-badge crm-badge-warning',
    }[lane] ?? 'crm-badge crm-badge-default'
  );
}

export function qaStatusClass(status: string): string {
  return (
    {
      approved: 'crm-badge crm-badge-success',
      rejected: 'crm-badge crm-badge-danger',
      pending: 'crm-badge crm-badge-warning',
    }[status] ?? 'crm-badge crm-badge-default'
  );
}

export function qaStatusLabel(status: string): string {
  return (
    {
      approved: 'Aprobado',
      rejected: 'Rechazado',
      pending: 'Pendiente',
    }[status] ?? status
  );
}

export function turnaroundClass(turnaround: string): string {
  return (
    {
      urgente: 'crm-badge crm-badge-danger',
      normal: 'crm-badge crm-badge-default',
    }[turnaround] ?? 'crm-badge crm-badge-default'
  );
}

export function turnaroundLabel(turnaround: string): string {
  return (
    {
      urgente: 'Urgente',
      normal: 'Normal',
    }[turnaround] ?? turnaround
  );
}
