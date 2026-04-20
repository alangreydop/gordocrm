import { describe, expect, it } from 'vitest';

import { buildClientAreaSnapshot } from '../../lib/client-area/workspace-builder';
import type {
  BuildClientAreaSnapshotInput,
  ClientAreaSourceAsset,
  ClientAreaSourceClient,
  ClientAreaSourceInvoice,
  ClientAreaSourceJob,
  ClientAreaSourceMessage,
  ClientAreaSourceNotification,
  ClientAreaSourceReview,
  ClientAreaSourceThread,
} from '../../lib/client-area/workspace-builder';

function makeClient(overrides: Partial<ClientAreaSourceClient> = {}): ClientAreaSourceClient {
  return {
    id: 'client-1',
    userId: 'user-123',
    name: 'Client User',
    email: 'client@example.com',
    company: 'Acme Co',
    subscriptionStatus: 'active',
    datasetStatus: 'active',
    createdAt: new Date('2026-04-01T08:00:00.000Z'),
    updatedAt: new Date('2026-04-02T09:00:00.000Z'),
    ...overrides,
  };
}

function makeJob(overrides: Partial<ClientAreaSourceJob> = {}): ClientAreaSourceJob {
  return {
    id: 'job-1',
    clientId: 'client-1',
    status: 'processing',
    briefText: 'Campaign launch stills',
    platform: 'instagram',
    type: 'image',
    dueAt: new Date('2026-04-30T12:00:00.000Z'),
    unitsPlanned: 12,
    unitsConsumed: 4,
    createdAt: new Date('2026-04-10T10:00:00.000Z'),
    updatedAt: new Date('2026-04-15T10:00:00.000Z'),
    ...overrides,
  };
}

function makeInvoice(overrides: Partial<ClientAreaSourceInvoice> = {}): ClientAreaSourceInvoice {
  return {
    id: 'invoice-1',
    clientId: 'client-1',
    invoiceNumber: 'F2026-001',
    issueDate: new Date('2026-04-05T00:00:00.000Z'),
    dueDate: new Date('2026-04-20T00:00:00.000Z'),
    totalCents: 155000,
    status: 'issued',
    createdAt: new Date('2026-04-05T00:00:00.000Z'),
    updatedAt: new Date('2026-04-05T00:00:00.000Z'),
    ...overrides,
  };
}

function makeNotification(overrides: Partial<ClientAreaSourceNotification> = {}): ClientAreaSourceNotification {
  return {
    id: 'notification-1',
    userId: 'user-123',
    type: 'job_updated',
    title: 'Campaign updated',
    message: 'New previews are ready',
    read: 0,
    relatedJobId: 'job-1',
    relatedInvoiceId: null,
    createdAt: new Date('2026-04-16T10:00:00.000Z'),
    updatedAt: new Date('2026-04-16T10:00:00.000Z'),
    ...overrides,
  };
}

function makeAsset(overrides: Partial<ClientAreaSourceAsset> = {}): ClientAreaSourceAsset {
  return {
    id: 'asset-1',
    jobId: 'job-1',
    label: 'Pack final',
    type: 'image',
    deliveryUrl: 'https://cdn.grandeandgordo.com/asset-1.jpg',
    status: 'approved',
    createdAt: new Date('2026-04-16T12:00:00.000Z'),
    updatedAt: new Date('2026-04-16T12:30:00.000Z'),
    ...overrides,
  };
}

function makeReview(overrides: Partial<ClientAreaSourceReview> = {}): ClientAreaSourceReview {
  return {
    id: 'review-1',
    clientId: 'client-1',
    jobId: 'job-1',
    assetId: 'asset-1',
    title: 'Hero v3',
    summary: 'Revisa el encuadre final.',
    status: 'needs_review',
    requestedAt: new Date('2026-04-16T11:00:00.000Z'),
    dueAt: new Date('2026-04-18T12:00:00.000Z'),
    decisionNote: null,
    updatedAt: new Date('2026-04-16T11:00:00.000Z'),
    ...overrides,
  };
}

function makeThread(overrides: Partial<ClientAreaSourceThread> = {}): ClientAreaSourceThread {
  return {
    id: 'thread-1',
    clientId: 'client-1',
    jobId: 'job-1',
    subject: 'Entrega semanal',
    status: 'active',
    createdAt: new Date('2026-04-15T09:00:00.000Z'),
    updatedAt: new Date('2026-04-16T09:30:00.000Z'),
    ...overrides,
  };
}

function makeMessage(overrides: Partial<ClientAreaSourceMessage> = {}): ClientAreaSourceMessage {
  return {
    id: 'message-1',
    threadId: 'thread-1',
    authorRole: 'studio',
    body: 'Te dejamos la entrega semanal lista para revisar.',
    createdAt: new Date('2026-04-16T09:30:00.000Z'),
    readAt: null,
    ...overrides,
  };
}

function buildMinimalSnapshot(overrides: Partial<BuildClientAreaSnapshotInput> = {}): ReturnType<typeof buildClientAreaSnapshot> {
  return buildClientAreaSnapshot({
    client: makeClient(),
    jobs: [],
    invoices: [],
    notifications: [],
    assets: [],
    reviews: [],
    threads: [],
    messages: [],
    ...overrides,
  });
}

describe('buildClientAreaSnapshot', () => {
  describe('empty input arrays', () => {
    it('produces a valid snapshot when all arrays are empty', () => {
      const snapshot = buildMinimalSnapshot();

      expect(snapshot.projects).toEqual([]);
      expect(snapshot.reviews).toEqual([]);
      expect(snapshot.files).toEqual([]);
      expect(snapshot.messages).toEqual([]);
      expect(snapshot.billing.invoices).toEqual([]);
      expect(snapshot.billing.nextInvoiceId).toBeNull();
      expect(snapshot.timeline).toEqual([]);
    });

    it('sets account.activeProjectId to null when there are no jobs', () => {
      const snapshot = buildMinimalSnapshot();

      expect(snapshot.account.activeProjectId).toBeNull();
    });
  });

  describe('account snapshot', () => {
    it('uses client.company as label when company is present', () => {
      const snapshot = buildMinimalSnapshot({
        client: makeClient({ company: 'TestCorp' }),
      });

      expect(snapshot.account.label).toBe('TestCorp');
    });

    it('falls back to client.name when company is null', () => {
      const snapshot = buildMinimalSnapshot({
        client: makeClient({ company: null, name: 'Maria Lopez' }),
      });

      expect(snapshot.account.label).toBe('Maria Lopez');
    });

    it('falls back to client.name when company is whitespace-only', () => {
      const snapshot = buildMinimalSnapshot({
        client: makeClient({ company: '   ', name: 'Maria Lopez' }),
      });

      expect(snapshot.account.label).toBe('Maria Lopez');
    });

    it('preserves the company field even when label falls back to name', () => {
      const snapshot = buildMinimalSnapshot({
        client: makeClient({ company: null }),
      });

      expect(snapshot.account.company).toBeNull();
    });

    it('sets the support email to the known address', () => {
      const snapshot = buildMinimalSnapshot();

      expect(snapshot.account.supportEmail).toBe('hola@grandeandgordo.com');
    });

    it('carries the client id into account', () => {
      const snapshot = buildMinimalSnapshot({
        client: makeClient({ id: 'client-42' }),
      });

      expect(snapshot.account.id).toBe('client-42');
    });
  });

  describe('active project resolution', () => {
    it('picks the first job with status pending, processing, or delivered', () => {
      const snapshot = buildMinimalSnapshot({
        jobs: [
          makeJob({ id: 'job-completed', status: 'completed' }),
          makeJob({ id: 'job-active', status: 'processing' }),
        ],
      });

      expect(snapshot.account.activeProjectId).toBe('job-active');
    });

    it('picks a pending job as the active project', () => {
      const snapshot = buildMinimalSnapshot({
        jobs: [makeJob({ id: 'job-pending', status: 'pending' })],
      });

      expect(snapshot.account.activeProjectId).toBe('job-pending');
    });

    it('picks a delivered job as the active project', () => {
      const snapshot = buildMinimalSnapshot({
        jobs: [makeJob({ id: 'job-delivered', status: 'delivered' })],
      });

      expect(snapshot.account.activeProjectId).toBe('job-delivered');
    });

    it('falls back to the first job when none are in an active status', () => {
      const snapshot = buildMinimalSnapshot({
        jobs: [
          makeJob({ id: 'job-completed', status: 'completed' }),
          makeJob({ id: 'job-failed', status: 'failed' }),
        ],
      });

      expect(snapshot.account.activeProjectId).toBe('job-completed');
    });
  });

  describe('project title resolution', () => {
    it('uses briefText as the title when present', () => {
      const snapshot = buildMinimalSnapshot({
        jobs: [makeJob({ briefText: 'Summer campaign' })],
      });

      expect(snapshot.projects[0].title).toBe('Summer campaign');
    });

    it('falls back to platform + type when briefText is null', () => {
      const snapshot = buildMinimalSnapshot({
        jobs: [makeJob({ briefText: null, platform: 'instagram', type: 'video' })],
      });

      expect(snapshot.projects[0].title).toBe('instagram video');
    });

    it('uses platform alone when type is null', () => {
      const snapshot = buildMinimalSnapshot({
        jobs: [makeJob({ briefText: null, platform: 'tiktok', type: null })],
      });

      expect(snapshot.projects[0].title).toBe('tiktok');
    });

    it('uses the default Spanish title when briefText, platform, and type are all null', () => {
      const snapshot = buildMinimalSnapshot({
        jobs: [makeJob({ briefText: null, platform: null, type: null })],
      });

      expect(snapshot.projects[0].title).toBe('Proyecto sin título');
    });

    it('trims whitespace from briefText before using it', () => {
      const snapshot = buildMinimalSnapshot({
        jobs: [makeJob({ briefText: '   ' })],
      });

      // Whitespace-only briefText is trimmed to empty string, falls back to platform+type
      expect(snapshot.projects[0].title).toBe('instagram image');
    });
  });

  describe('file category resolution', () => {
    it('marks an asset as deliverable when it has a deliveryUrl', () => {
      const snapshot = buildMinimalSnapshot({
        assets: [makeAsset({ deliveryUrl: 'https://cdn.example.com/file.jpg' })],
      });

      expect(snapshot.files[0].category).toBe('deliverable');
    });

    it('marks an asset as reference when deliveryUrl is null', () => {
      const snapshot = buildMinimalSnapshot({
        assets: [makeAsset({ deliveryUrl: null })],
      });

      expect(snapshot.files[0].category).toBe('reference');
    });

    it('uses the asset label as the file title when present', () => {
      const snapshot = buildMinimalSnapshot({
        assets: [makeAsset({ label: 'Final hero shot' })],
      });

      expect(snapshot.files[0].title).toBe('Final hero shot');
    });

    it('falls back to project title when asset label is null', () => {
      const snapshot = buildMinimalSnapshot({
        jobs: [makeJob({ briefText: 'Brand refresh' })],
        assets: [makeAsset({ label: null, jobId: 'job-1' })],
      });

      expect(snapshot.files[0].title).toBe('Brand refresh');
    });

    it('falls back to default Spanish title when label and project title are both unavailable', () => {
      const snapshot = buildMinimalSnapshot({
        assets: [makeAsset({ label: null, jobId: 'unknown-job' })],
      });

      expect(snapshot.files[0].title).toBe('Entrega disponible');
    });
  });

  describe('message thread unread count', () => {
    it('counts unread studio messages as unread', () => {
      const snapshot = buildMinimalSnapshot({
        threads: [makeThread()],
        messages: [
          makeMessage({ authorRole: 'studio', readAt: null }),
          makeMessage({ authorRole: 'client', readAt: null }),
          makeMessage({ authorRole: 'studio', readAt: new Date('2026-04-16T10:00:00.000Z') }),
        ],
      });

      expect(snapshot.messages[0].unreadCount).toBe(1);
    });

    it('returns zero unread when all studio messages are read', () => {
      const snapshot = buildMinimalSnapshot({
        threads: [makeThread()],
        messages: [
          makeMessage({ authorRole: 'studio', readAt: new Date('2026-04-16T10:00:00.000Z') }),
        ],
      });

      expect(snapshot.messages[0].unreadCount).toBe(0);
    });

    it('does not count client-authored messages as unread', () => {
      const snapshot = buildMinimalSnapshot({
        threads: [makeThread()],
        messages: [
          makeMessage({ authorRole: 'client', readAt: null }),
        ],
      });

      expect(snapshot.messages[0].unreadCount).toBe(0);
    });

    it('shows the default placeholder when a thread has no messages', () => {
      const snapshot = buildMinimalSnapshot({
        threads: [makeThread()],
        messages: [],
      });

      expect(snapshot.messages[0].lastMessagePreview).toBe(
        'Todavía no hay mensajes en este hilo.',
      );
    });

    it('trims and truncates long message bodies in the preview', () => {
      const longBody = 'A '.repeat(200);
      const snapshot = buildMinimalSnapshot({
        threads: [makeThread()],
        messages: [makeMessage({ body: longBody })],
      });

      expect(snapshot.messages[0].lastMessagePreview.length).toBeLessThanOrEqual(180);
      expect(snapshot.messages[0].lastMessagePreview).toMatch(/\.\.\.$/);
    });

    it('sets participants to studio team name and client name/company', () => {
      const snapshot = buildMinimalSnapshot({
        client: makeClient({ company: 'TestCorp' }),
        threads: [makeThread()],
        messages: [],
      });

      expect(snapshot.messages[0].participants).toEqual([
        'Equipo G&G',
        'TestCorp',
      ]);
    });

    it('uses client name in participants when company is null', () => {
      const snapshot = buildMinimalSnapshot({
        client: makeClient({ company: null, name: 'Ana' }),
        threads: [makeThread()],
        messages: [],
      });

      expect(snapshot.messages[0].participants).toEqual(['Equipo G&G', 'Ana']);
    });
  });

  describe('timeline sorting', () => {
    it('sorts timeline items by occurredAt in descending order', () => {
      const snapshot = buildMinimalSnapshot({
        jobs: [makeJob({ updatedAt: new Date('2026-04-10T10:00:00.000Z') })],
        invoices: [makeInvoice({ createdAt: new Date('2026-04-15T10:00:00.000Z') })],
        notifications: [makeNotification({ createdAt: new Date('2026-04-12T10:00:00.000Z') })],
        reviews: [makeReview({ updatedAt: new Date('2026-04-14T10:00:00.000Z') })],
        threads: [makeThread({ updatedAt: new Date('2026-04-16T10:00:00.000Z') })],
      });

      const occurredAtDates = snapshot.timeline.map((item) => item.occurredAt);
      for (let i = 1; i < occurredAtDates.length; i++) {
        expect(occurredAtDates[i - 1]! >= occurredAtDates[i]!).toBe(true);
      }

      expect(snapshot.timeline[0].id).toBe('thread-1');
      expect(snapshot.timeline[1].id).toBe('invoice-1');
    });

    it('includes all entity kinds in the timeline', () => {
      const snapshot = buildMinimalSnapshot({
        jobs: [makeJob()],
        invoices: [makeInvoice()],
        notifications: [makeNotification()],
        reviews: [makeReview()],
        threads: [makeThread()],
      });

      const kinds = new Set(snapshot.timeline.map((item) => item.kind));

      expect(kinds.has('project')).toBe(true);
      expect(kinds.has('invoice')).toBe(true);
      expect(kinds.has('notification')).toBe(true);
      expect(kinds.has('review')).toBe(true);
      expect(kinds.has('message')).toBe(true);
    });

    it('produces an empty timeline when all source arrays are empty', () => {
      const snapshot = buildMinimalSnapshot();

      expect(snapshot.timeline).toEqual([]);
    });

    it('uses review-specific label format', () => {
      const snapshot = buildMinimalSnapshot({
        reviews: [makeReview({ title: 'Hero shot' })],
      });

      expect(snapshot.timeline[0].label).toBe('Revisión · Hero shot');
    });

    it('uses invoice-specific label format', () => {
      const snapshot = buildMinimalSnapshot({
        invoices: [makeInvoice({ invoiceNumber: 'F2026-042' })],
      });

      expect(snapshot.timeline[0].label).toBe('Factura F2026-042');
    });
  });

  describe('billing snapshot', () => {
    it('resolves nextInvoiceId to the first unpaid invoice', () => {
      const snapshot = buildMinimalSnapshot({
        invoices: [
          makeInvoice({ id: 'inv-paid', status: 'paid' }),
          makeInvoice({ id: 'inv-unpaid', status: 'issued' }),
        ],
      });

      expect(snapshot.billing.nextInvoiceId).toBe('inv-unpaid');
    });

    it('falls back to the first invoice when all are paid', () => {
      const snapshot = buildMinimalSnapshot({
        invoices: [
          makeInvoice({ id: 'inv-first', status: 'paid' }),
          makeInvoice({ id: 'inv-second', status: 'paid' }),
        ],
      });

      expect(snapshot.billing.nextInvoiceId).toBe('inv-first');
    });

    it('returns null for nextInvoiceId when there are no invoices', () => {
      const snapshot = buildMinimalSnapshot();

      expect(snapshot.billing.nextInvoiceId).toBeNull();
    });
  });

  describe('date handling', () => {
    it('converts Date objects to ISO strings in projects', () => {
      const snapshot = buildMinimalSnapshot({
        jobs: [makeJob({ dueAt: new Date('2026-05-01T00:00:00.000Z') })],
      });

      expect(snapshot.projects[0].dueAt).toBe('2026-05-01T00:00:00.000Z');
    });

    it('converts null dates to null in projects', () => {
      const snapshot = buildMinimalSnapshot({
        jobs: [makeJob({ dueAt: null })],
      });

      expect(snapshot.projects[0].dueAt).toBeNull();
    });

    it('converts review dates to ISO strings', () => {
      const snapshot = buildMinimalSnapshot({
        reviews: [
          makeReview({
            requestedAt: new Date('2026-04-16T11:00:00.000Z'),
            dueAt: new Date('2026-04-18T12:00:00.000Z'),
          }),
        ],
      });

      expect(snapshot.reviews[0].requestedAt).toBe('2026-04-16T11:00:00.000Z');
      expect(snapshot.reviews[0].dueAt).toBe('2026-04-18T12:00:00.000Z');
    });

    it('handles null review dueAt', () => {
      const snapshot = buildMinimalSnapshot({
        reviews: [makeReview({ dueAt: null })],
      });

      expect(snapshot.reviews[0].dueAt).toBeNull();
    });
  });

  describe('multiple threads with messages', () => {
    it('maps messages to the correct thread', () => {
      const snapshot = buildMinimalSnapshot({
        threads: [
          makeThread({ id: 'thread-a' }),
          makeThread({ id: 'thread-b' }),
        ],
        messages: [
          makeMessage({ threadId: 'thread-a', body: 'Message for A' }),
          makeMessage({ threadId: 'thread-b', body: 'Message for B' }),
        ],
      });

      expect(snapshot.messages).toHaveLength(2);
      const threadA = snapshot.messages.find((m) => m.id === 'thread-a');
      const threadB = snapshot.messages.find((m) => m.id === 'thread-b');
      expect(threadA?.lastMessagePreview).toContain('Message for A');
      expect(threadB?.lastMessagePreview).toContain('Message for B');
    });

    it('counts unread per thread independently', () => {
      const snapshot = buildMinimalSnapshot({
        threads: [
          makeThread({ id: 'thread-a' }),
          makeThread({ id: 'thread-b' }),
        ],
        messages: [
          makeMessage({ threadId: 'thread-a', authorRole: 'studio', readAt: null }),
          makeMessage({ threadId: 'thread-a', authorRole: 'studio', readAt: null }),
          makeMessage({ threadId: 'thread-b', authorRole: 'studio', readAt: new Date('2026-04-16T10:00:00.000Z') }),
        ],
      });

      const threadA = snapshot.messages.find((m) => m.id === 'thread-a');
      const threadB = snapshot.messages.find((m) => m.id === 'thread-b');
      expect(threadA?.unreadCount).toBe(2);
      expect(threadB?.unreadCount).toBe(0);
    });
  });
});