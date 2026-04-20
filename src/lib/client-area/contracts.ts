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
  id: string;
  label: string;
  company: string | null;
  supportEmail: string;
  activeProjectId: string | null;
}

export interface ClientAreaProjectSnapshot {
  id: string;
  title: string;
  status: string;
  dueAt: string | null;
  brief?: string | null;
  platform?: string | null;
  type?: string | null;
  unitsPlanned?: number;
  unitsConsumed?: number;
}

export interface ClientAreaReviewSnapshot {
  id: string;
  projectId?: string | null;
  assetId?: string | null;
  title?: string;
  summary?: string | null;
  status?: 'needs_review' | 'approved' | 'changes_requested';
  requestedAt?: string;
  dueAt?: string | null;
  decisionNote?: string | null;
}

export interface ClientAreaFileSnapshot {
  id: string;
  projectId?: string | null;
  title?: string;
  category?: 'deliverable' | 'reference';
  kind?: 'image' | 'video';
  href?: string | null;
  status?: string;
  createdAt?: string;
  updatedAt?: string | null;
}

export interface ClientAreaMessageSnapshot {
  id: string;
  projectId?: string | null;
  subject?: string;
  status?: 'active' | 'closed';
  lastMessagePreview?: string;
  lastMessageAt?: string;
  unreadCount?: number;
  participants?: string[];
  latestAuthorRole?: 'client' | 'studio' | null;
}

export interface ClientAreaInvoiceSnapshot {
  id: string;
  invoiceNumber: string;
  status: string;
  totalCents: number;
  issueDate: string;
  dueDate: string;
}

export interface ClientAreaTimelineItemSnapshot {
  id: string;
  kind: string;
  label: string;
  occurredAt?: string;
  href?: string;
}

export interface ClientAreaBillingSnapshot {
  invoices: ClientAreaInvoiceSnapshot[];
  nextInvoiceId: string | null;
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
      id: 'client-area-empty',
      label: 'Área de Cliente',
      company: null,
      supportEmail: 'hola@grandeandgordo.com',
      activeProjectId: null,
    },
    projects: [],
    reviews: [],
    files: [],
    messages: [],
    billing: {
      invoices: [],
      nextInvoiceId: null,
    },
    timeline: [],
  };
}
