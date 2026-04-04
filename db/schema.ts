import { pgTable, uuid, text, timestamp, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').unique().notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull(),
    name: text('name').notNull(),
    company: text('company'),
    stripeCustomerId: text('stripe_customer_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [check('role_check', sql`${table.role} IN ('admin', 'client')`)],
);

export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  name: text('name').notNull(),
  email: text('email').notNull(),
  company: text('company'),
  stripeCustomerId: text('stripe_customer_id'),
  subscriptionStatus: text('subscription_status').default('inactive'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id),
    status: text('status').notNull().default('pending'),
    briefText: text('brief_text'),
    platform: text('platform'),
    type: text('type'),
    loraModelId: text('lora_model_id'),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    check(
      'status_check',
      sql`${table.status} IN ('pending', 'processing', 'completed', 'failed', 'delivered')`,
    ),
    check(
      'platform_check',
      sql`${table.platform} IS NULL OR ${table.platform} IN ('instagram', 'tiktok', 'amazon_pdp', 'paid_ads')`,
    ),
    check(
      'type_check',
      sql`${table.type} IS NULL OR ${table.type} IN ('image', 'video')`,
    ),
  ],
);

export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id),
    type: text('type').notNull(),
    r2Key: text('r2_key').notNull(),
    qaStatus: text('qa_status'),
    qaNotes: text('qa_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    check(
      'asset_type_check',
      sql`${table.type} IN ('image', 'video')`,
    ),
    check(
      'qa_status_check',
      sql`${table.qaStatus} IS NULL OR ${table.qaStatus} IN ('pending', 'approved', 'rejected')`,
    ),
  ],
);

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  token: text('token').unique().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
