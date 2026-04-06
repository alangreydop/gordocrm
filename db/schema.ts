import { sql } from 'drizzle-orm';
import { check, index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
    plan: text('plan'),
    accountManager: text('account_manager'),
    monthlyUnitCapacity: integer('monthly_unit_capacity'),
    datasetStatus: text('dataset_status').notNull().default('pending_capture'),
    segment: text('segment'),
    marginProfile: text('margin_profile'),
    notes: text('notes'),
    nextReviewAt: integer('next_review_at', { mode: 'timestamp_ms' }),
    lastContactedAt: integer('last_contacted_at', { mode: 'timestamp_ms' }),
    onboardingCompletedAt: integer('onboarding_completed_at', { mode: 'timestamp_ms' }),
    firstSessionAt: integer('first_session_at', { mode: 'timestamp_ms' }),
    externalClientId: text('external_client_id'), // ID en otros sistemas
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(timestampNow),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(timestampNow),
  },
  (table) => [
    index('idx_clients_user_id').on(table.userId),
    index('idx_clients_next_review_at').on(table.nextReviewAt),
  ],
);

export const jobs = sqliteTable(
  'jobs',
  {
    id: text('id').primaryKey().$defaultFn(randomId),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id),
    externalJobId: text('external_job_id'), // ID en AI Engine
    status: text('status').notNull().default('pending'),
    briefText: text('brief_text'),
    platform: text('platform'),
    type: text('type'),
    loraModelId: text('lora_model_id'),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    dueAt: integer('due_at', { mode: 'timestamp_ms' }),
    unitsPlanned: integer('units_planned').notNull().default(0),
    unitsConsumed: integer('units_consumed').notNull().default(0),
    aiCostEstimated: real('ai_cost_estimated'),
    aiCostReal: real('ai_cost_real'),
    grossMarginEstimated: real('gross_margin_estimated'),
    clientSegment: text('client_segment'),
    marginProfile: text('margin_profile'),
    assetDominant: text('asset_dominant'),
    legalRisk: text('legal_risk'),
    turnaround: text('turnaround'),
    portabilityRequired: text('portability_required'),
    structuralDemand: text('structural_demand'),
    benchmarkLevel: text('benchmark_level'),
    stackLane: text('stack_lane'),
    stackCandidate1: text('stack_candidate_1'),
    stackCandidate2: text('stack_candidate_2'),
    stackCandidate3: text('stack_candidate_3'),
    stackWinner: text('stack_winner'),
    stackSnapshot: text('stack_snapshot'),
    clientGoal: text('client_goal'),
    internalNotes: text('internal_notes'),
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
    check('jobs_type_check', sql`${table.type} IS NULL OR ${table.type} IN ('image', 'video')`),
    index('idx_jobs_client_id').on(table.clientId),
    index('idx_jobs_status').on(table.status),
    index('idx_jobs_due_at').on(table.dueAt),
    index('idx_jobs_stack_lane').on(table.stackLane),
  ],
);

export const assets = sqliteTable(
  'assets',
  {
    id: text('id').primaryKey().$defaultFn(randomId),
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id),
    label: text('label'),
    type: text('type').notNull(),
    r2Key: text('r2_key').notNull(),
    deliveryUrl: text('delivery_url'),
    status: text('status').notNull().default('pending'), // pending, approved, rejected
    metadata: text('metadata'), // JSON string con metadata del asset
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(timestampNow),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).$defaultFn(timestampNow),
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

export const briefSubmissions = sqliteTable(
  'brief_submissions',
  {
    id: text('id').primaryKey().$defaultFn(randomId),
    clientId: text('client_id').references(() => clients.id),
    email: text('email').notNull(),
    contentType: text('content_type').notNull(),
    description: text('description').notNull(),
    status: text('status').notNull().default('new'),
    source: text('source').notNull().default('website'),
    sourcePage: text('source_page'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(timestampNow),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(timestampNow),
  },
  (table) => [
    check(
      'brief_submissions_content_type_check',
      sql`${table.contentType} IN ('foto', 'video', 'ambos')`,
    ),
    check(
      'brief_submissions_status_check',
      sql`${table.status} IN ('new', 'reviewed', 'archived')`,
    ),
    index('idx_brief_submissions_client_id').on(table.clientId),
    index('idx_brief_submissions_email').on(table.email),
    index('idx_brief_submissions_created_at').on(table.createdAt),
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
