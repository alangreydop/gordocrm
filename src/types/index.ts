import type { Database } from '../../db/index.js';
import type { R2Bucket } from '@cloudflare/workers-types';

export type UserRole = 'admin' | 'client';
export type ClientSubscriptionStatus = 'active' | 'inactive' | 'cancelled';
export type ClientDatasetStatus =
  | 'pending_capture'
  | 'capture_ready'
  | 'capturing'
  | 'captured'
  | 'capture_failed';
export type ClientSegment = 'rentable' | 'growth' | 'premium' | 'enterprise';
export type MarginProfile = 'estrecho' | 'medio' | 'alto';
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'delivered';
export type JobPlatform = 'instagram' | 'tiktok' | 'amazon_pdp' | 'paid_ads';
export type JobAssetDominant =
  | 'catalogo'
  | 'paid_static'
  | 'pdp_packaging'
  | 'video_ads'
  | 'video_edit'
  | 'mixto';
export type LegalRisk = 'normal' | 'alto';
export type Turnaround = 'normal' | 'urgente';
export type PortabilityRequired = 'si' | 'no';
export type StructuralDemand = 'normal' | 'alta';
export type BenchmarkLevel = 'L0' | 'L1' | 'L2' | 'L3';
export type StackLane = 'A' | 'B' | 'C' | 'D';
export type AssetType = 'image' | 'video';
export type AssetQaStatus = 'pending' | 'approved' | 'rejected';
export type BriefContentType = 'foto' | 'video' | 'ambos';
export type BriefStatus = 'new' | 'reviewed' | 'archived';

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
  AI_ENGINE_WEBHOOK_URL?: string;
  AI_ENGINE_WEBHOOK_SECRET?: string;
  AI_ENGINE_JWT_SECRET?: string;
  INVOICE_WEBHOOK_SECRET?: string;
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
  AI_ENGINE_URL?: string;
  LEAD_TRANSFER_SECRET?: string;
  ANTHROPIC_API_KEY?: string;
  CRON_SECRET?: string;
  PORTAL_URL?: string;
  ORCHESTRATOR_BASE_URL?: string;
  ORCHESTRATOR_ADMIN_KEY?: string;
  ASSETS?: R2Bucket;
  BRANDS?: R2Bucket;
  AGENT_STORE?: R2Bucket;
}

export interface AppVariables {
  db: Database;
  user: AuthUser;
  aiEngineToken: string;
  aiEngineBase: string;
}

export type AppContext = {
  Bindings: AppBindings;
  Variables: AppVariables;
};
