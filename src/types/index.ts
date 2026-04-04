import type { Database } from '../../db/index.js';

export type UserRole = 'admin' | 'client';
export type ClientSubscriptionStatus = 'active' | 'inactive' | 'cancelled';
export type JobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'delivered';
export type JobPlatform = 'instagram' | 'tiktok' | 'amazon_pdp' | 'paid_ads';
export type AssetType = 'image' | 'video';
export type AssetQaStatus = 'pending' | 'approved' | 'rejected';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  company: string | null;
}

export interface AppBindings {
  DB: D1Database;
  APP_ENV?: 'development' | 'test' | 'production';
  CORS_ORIGIN?: string;
  SESSION_SECRET?: string;
  SESSION_COOKIE_DOMAIN?: string;
  API_URL?: string;
  PUBLIC_API_URL?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  FAL_KEY?: string;
  OPENAI_API_KEY?: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET_NAME?: string;
  R2_PUBLIC_URL?: string;
  AIRTABLE_API_KEY?: string;
  AIRTABLE_BASE_ID?: string;
  REDIS_URL?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
}

export interface AppVariables {
  db: Database;
  user: AuthUser;
}

export type AppContext = {
  Bindings: AppBindings;
  Variables: AppVariables;
};
