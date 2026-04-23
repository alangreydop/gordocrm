import { desc, eq, like, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { schema } from '../../../../db/index.js';
import { requireAdmin } from '../../../lib/auth.js';
import type { AppContext } from '../../../types/index.js';

export const searchRoutes = new Hono<AppContext>();

searchRoutes.use('*', requireAdmin);

searchRoutes.get('/', async (c) => {
  const q = c.req.query('q')?.trim();

  if (!q || q.length === 0) {
    return c.json({ clients: [], jobs: [], briefs: [], invoices: [] });
  }

  const db = c.get('db');
  const pattern = `%${q}%`;

  const [clients, jobs, briefs, invoices] = await Promise.all([
    db
      .select({
        id: schema.clients.id,
        name: schema.clients.name,
        company: schema.clients.company,
        email: schema.clients.email,
      })
      .from(schema.clients)
      .where(
        or(
          like(schema.clients.name, pattern),
          like(schema.clients.company, pattern),
          like(schema.clients.email, pattern),
        ),
      )
      .limit(5),
    db
      .select({
        id: schema.jobs.id,
        briefText: schema.jobs.briefText,
        status: schema.jobs.status,
        clientId: schema.jobs.clientId,
        clientName: sql<string>`(select name from clients where clients.id = jobs.client_id)`,
      })
      .from(schema.jobs)
      .where(like(schema.jobs.briefText, pattern))
      .limit(5),
    db
      .select({
        id: schema.briefSubmissions.id,
        email: schema.briefSubmissions.email,
        tipo: schema.briefSubmissions.contentType,
        status: schema.briefSubmissions.status,
        clientId: schema.briefSubmissions.clientId,
        clientName: schema.clients.name,
      })
      .from(schema.briefSubmissions)
      .leftJoin(schema.clients, eq(schema.clients.id, schema.briefSubmissions.clientId))
      .where(
        or(
          like(schema.briefSubmissions.email, pattern),
          like(schema.briefSubmissions.description, pattern),
        ),
      )
      .orderBy(desc(schema.briefSubmissions.createdAt))
      .limit(5),
    db
      .select({
        id: schema.invoices.id,
        invoiceNumber: schema.invoices.invoiceNumber,
        clientLegalName: schema.invoices.clientLegalName,
        status: schema.invoices.status,
        totalCents: schema.invoices.totalCents,
      })
      .from(schema.invoices)
      .where(
        or(
          like(schema.invoices.invoiceNumber, pattern),
          like(schema.invoices.clientLegalName, pattern),
          like(schema.invoices.description, pattern),
        ),
      )
      .orderBy(desc(schema.invoices.createdAt))
      .limit(5),
  ]);

  return c.json({ clients, jobs, briefs, invoices });
});
