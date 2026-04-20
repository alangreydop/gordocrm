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

export interface ClientAreaSourceAsset {
  id: string;
  jobId: string;
  label: string | null;
  type: 'image' | 'video';
  deliveryUrl: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date | null;
}

export interface ClientAreaSourceReview {
  id: string;
  clientId: string;
  jobId: string | null;
  assetId: string | null;
  title: string;
  summary: string | null;
  status: 'needs_review' | 'approved' | 'changes_requested';
  requestedAt: Date;
  dueAt: Date | null;
  decisionNote: string | null;
  updatedAt: Date;
}

export interface ClientAreaSourceThread {
  id: string;
  clientId: string;
  jobId: string | null;
  subject: string;
  status: 'active' | 'closed';
  createdAt: Date;
  updatedAt: Date;
}

export interface ClientAreaSourceMessage {
  id: string;
  threadId: string;
  authorRole: 'client' | 'studio';
  body: string;
  createdAt: Date;
  readAt: Date | null;
}

export interface BuildClientAreaSnapshotInput {
  client: ClientAreaSourceClient;
  jobs: ClientAreaSourceJob[];
  invoices: ClientAreaSourceInvoice[];
  notifications: ClientAreaSourceNotification[];
  assets: ClientAreaSourceAsset[];
  reviews: ClientAreaSourceReview[];
  threads: ClientAreaSourceThread[];
  messages: ClientAreaSourceMessage[];
}

function toIsoString(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function getProjectTitle(job: ClientAreaSourceJob): string {
  return job.briefText?.trim() || [job.platform, job.type].filter(Boolean).join(' ') || 'Proyecto sin título';
}

function resolveActiveProjectId(jobs: ClientAreaSourceJob[]): string | null {
  const activeJob = jobs.find((job) => ['pending', 'processing', 'delivered'].includes(job.status));
  return activeJob?.id ?? jobs[0]?.id ?? null;
}

function resolveNextInvoiceId(invoices: ClientAreaSourceInvoice[]): string | null {
  const nextInvoice = invoices.find((invoice) => invoice.status !== 'paid');
  return nextInvoice?.id ?? invoices[0]?.id ?? null;
}

function trimPreview(value: string): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
}

export function buildClientAreaSnapshot({
  client,
  jobs,
  invoices,
  notifications,
  assets,
  reviews,
  threads,
  messages,
}: BuildClientAreaSnapshotInput): ClientAreaSnapshot {
  const snapshot = createEmptyClientAreaSnapshot();
  const projectTitleById = new Map(jobs.map((job) => [job.id, getProjectTitle(job)]));
  const messagesByThread = new Map<string, ClientAreaSourceMessage[]>();

  for (const message of messages) {
    const threadMessages = messagesByThread.get(message.threadId);
    if (threadMessages) {
      threadMessages.push(message);
    } else {
      messagesByThread.set(message.threadId, [message]);
    }
  }

  snapshot.account = {
    id: client.id,
    label: client.company?.trim() || client.name,
    company: client.company,
    supportEmail: 'hola@grandeandgordo.com',
    activeProjectId: resolveActiveProjectId(jobs),
  };

  snapshot.projects = jobs.map((job) => ({
    id: job.id,
    title: getProjectTitle(job),
    status: job.status,
    dueAt: toIsoString(job.dueAt),
    brief: job.briefText,
    platform: job.platform,
    type: job.type,
    unitsPlanned: job.unitsPlanned,
    unitsConsumed: job.unitsConsumed,
  }));

  snapshot.reviews = reviews.map((review) => ({
    id: review.id,
    projectId: review.jobId,
    assetId: review.assetId,
    title: review.title,
    summary: review.summary,
    status: review.status,
    requestedAt: review.requestedAt.toISOString(),
    dueAt: toIsoString(review.dueAt),
    decisionNote: review.decisionNote,
  }));

  snapshot.files = assets.map((asset) => ({
    id: asset.id,
    projectId: asset.jobId,
    title: asset.label?.trim() || projectTitleById.get(asset.jobId) || 'Entrega disponible',
    category: asset.deliveryUrl ? 'deliverable' : 'reference',
    kind: asset.type,
    href: asset.deliveryUrl,
    status: asset.status,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: toIsoString(asset.updatedAt),
  }));

  snapshot.messages = threads.map((thread) => {
    const threadMessages = messagesByThread.get(thread.id) ?? [];
    const lastMessage = threadMessages[0];
    const unreadCount = threadMessages.filter(
      (message) => message.authorRole === 'studio' && !message.readAt,
    ).length;

    return {
      id: thread.id,
      projectId: thread.jobId,
      subject: thread.subject,
      status: thread.status,
      lastMessagePreview: lastMessage
        ? trimPreview(lastMessage.body)
        : 'Todavía no hay mensajes en este hilo.',
      lastMessageAt: (lastMessage?.createdAt ?? thread.updatedAt).toISOString(),
      unreadCount,
      participants: ['Equipo G&G', client.company?.trim() || client.name],
      latestAuthorRole: lastMessage?.authorRole ?? null,
    };
  });

  snapshot.billing.invoices = invoices.map((invoice) => ({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    totalCents: invoice.totalCents,
    issueDate: invoice.issueDate.toISOString(),
    dueDate: invoice.dueDate.toISOString(),
  }));
  snapshot.billing.nextInvoiceId = resolveNextInvoiceId(invoices);

  const projectTimeline = jobs.map((job) => ({
    id: job.id,
    kind: 'project',
    label: getProjectTitle(job),
    occurredAt: job.updatedAt.toISOString(),
  }));

  const invoiceTimeline = invoices.map((invoice) => ({
    id: invoice.id,
    kind: 'invoice',
    label: `Factura ${invoice.invoiceNumber}`,
    occurredAt: invoice.createdAt.toISOString(),
  }));

  const notificationTimeline = notifications.map((notification) => ({
    id: notification.id,
    kind: 'notification',
    label: notification.title,
    occurredAt: notification.createdAt.toISOString(),
  }));

  const reviewTimeline = reviews.map((review) => ({
    id: review.id,
    kind: 'review',
    label: `Revisión · ${review.title}`,
    occurredAt: review.updatedAt.toISOString(),
  }));

  const messageTimeline = threads.map((thread) => ({
    id: thread.id,
    kind: 'message',
    label: thread.subject,
    occurredAt: thread.updatedAt.toISOString(),
  }));

  snapshot.timeline = [
    ...notificationTimeline,
    ...messageTimeline,
    ...reviewTimeline,
    ...invoiceTimeline,
    ...projectTimeline,
  ].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));

  return snapshot;
}
