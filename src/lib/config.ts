import { z } from 'zod';

const configSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Stripe
  STRIPE_SECRET_KEY: z.string(),
  STRIPE_WEBHOOK_SECRET: z.string(),

  // fal.ai
  FAL_KEY: z.string(),

  // OpenAI (GPT-4V QA)
  OPENAI_API_KEY: z.string(),

  // Cloudflare R2
  R2_ACCOUNT_ID: z.string(),
  R2_ACCESS_KEY_ID: z.string(),
  R2_SECRET_ACCESS_KEY: z.string(),
  R2_BUCKET_NAME: z.string(),
  R2_PUBLIC_URL: z.string().optional(),

  // Airtable
  AIRTABLE_API_KEY: z.string(),
  AIRTABLE_BASE_ID: z.string(),

  // Redis (BullMQ)
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Email (Resend)
  RESEND_API_KEY: z.string(),
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
