import { z } from 'zod';

const configSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // PostgreSQL (Supabase) — required for CRM portal
  DATABASE_URL: z.string(),

  // Stripe (optional — needed for payments)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // fal.ai (optional — needed for AI generation)
  FAL_KEY: z.string().optional(),

  // OpenAI (optional — needed for GPT-4V QA)
  OPENAI_API_KEY: z.string().optional(),

  // Cloudflare R2 (optional — needed for asset storage)
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  R2_PUBLIC_URL: z.string().optional(),

  // Airtable (optional — legacy, migrating to PostgreSQL)
  AIRTABLE_API_KEY: z.string().optional(),
  AIRTABLE_BASE_ID: z.string().optional(),

  // Redis (optional — needed for BullMQ job queues)
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Email (optional — needed for transactional emails)
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('noreply@grandegordo.com'),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  const result = configSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Missing required environment variables: ${missing}`);
  }
  return result.data;
}

export const config = loadConfig();
