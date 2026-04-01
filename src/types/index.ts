// Core domain types for Grande&Gordo

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Client {
  id: string;
  airtableId: string;
  email: string;
  company: string;
  stripeCustomerId: string;
}

export interface StudioSession {
  id: string;
  clientId: string;
  status: JobStatus;
  stripePaymentIntentId: string;
  scheduledAt: Date;
  completedAt?: Date;
}

export interface LoraTrainingJob {
  id: string;
  sessionId: string;
  clientId: string;
  status: JobStatus;
  falRequestId?: string;
  modelUrl?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface GenerationJob {
  id: string;
  clientId: string;
  loraModelUrl: string;
  briefText: string;
  platform: 'instagram' | 'tiktok' | 'amazon_pdp' | 'paid_ads';
  type: 'image' | 'video';
  status: JobStatus;
  falRequestId?: string;
  qaStatus?: 'approved' | 'rejected';
  deliveredUrls?: string[];
}

export interface AssetDelivery {
  jobId: string;
  clientId: string;
  r2Keys: string[];
  signedUrls: string[];
  expiresAt: Date;
}
