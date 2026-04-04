import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

const timestampNow = () => new Date();
const randomId = () => crypto.randomUUID();

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey().$defaultFn(randomId),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull(),
    name: text('name').notNull(),
    company: text('company'),
    stripeCustomerId: text('stripe_customer_id'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(timestampNow),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(timestampNow),
  },
  (table) => [check('users_role_check', sql`${table.role} IN ('admin', 'client')`)],
);

export const clients = sqliteTable(
  'clients',
  {
    id: text('id').primaryKey().$defaultFn(randomId),
    userId: text('user_id').references(() => users.id),
    name: text('name').notNull(),
    email: text('email').notNull(),
    company: text('company'),
    stripeCustomerId: text('stripe_customer_id'),
    subscriptionStatus: text('subscription_status').notNull().default('inactive'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(timestampNow),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(timestampNow),
  },
  (table) => [index('idx_clients_user_id').on(table.userId)],
);

export const jobs = sqliteTable(
  'jobs',
  {
    id: text('id').primaryKey().$defaultFn(randomId),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id),
    status: text('status').notNull().default('pending'),
    briefText: text('brief_text'),
    platform: text('platform'),
    type: text('type'),
    loraModelId: text('lora_model_id'),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(timestampNow),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(timestampNow),
  },
  (table) => [
    check(
      'jobs_status_check',
      sql`${table.status} IN ('pending', 'processing', 'completed', 'failed', 'delivered')`,
    ),
    check(
      'jobs_platform_check',
      sql`${table.platform} IS NULL OR ${table.platform} IN ('instagram', 'tiktok', 'amazon_pdp', 'paid_ads')`,
    ),
    check(
      'jobs_type_check',
      sql`${table.type} IS NULL OR ${table.type} IN ('image', 'video')`,
    ),
    index('idx_jobs_client_id').on(table.clientId),
    index('idx_jobs_status').on(table.status),
  ],
);

export const assets = sqliteTable(
  'assets',
  {
    id: text('id').primaryKey().$defaultFn(randomId),
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id),
    type: text('type').notNull(),
    r2Key: text('r2_key').notNull(),
    qaStatus: text('qa_status'),
    qaNotes: text('qa_notes'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(timestampNow),
  },
  (table) => [
    check('assets_type_check', sql`${table.type} IN ('image', 'video')`),
    check(
      'assets_qa_status_check',
      sql`${table.qaStatus} IS NULL OR ${table.qaStatus} IN ('pending', 'approved', 'rejected')`,
    ),
    index('idx_assets_job_id').on(table.jobId),
  ],
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey().$defaultFn(randomId),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    token: text('token').notNull().unique(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(timestampNow),
  },
  (table) => [
    index('idx_sessions_token').on(table.token),
    index('idx_sessions_user_id').on(table.userId),
    index('idx_sessions_expires_at').on(table.expiresAt),
  ],
);
