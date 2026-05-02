// UI presentation helpers — keep separate from API client to avoid tight coupling

export function jobStatusClass(status: string): string {
  return (
    {
      pending: 'crm-badge crm-badge-warning',
      processing: 'crm-badge crm-badge-info',
      plan_generated: 'crm-badge crm-badge-info',
      plan_rejected: 'crm-badge crm-badge-danger',
      asset_factory_dispatched: 'crm-badge crm-badge-info',
      asset_generated: 'crm-badge crm-badge-info',
      qa_pending: 'crm-badge crm-badge-warning',
      qa_evaluation: 'crm-badge crm-badge-warning',
      qa_hitl_review: 'crm-badge crm-badge-warning',
      approved: 'crm-badge crm-badge-success',
      rejected: 'crm-badge crm-badge-danger',
      delivery_ready: 'crm-badge crm-badge-accent',
      crm_notified: 'crm-badge crm-badge-accent',
      completed: 'crm-badge crm-badge-success',
      delivered: 'crm-badge crm-badge-accent',
      failed: 'crm-badge crm-badge-danger',
      timeout: 'crm-badge crm-badge-danger',
      cancelled: 'crm-badge crm-badge-default',
    }[status] ?? 'crm-badge crm-badge-default'
  );
}

export function jobStatusLabel(status: string): string {
  return (
    {
      pending: 'Pendiente',
      processing: 'En proceso',
      plan_generated: 'Plan generado',
      plan_rejected: 'Plan rechazado',
      asset_factory_dispatched: 'En fábrica de assets',
      asset_generated: 'Asset generado',
      qa_pending: 'QA pendiente',
      qa_evaluation: 'QA evaluando',
      qa_hitl_review: 'Revisión humana',
      approved: 'Aprobado',
      rejected: 'Rechazado',
      delivery_ready: 'Listo para entrega',
      crm_notified: 'CRM notificado',
      completed: 'Completado',
      delivered: 'Entregado',
      failed: 'Fallido',
      timeout: 'Tiempo agotado',
      cancelled: 'Cancelado',
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
      capture_ready: 'crm-badge crm-badge-info',
      capturing: 'crm-badge crm-badge-accent',
      captured: 'crm-badge crm-badge-success',
      capture_failed: 'crm-badge crm-badge-danger',
    }[status] ?? 'crm-badge crm-badge-default'
  );
}

export function datasetStatusLabel(status: string): string {
  return (
    {
      pending_capture: 'Pendiente captura',
      capture_ready: 'Listo para captura',
      capturing: 'Capturando',
      captured: 'ADN capturado',
      capture_failed: 'Captura fallida',
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
