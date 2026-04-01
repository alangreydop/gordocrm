// BullMQ queue names — single source of truth
export const QUEUES = {
  LORA_TRAINING: 'lora-training',
  IMAGE_GENERATION: 'image-generation',
  VIDEO_GENERATION: 'video-generation',
  QUALITY_ASSURANCE: 'quality-assurance',
  ASSET_DELIVERY: 'asset-delivery',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
