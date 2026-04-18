import { desc, eq } from 'drizzle-orm';

import { schema, type Database } from '../../../db/index.js';
import {
  buildClientAreaSnapshot,
  type ClientAreaSourceClient,
  type ClientAreaSourceInvoice,
  type ClientAreaSourceJob,
  type ClientAreaSourceNotification,
} from './workspace-builder.js';

export interface LoadClientAreaWorkspaceInput {
  db: Database;
  userId: string;
}

export async function loadClientAreaWorkspace({
  db,
  userId,
}: LoadClientAreaWorkspaceInput) {
  const [client] = await db
    .select({
      id: schema.clients.id,
      userId: schema.clients.userId,
      name: schema.clients.name,
      email: schema.clients.email,
      company: schema.clients.company,
      subscriptionStatus: schema.clients.subscriptionStatus,
      datasetStatus: schema.clients.datasetStatus,
      createdAt: schema.clients.createdAt,
      updatedAt: schema.clients.updatedAt,
    })
    .from(schema.clients)
    .where(eq(schema.clients.userId, userId))
    .orderBy(desc(schema.clients.updatedAt), desc(schema.clients.createdAt))
    .limit(1);

  if (!client) {
    return null;
  }

  const [jobs, invoices, notifications] = await Promise.all([
    db
      .select({
        id: schema.jobs.id,
        clientId: schema.jobs.clientId,
        status: schema.jobs.status,
        briefText: schema.jobs.briefText,
        platform: schema.jobs.platform,
        type: schema.jobs.type,
        dueAt: schema.jobs.dueAt,
        unitsPlanned: schema.jobs.unitsPlanned,
        unitsConsumed: schema.jobs.unitsConsumed,
        createdAt: schema.jobs.createdAt,
        updatedAt: schema.jobs.updatedAt,
      })
      .from(schema.jobs)
      .where(eq(schema.jobs.clientId, client.id))
      .orderBy(desc(schema.jobs.updatedAt)),
    db
      .select({
        id: schema.invoices.id,
        clientId: schema.invoices.clientId,
        invoiceNumber: schema.invoices.invoiceNumber,
        issueDate: schema.invoices.issueDate,
        dueDate: schema.invoices.dueDate,
        totalCents: schema.invoices.totalCents,
        status: schema.invoices.status,
        createdAt: schema.invoices.createdAt,
        updatedAt: schema.invoices.updatedAt,
      })
      .from(schema.invoices)
      .where(eq(schema.invoices.clientId, client.id))
      .orderBy(desc(schema.invoices.createdAt)),
    db
      .select({
        id: schema.notifications.id,
        userId: schema.notifications.userId,
        type: schema.notifications.type,
        title: schema.notifications.title,
        message: schema.notifications.message,
        read: schema.notifications.read,
        relatedJobId: schema.notifications.relatedJobId,
        relatedInvoiceId: schema.notifications.relatedInvoiceId,
        createdAt: schema.notifications.createdAt,
        updatedAt: schema.notifications.updatedAt,
      })
      .from(schema.notifications)
      .where(eq(schema.notifications.userId, userId))
      .orderBy(desc(schema.notifications.createdAt)),
  ]);

  return buildClientAreaSnapshot({
    client: client as ClientAreaSourceClient,
    jobs: jobs as ClientAreaSourceJob[],
    invoices: invoices as ClientAreaSourceInvoice[],
    notifications: notifications as ClientAreaSourceNotification[],
  });
}
