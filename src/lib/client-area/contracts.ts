export type ClientAreaSectionSlug =
  | 'inicio'
  | 'proyectos'
  | 'revisiones'
  | 'archivos'
  | 'mensajes'
  | 'facturacion';

export interface ClientAreaSection {
  slug: ClientAreaSectionSlug;
  label: string;
}

export const CLIENT_AREA_SECTIONS = [
  { slug: 'inicio', label: 'Inicio' },
  { slug: 'proyectos', label: 'Proyectos' },
  { slug: 'revisiones', label: 'Revisiones' },
  { slug: 'archivos', label: 'Archivos' },
  { slug: 'mensajes', label: 'Mensajes' },
  { slug: 'facturacion', label: 'Facturación' },
] as const satisfies ReadonlyArray<ClientAreaSection>;

export interface ClientAreaAccountSnapshot {
  label: string;
  supportEmail: string;
}

export interface ClientAreaProjectSnapshot {
  id: string;
}

export interface ClientAreaReviewSnapshot {
  id: string;
}

export interface ClientAreaFileSnapshot {
  id: string;
}

export interface ClientAreaMessageSnapshot {
  id: string;
}

export interface ClientAreaInvoiceSnapshot {
  id: string;
}

export interface ClientAreaTimelineItemSnapshot {
  id: string;
  kind: string;
  label: string;
}

export interface ClientAreaBillingSnapshot {
  invoices: ClientAreaInvoiceSnapshot[];
}

export interface ClientAreaSnapshot {
  account: ClientAreaAccountSnapshot;
  projects: ClientAreaProjectSnapshot[];
  reviews: ClientAreaReviewSnapshot[];
  files: ClientAreaFileSnapshot[];
  messages: ClientAreaMessageSnapshot[];
  billing: ClientAreaBillingSnapshot;
  timeline: ClientAreaTimelineItemSnapshot[];
}

export function createEmptyClientAreaSnapshot(): ClientAreaSnapshot {
  return {
    account: {
      label: 'Área de Cliente',
      supportEmail: 'hola@grandeandgordo.com',
    },
    projects: [],
    reviews: [],
    files: [],
    messages: [],
    billing: {
      invoices: [],
    },
    timeline: [],
  };
}
