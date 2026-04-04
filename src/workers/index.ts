// Queue/topic names reserved for a later Cloudflare-native pipeline.
// The current CRM ships without background jobs, but these names document
// the next slice if we move processing onto Cloudflare Queues.
export const QUEUES = {
  LORA_TRAINING: 'lora-training',
  IMAGE_GENERATION: 'image-generation',
  VIDEO_GENERATION: 'video-generation',
  QUALITY_ASSURANCE: 'quality-assurance',
  ASSET_DELIVERY: 'asset-delivery',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
