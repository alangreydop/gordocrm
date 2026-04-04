import { z } from 'zod';
import type { AppBindings } from '../types/index.js';

const DEFAULT_CORS_ORIGIN = 'http://localhost:4321';
const DEFAULT_SESSION_SECRET = 'local-development-session-secret';

const configSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CORS_ORIGIN: z.string().default(DEFAULT_CORS_ORIGIN),
  SESSION_SECRET: z.string().min(16).default(DEFAULT_SESSION_SECRET),
  SESSION_COOKIE_DOMAIN: z.string().optional(),
  API_URL: z.string().url().optional(),
  PUBLIC_API_URL: z.string().url().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  FAL_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  R2_PUBLIC_URL: z.string().optional(),
  AIRTABLE_API_KEY: z.string().optional(),
  AIRTABLE_BASE_ID: z.string().optional(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('noreply@grandegordo.com'),
});

export type AppConfig = z.infer<typeof configSchema>;

export function getConfig(env: AppBindings): AppConfig {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const missing = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid worker configuration: ${missing}`);
  }

  const config = result.data;
  if (
    config.APP_ENV === 'production' &&
    config.SESSION_SECRET === DEFAULT_SESSION_SECRET
  ) {
    throw new Error(
      'SESSION_SECRET must be overridden in production before deploying the API worker.',
    );
  }

  if (
    config.APP_ENV === 'production' &&
    config.CORS_ORIGIN === DEFAULT_CORS_ORIGIN
  ) {
    throw new Error(
      'CORS_ORIGIN must point to the deployed portal origin in production.',
    );
  }

  return config;
}

export function getAllowedOrigins(env: AppBindings): string[] {
  const config = getConfig(env);
  const configuredOrigins = config.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (config.APP_ENV === 'production') {
    return [...new Set(configuredOrigins)];
  }

  return [
    ...new Set([
      ...configuredOrigins,
      'http://localhost:4321',
      'http://127.0.0.1:4321',
    ]),
  ];
}

export function isProduction(env: AppBindings): boolean {
  return getConfig(env).APP_ENV === 'production';
}
