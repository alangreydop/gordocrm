CREATE TABLE `client_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`job_id` text,
	`asset_id` text,
	`title` text NOT NULL,
	`summary` text,
	`status` text DEFAULT 'needs_review' NOT NULL,
	`requested_at` integer NOT NULL,
	`due_at` integer,
	`decision_note` text,
	`decided_by_user_id` text,
	`decided_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`decided_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `client_reviews_status_check` CHECK(`client_reviews`.`status` IN ('needs_review', 'approved', 'changes_requested'))
);
--> statement-breakpoint
CREATE INDEX `idx_client_reviews_client_id` ON `client_reviews` (`client_id`);
--> statement-breakpoint
CREATE INDEX `idx_client_reviews_job_id` ON `client_reviews` (`job_id`);
--> statement-breakpoint
CREATE INDEX `idx_client_reviews_status` ON `client_reviews` (`status`);
--> statement-breakpoint
CREATE TABLE `client_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`job_id` text,
	`subject` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `client_threads_status_check` CHECK(`client_threads`.`status` IN ('active', 'closed'))
);
--> statement-breakpoint
CREATE INDEX `idx_client_threads_client_id` ON `client_threads` (`client_id`);
--> statement-breakpoint
CREATE INDEX `idx_client_threads_job_id` ON `client_threads` (`job_id`);
--> statement-breakpoint
CREATE INDEX `idx_client_threads_updated_at` ON `client_threads` (`updated_at`);
--> statement-breakpoint
CREATE TABLE `client_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`author_user_id` text,
	`author_role` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`read_at` integer,
	FOREIGN KEY (`thread_id`) REFERENCES `client_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `client_messages_author_role_check` CHECK(`client_messages`.`author_role` IN ('client', 'studio'))
);
--> statement-breakpoint
CREATE INDEX `idx_client_messages_thread_id` ON `client_messages` (`thread_id`);
--> statement-breakpoint
CREATE INDEX `idx_client_messages_author_user_id` ON `client_messages` (`author_user_id`);
--> statement-breakpoint
CREATE INDEX `idx_client_messages_created_at` ON `client_messages` (`created_at`);
