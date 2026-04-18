import { createEmptyClientAreaSnapshot, type ClientAreaSnapshot } from './contracts.js';

export interface ClientAreaSourceClient {
  id: string;
  userId: string | null;
  name: string;
  email: string;
  company: string | null;
  subscriptionStatus: string;
  datasetStatus: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClientAreaSourceJob {
  id: string;
  clientId: string;
  status: string;
  briefText: string | null;
  platform: string | null;
  type: string | null;
  dueAt: Date | null;
  unitsPlanned: number;
  unitsConsumed: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClientAreaSourceInvoice {
  id: string;
  clientId: string;
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date;
  totalCents: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClientAreaSourceNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  read: number;
  relatedJobId: string | null;
  relatedInvoiceId: string | null;
  createdAt: Date;
  updatedAt: Date | null;
}

export interface BuildClientAreaSnapshotInput {
  client: ClientAreaSourceClient;
  jobs: ClientAreaSourceJob[];
  invoices: ClientAreaSourceInvoice[];
  notifications: ClientAreaSourceNotification[];
}

function toIsoString(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function getProjectTitle(job: ClientAreaSourceJob): string {
  return job.briefText?.trim() || [job.platform, job.type].filter(Boolean).join(' ') || 'Proyecto sin título';
}

export function buildClientAreaSnapshot({
  client,
  jobs,
  invoices,
  notifications,
}: BuildClientAreaSnapshotInput): ClientAreaSnapshot {
  const snapshot = createEmptyClientAreaSnapshot();

  snapshot.account = {
    label: client.company?.trim() || client.name,
    supportEmail: 'hola@grandeandgordo.com',
  };

  snapshot.projects = jobs.map((job) => ({
    id: job.id,
    title: getProjectTitle(job),
    status: job.status,
    dueAt: toIsoString(job.dueAt),
  }));

  snapshot.billing.invoices = invoices.map((invoice) => ({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    totalCents: invoice.totalCents,
    issueDate: invoice.issueDate.toISOString(),
    dueDate: invoice.dueDate.toISOString(),
  }));

  const projectTimeline = jobs.map((job) => ({
    id: job.id,
    kind: 'project',
    label: getProjectTitle(job),
    occurredAt: job.updatedAt.getTime(),
  }));

  const invoiceTimeline = invoices.map((invoice) => ({
    id: invoice.id,
    kind: 'invoice',
    label: `Factura ${invoice.invoiceNumber}`,
    occurredAt: invoice.createdAt.getTime(),
  }));

  const notificationTimeline = notifications.map((notification) => ({
    id: notification.id,
    kind: 'notification',
    label: notification.title,
    occurredAt: notification.createdAt.getTime(),
  }));

  snapshot.timeline = [...notificationTimeline, ...invoiceTimeline, ...projectTimeline]
    .sort((left, right) => right.occurredAt - left.occurredAt)
    .map(({ occurredAt: _occurredAt, ...item }) => item);

  return snapshot;
}
