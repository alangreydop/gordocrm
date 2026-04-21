CREATE TABLE `client_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`type` text NOT NULL,
	`content` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_client_activities_client_created` ON `client_activities` (`client_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_client_activities_type` ON `client_activities` (`type`);--> statement-breakpoint
ALTER TABLE `clients` ADD `lead_tier` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `lead_source` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `website_url` text;