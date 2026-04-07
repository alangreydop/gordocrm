ALTER TABLE `assets` ADD `description` text;--> statement-breakpoint
ALTER TABLE `assets` ADD `tags` text;--> statement-breakpoint
ALTER TABLE `assets` ADD `embedding` text;--> statement-breakpoint
ALTER TABLE `assets` ADD `dominant_colors` text;--> statement-breakpoint
ALTER TABLE `assets` ADD `visual_style` text;--> statement-breakpoint
ALTER TABLE `assets` ADD `emotional_tone` text;--> statement-breakpoint
ALTER TABLE `assets` ADD `client_visible` integer DEFAULT true;--> statement-breakpoint
CREATE INDEX `idx_assets_status` ON `assets` (`status`);--> statement-breakpoint
CREATE INDEX `idx_assets_client_visible` ON `assets` (`client_visible`);--> statement-breakpoint
CREATE INDEX `idx_assets_created_at` ON `assets` (`created_at`);