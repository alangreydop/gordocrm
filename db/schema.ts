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

    // Campos fiscales (B2B)
    taxId: text('tax_id'), // CIF/NIF
    taxIdType: text('tax_id_type').default('NIF'), // NIF, CIF, NIE, VIES
    legalName: text('legal_name'), // Razón social
    addressLine1: text('address_line_1'),
    addressLine2: text('address_line_2'),
    city: text('city'),
    region: text('region'),
    postalCode: text('postal_code'),
    country: text('country').default('ES'),
    phone: text('phone'),
    registrationNumber: text('registration_number'), // Registro mercantil

    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(timestampNow),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(timestampNow),
  },
  (table) => [
    index('idx_clients_user_id').on(table.userId),
    index('idx_clients_next_review_at').on(table.nextReviewAt),
    index('idx_clients_tax_id').on(table.taxId),
    index('idx_clients_country').on(table.country),
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

    // The Vault - Semantic search fields
    description: text('description'), // AI-generated description
    tags: text('tags'), // JSON array of tags
    embedding: text('embedding'), // AI embedding vector (JSON array)
    dominantColors: text('dominant_colors'), // JSON array of dominant colors
    visualStyle: text('visual_style'), // e.g., "cinematic", "minimal", "hormozi"
    emotionalTone: text('emotional_tone'), // e.g., "energetic", "calm", "urgent"
    clientVisible: integer('client_visible', { mode: 'boolean' }).default(true), // Show in Vault

    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(timestampNow),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).$defaultFn(timestampNow),
  },
  (table) => [
    check('assets_type_check', sql`${table.type} IN ('image', 'video')`),
    check(
      'assets_status_check',
      sql`${table.status} IS NULL OR ${table.status} IN ('pending', 'approved', 'rejected')`,
    ),
    index('idx_assets_job_id').on(table.jobId),
    index('idx_assets_status').on(table.status),
    index('idx_assets_client_visible').on(table.clientVisible),
    index('idx_assets_created_at').on(table.createdAt),
  ],
);

export const briefSubmissions = sqliteTable(
  'brief_submissions',
  {
    id: text('id').primaryKey().$defaultFn(randomId),
    clientId: text('client_id').references(() => clients.id),
    email: text('email').notNull(),

    // Legacy field for backward compatibility
    contentType: text('content_type'),
    description: text('description'),

    // New conversational fields
    objective: text('objective'),
    hook: text('hook'),
    style: text('style'),
    audience: text('audience'),
    cta: text('cta'),
    optimizedBrief: text('optimized_brief'), // JSON string with AI-optimized brief
    chatHistory: text('chat_history'), // JSON string with full conversation

    status: text('status').notNull().default('new'),
    source: text('source').notNull().default('website'),
    sourcePage: text('source_page'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(timestampNow),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(timestampNow),
  },
  (table) => [
    check(
      'brief_submissions_content_type_check',
      sql`${table.contentType} IS NULL OR ${table.contentType} IN ('foto', 'video', 'ambos')`,
    ),
    check(
      'brief_submissions_status_check',
      sql`${table.status} IN ('new', 'reviewed', 'archived', 'in_progress')`,
    ),
    index('idx_brief_submissions_client_id').on(table.clientId),
    index('idx_brief_submissions_email').on(table.email),
    index('idx_brief_submissions_created_at').on(table.createdAt),
    index('idx_brief_submissions_status').on(table.status),
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

// ============================================
// Sistema de Facturación
// ============================================

export const invoices = sqliteTable('invoices', {
  id: text('id').primaryKey().$defaultFn(randomId),
  invoiceNumber: text('invoiceNumber').notNull().unique(),
  series: text('series').notNull().default('F'),
  fiscalYear: integer('fiscalYear').notNull(),

  clientId: text('clientId')
    .notNull()
    .references(() => clients.id),
  clientTaxId: text('clientTaxId').notNull(),
  clientLegalName: text('clientLegalName').notNull(),
  clientAddressLine1: text('clientAddressLine1').notNull(),
  clientAddressLine2: text('clientAddressLine2'),
  clientCity: text('clientCity').notNull(),
  clientRegion: text('clientRegion'),
  clientPostalCode: text('clientPostalCode').notNull(),
  clientCountry: text('clientCountry').default('ES'),
  clientEmail: text('clientEmail').notNull(),

  issuerTaxId: text('issuerTaxId').notNull(),
  issuerLegalName: text('issuerLegalName').notNull(),
  issuerAddressLine1: text('issuerAddressLine1').notNull(),
  issuerCity: text('issuerCity').notNull(),
  issuerPostalCode: text('issuerPostalCode').notNull(),
  issuerCountry: text('issuerCountry').default('ES'),
  issuerEmail: text('issuerEmail').notNull(),

  issueDate: integer('issueDate', { mode: 'timestamp_ms' }).notNull(),
  dueDate: integer('dueDate', { mode: 'timestamp_ms' }).notNull(),
  paidAt: integer('paidAt', { mode: 'timestamp_ms' }),

  description: text('description'),

  subtotalCents: integer('subtotalCents').notNull().default(0),
  taxRate: real('taxRate').notNull().default(0.21),
  taxAmountCents: integer('taxAmountCents').notNull().default(0),
  irpfRate: real('irpfRate'),
  irpfAmountCents: integer('irpfAmountCents'),
  totalCents: integer('totalCents').notNull().default(0),

  status: text('status').notNull().default('draft'),
  paymentMethod: text('paymentMethod'),
  paymentNotes: text('paymentNotes'),

  isRectificative: integer('isRectificative', { mode: 'boolean' }).default(false),
  rectificativeReason: text('rectificativeReason'),
  originalInvoiceId: text('originalInvoiceId').references(() => invoices.id),

  relatedJobIds: text('relatedJobIds'),

  notes: text('notes'),
  terms: text('terms'),
  footer: text('footer'),

  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull().$defaultFn(timestampNow),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull().$defaultFn(timestampNow),
});

export const invoiceItems = sqliteTable('invoice_items', {
  id: text('id').primaryKey().$defaultFn(randomId),
  invoiceId: text('invoiceId')
    .notNull()
    .references(() => invoices.id, { onDelete: 'cascade' }),

  description: text('description').notNull(),
  quantity: real('quantity').notNull().default(1),
  unitPriceCents: integer('unitPriceCents').notNull(),

  subtotalCents: integer('subtotalCents').notNull(),
  taxRate: real('taxRate').notNull().default(0.21),
  taxAmountCents: integer('taxAmountCents').notNull(),
  irpfRate: real('irpfRate'),
  irpfAmountCents: integer('irpfAmountCents'),
  totalCents: integer('totalCents').notNull(),

  sortOrder: integer('sortOrder').notNull().default(0),

  jobId: text('jobId').references(() => jobs.id),
  metadata: text('metadata'),

  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull().$defaultFn(timestampNow),
});

export const invoiceLogs = sqliteTable('invoice_logs', {
  id: text('id').primaryKey().$defaultFn(randomId),
  invoiceId: text('invoice_id')
    .notNull()
    .references(() => invoices.id, { onDelete: 'cascade' }),
  action: text('action').notNull(), // created, issued, sent, paid, cancelled, modified, emailed
  userId: text('user_id'),
  details: text('details'), // JSON
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(timestampNow),
});

// Tabla de configuración
export const config = sqliteTable('config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).$defaultFn(timestampNow),
});

// ============================================
// Sistema de Notificaciones
// ============================================

export const notifications = sqliteTable(
  'notifications',
  {
    id: text('id').primaryKey().$defaultFn(randomId),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    type: text('type').notNull(), // job_completed, job_updated, feedback_received, message, reminder
    title: text('title').notNull(),
    message: text('message').notNull(),
    read: integer('read').notNull().default(0),
    relatedJobId: text('related_job_id').references(() => jobs.id),
    relatedInvoiceId: text('related_invoice_id').references(() => invoices.id),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(timestampNow),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).$defaultFn(timestampNow),
  },
  (table) => [
    index('idx_notifications_user_id').on(table.userId),
    index('idx_notifications_read').on(table.read),
    index('idx_notifications_created_at').on(table.createdAt),
  ],
);

export const clientReviews = sqliteTable(
  'client_reviews',
  {
    id: text('id').primaryKey().$defaultFn(randomId),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id),
    jobId: text('job_id').references(() => jobs.id),
    assetId: text('asset_id').references(() => assets.id),
    title: text('title').notNull(),
    summary: text('summary'),
    status: text('status').notNull().default('needs_review'),
    requestedAt: integer('requested_at', { mode: 'timestamp_ms' }).notNull(),
    dueAt: integer('due_at', { mode: 'timestamp_ms' }),
    decisionNote: text('decision_note'),
    decidedByUserId: text('decided_by_user_id').references(() => users.id),
    decidedAt: integer('decided_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(timestampNow),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(timestampNow),
  },
  (table) => [
    check(
      'client_reviews_status_check',
      sql`${table.status} IN ('needs_review', 'approved', 'changes_requested')`,
    ),
    index('idx_client_reviews_client_id').on(table.clientId),
    index('idx_client_reviews_job_id').on(table.jobId),
    index('idx_client_reviews_status').on(table.status),
  ],
);

export const clientThreads = sqliteTable(
  'client_threads',
  {
    id: text('id').primaryKey().$defaultFn(randomId),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id),
    jobId: text('job_id').references(() => jobs.id),
    subject: text('subject').notNull(),
    status: text('status').notNull().default('active'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(timestampNow),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(timestampNow),
  },
  (table) => [
    check('client_threads_status_check', sql`${table.status} IN ('active', 'closed')`),
    index('idx_client_threads_client_id').on(table.clientId),
    index('idx_client_threads_job_id').on(table.jobId),
    index('idx_client_threads_updated_at').on(table.updatedAt),
  ],
);

export const clientMessages = sqliteTable(
  'client_messages',
  {
    id: text('id').primaryKey().$defaultFn(randomId),
    threadId: text('thread_id')
      .notNull()
      .references(() => clientThreads.id, { onDelete: 'cascade' }),
    authorUserId: text('author_user_id').references(() => users.id),
    authorRole: text('author_role').notNull(),
    body: text('body').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(timestampNow),
    readAt: integer('read_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    check('client_messages_author_role_check', sql`${table.authorRole} IN ('client', 'studio')`),
    index('idx_client_messages_thread_id').on(table.threadId),
    index('idx_client_messages_author_user_id').on(table.authorUserId),
    index('idx_client_messages_created_at').on(table.createdAt),
  ],
);
