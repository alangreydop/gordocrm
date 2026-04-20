import { and, desc, eq, inArray } from 'drizzle-orm';

import { schema, type Database } from '../../../db/index.js';
import {
  type ClientAreaSourceAsset,
  buildClientAreaSnapshot,
  type ClientAreaSourceClient,
  type ClientAreaSourceInvoice,
  type ClientAreaSourceJob,
  type ClientAreaSourceMessage,
  type ClientAreaSourceNotification,
  type ClientAreaSourceReview,
  type ClientAreaSourceThread,
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

  const [jobs, invoices, notifications, reviews, threads] = await Promise.all([
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
    db
      .select({
        id: schema.clientReviews.id,
        clientId: schema.clientReviews.clientId,
        jobId: schema.clientReviews.jobId,
        assetId: schema.clientReviews.assetId,
        title: schema.clientReviews.title,
        summary: schema.clientReviews.summary,
        status: schema.clientReviews.status,
        requestedAt: schema.clientReviews.requestedAt,
        dueAt: schema.clientReviews.dueAt,
        decisionNote: schema.clientReviews.decisionNote,
        updatedAt: schema.clientReviews.updatedAt,
      })
      .from(schema.clientReviews)
      .where(eq(schema.clientReviews.clientId, client.id))
      .orderBy(desc(schema.clientReviews.requestedAt)),
    db
      .select({
        id: schema.clientThreads.id,
        clientId: schema.clientThreads.clientId,
        jobId: schema.clientThreads.jobId,
        subject: schema.clientThreads.subject,
        status: schema.clientThreads.status,
        createdAt: schema.clientThreads.createdAt,
        updatedAt: schema.clientThreads.updatedAt,
      })
      .from(schema.clientThreads)
      .where(eq(schema.clientThreads.clientId, client.id))
      .orderBy(desc(schema.clientThreads.updatedAt)),
  ]);

  const jobIds = jobs.map((job) => job.id);
  const threadIds = threads.map((thread) => thread.id);

  const [assets, messages] = await Promise.all([
    jobIds.length > 0
      ? db
          .select({
            id: schema.assets.id,
            jobId: schema.assets.jobId,
            label: schema.assets.label,
            type: schema.assets.type,
            deliveryUrl: schema.assets.deliveryUrl,
            status: schema.assets.status,
            createdAt: schema.assets.createdAt,
            updatedAt: schema.assets.updatedAt,
          })
          .from(schema.assets)
          .where(
            and(
              inArray(schema.assets.jobId, jobIds),
              eq(schema.assets.clientVisible, true),
            ),
          )
          .orderBy(desc(schema.assets.createdAt))
      : Promise.resolve([]),
    threadIds.length > 0
      ? db
          .select({
            id: schema.clientMessages.id,
            threadId: schema.clientMessages.threadId,
            authorRole: schema.clientMessages.authorRole,
            body: schema.clientMessages.body,
            createdAt: schema.clientMessages.createdAt,
            readAt: schema.clientMessages.readAt,
          })
          .from(schema.clientMessages)
          .where(inArray(schema.clientMessages.threadId, threadIds))
          .orderBy(desc(schema.clientMessages.createdAt))
      : Promise.resolve([]),
  ]);

  return buildClientAreaSnapshot({
    client: client as ClientAreaSourceClient,
    jobs: jobs as ClientAreaSourceJob[],
    invoices: invoices as ClientAreaSourceInvoice[],
    notifications: notifications as ClientAreaSourceNotification[],
    assets: assets as ClientAreaSourceAsset[],
    reviews: reviews as ClientAreaSourceReview[],
    threads: threads as ClientAreaSourceThread[],
    messages: messages as ClientAreaSourceMessage[],
  });
}
