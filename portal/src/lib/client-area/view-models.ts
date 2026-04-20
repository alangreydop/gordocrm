import type { ClientAreaSnapshot } from './api';

export interface InicioViewModel {
  accountLabel: string;
  activeProjectCount: number;
  pendingReviewCount: number;
  unreadMessageCount: number;
  timeline: ClientAreaSnapshot['timeline'];
}

export interface ProjectViewModel {
  id: string;
  title: string;
  status: string;
  statusLabel: string;
  dueAt: string | null;
  brief: string | null;
  platform: string | null;
  type: string | null;
  unitsPlanned: number;
  unitsConsumed: number;
}

export interface ReviewViewModel {
  id: string;
  projectId: string | null;
  assetId: string | null;
  title: string;
  summary: string | null;
  status: string;
  statusLabel: string;
  requestedAt: string;
  dueAt: string | null;
  decisionNote: string | null;
}

export interface FileViewModel {
  id: string;
  projectId: string | null;
  title: string;
  category: string;
  kind: string;
  href: string | null;
  status: string;
  createdAt: string;
}

export interface MessageThreadViewModel {
  id: string;
  projectId: string | null;
  subject: string;
  status: string;
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number;
  participants: string[];
  latestAuthorRole: string | null;
}

export interface InvoiceViewModel {
  id: string;
  invoiceNumber: string;
  status: string;
  statusLabel: string;
  totalCents: number;
  totalEur: string;
  issueDate: string;
  dueDate: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  processing: 'En producción',
  delivered: 'Entregado',
  completed: 'Completado',
  failed: 'Fallido',
  needs_review: 'Pendiente de revisión',
  approved: 'Aprobado',
  changes_requested: 'Cambios solicitados',
  issued: 'Emitida',
  paid: 'Pagada',
  overdue: 'Vencida',
  active: 'Activo',
  closed: 'Cerrado',
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

export function toInicioViewModel(snapshot: ClientAreaSnapshot): InicioViewModel {
  return {
    accountLabel: snapshot.account.label,
    activeProjectCount: snapshot.projects.filter(
      (p) => ['pending', 'processing', 'delivered'].includes(p.status),
    ).length,
    pendingReviewCount: snapshot.reviews.filter(
      (r) => r.status === 'needs_review',
    ).length,
    unreadMessageCount: snapshot.messages.reduce(
      (sum, m) => sum + (m.unreadCount ?? 0),
      0,
    ),
    timeline: snapshot.timeline,
  };
}

export function toProjectsViewModel(snapshot: ClientAreaSnapshot): ProjectViewModel[] {
  return snapshot.projects.map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    statusLabel: statusLabel(p.status),
    dueAt: p.dueAt,
    brief: p.brief ?? null,
    platform: p.platform ?? null,
    type: p.type ?? null,
    unitsPlanned: p.unitsPlanned ?? 0,
    unitsConsumed: p.unitsConsumed ?? 0,
  }));
}

export function toReviewsViewModel(snapshot: ClientAreaSnapshot): ReviewViewModel[] {
  return snapshot.reviews.map((r) => ({
    id: r.id,
    projectId: r.projectId ?? null,
    assetId: r.assetId ?? null,
    title: r.title ?? 'Sin título',
    summary: r.summary ?? null,
    status: r.status ?? 'needs_review',
    statusLabel: statusLabel(r.status ?? 'needs_review'),
    requestedAt: r.requestedAt ?? '',
    dueAt: r.dueAt ?? null,
    decisionNote: r.decisionNote ?? null,
  }));
}

export function toFilesViewModel(snapshot: ClientAreaSnapshot): FileViewModel[] {
  return snapshot.files.map((f) => ({
    id: f.id,
    projectId: f.projectId ?? null,
    title: f.title ?? 'Sin título',
    category: f.category ?? 'deliverable',
    kind: f.kind ?? 'image',
    href: f.href ?? null,
    status: f.status ?? '',
    createdAt: f.createdAt ?? '',
  }));
}

export function toMessagesViewModel(snapshot: ClientAreaSnapshot): MessageThreadViewModel[] {
  return snapshot.messages.map((m) => ({
    id: m.id,
    projectId: m.projectId ?? null,
    subject: m.subject ?? 'Sin asunto',
    status: m.status ?? 'active',
    lastMessagePreview: m.lastMessagePreview ?? '',
    lastMessageAt: m.lastMessageAt ?? '',
    unreadCount: m.unreadCount ?? 0,
    participants: m.participants ?? [],
    latestAuthorRole: m.latestAuthorRole ?? null,
  }));
}

export function toInvoicesViewModel(snapshot: ClientAreaSnapshot): InvoiceViewModel[] {
  return snapshot.billing.invoices.map((i) => ({
    id: i.id,
    invoiceNumber: i.invoiceNumber,
    status: i.status,
    statusLabel: statusLabel(i.status),
    totalCents: i.totalCents,
    totalEur: formatCents(i.totalCents),
    issueDate: i.issueDate,
    dueDate: i.dueDate,
  }));
}