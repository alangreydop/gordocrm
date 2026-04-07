CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`label` text,
	`type` text NOT NULL,
	`r2_key` text NOT NULL,
	`delivery_url` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "assets_type_check" CHECK("assets"."type" IN ('image', 'video')),
	CONSTRAINT "assets_status_check" CHECK("assets"."status" IS NULL OR "assets"."status" IN ('pending', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE INDEX `idx_assets_job_id` ON `assets` (`job_id`);--> statement-breakpoint
CREATE TABLE `brief_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text,
	`email` text NOT NULL,
	`content_type` text,
	`description` text,
	`objective` text,
	`hook` text,
	`style` text,
	`audience` text,
	`cta` text,
	`optimized_brief` text,
	`chat_history` text,
	`status` text DEFAULT 'new' NOT NULL,
	`source` text DEFAULT 'website' NOT NULL,
	`source_page` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "brief_submissions_content_type_check" CHECK("brief_submissions"."content_type" IS NULL OR "brief_submissions"."content_type" IN ('foto', 'video', 'ambos')),
	CONSTRAINT "brief_submissions_status_check" CHECK("brief_submissions"."status" IN ('new', 'reviewed', 'archived', 'in_progress'))
);
--> statement-breakpoint
CREATE INDEX `idx_brief_submissions_client_id` ON `brief_submissions` (`client_id`);--> statement-breakpoint
CREATE INDEX `idx_brief_submissions_email` ON `brief_submissions` (`email`);--> statement-breakpoint
CREATE INDEX `idx_brief_submissions_created_at` ON `brief_submissions` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_brief_submissions_status` ON `brief_submissions` (`status`);--> statement-breakpoint
CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`company` text,
	`stripe_customer_id` text,
	`subscription_status` text DEFAULT 'inactive' NOT NULL,
	`plan` text,
	`account_manager` text,
	`monthly_unit_capacity` integer,
	`dataset_status` text DEFAULT 'pending_capture' NOT NULL,
	`segment` text,
	`margin_profile` text,
	`notes` text,
	`next_review_at` integer,
	`last_contacted_at` integer,
	`onboarding_completed_at` integer,
	`first_session_at` integer,
	`external_client_id` text,
	`tax_id` text,
	`tax_id_type` text DEFAULT 'NIF',
	`legal_name` text,
	`address_line_1` text,
	`address_line_2` text,
	`city` text,
	`region` text,
	`postal_code` text,
	`country` text DEFAULT 'ES',
	`phone` text,
	`registration_number` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_clients_user_id` ON `clients` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_clients_next_review_at` ON `clients` (`next_review_at`);--> statement-breakpoint
CREATE INDEX `idx_clients_tax_id` ON `clients` (`tax_id`);--> statement-breakpoint
CREATE INDEX `idx_clients_country` ON `clients` (`country`);--> statement-breakpoint
CREATE TABLE `config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `invoice_items` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`description` text NOT NULL,
	`quantity` real DEFAULT 1 NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`subtotal_cents` integer NOT NULL,
	`tax_rate` real DEFAULT 0.21 NOT NULL,
	`tax_amount_cents` integer NOT NULL,
	`irpf_rate` real,
	`irpf_amount_cents` integer,
	`total_cents` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`job_id` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `invoice_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`action` text NOT NULL,
	`user_id` text,
	`details` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_number` text NOT NULL,
	`series` text DEFAULT 'F' NOT NULL,
	`fiscal_year` integer NOT NULL,
	`client_id` text NOT NULL,
	`client_tax_id` text NOT NULL,
	`client_legal_name` text NOT NULL,
	`client_address_line_1` text NOT NULL,
	`client_address_line_2` text,
	`client_city` text NOT NULL,
	`client_region` text,
	`client_postal_code` text NOT NULL,
	`client_country` text DEFAULT 'ES',
	`client_email` text NOT NULL,
	`issuer_tax_id` text NOT NULL,
	`issuer_legal_name` text NOT NULL,
	`issuer_address_line_1` text NOT NULL,
	`issuer_city` text NOT NULL,
	`issuer_postal_code` text NOT NULL,
	`issuer_country` text DEFAULT 'ES',
	`issuer_email` text NOT NULL,
	`issue_date` integer NOT NULL,
	`due_date` integer NOT NULL,
	`paid_at` integer,
	`description` text,
	`subtotal_cents` integer DEFAULT 0 NOT NULL,
	`tax_rate` real DEFAULT 0.21 NOT NULL,
	`tax_amount_cents` integer DEFAULT 0 NOT NULL,
	`irpf_rate` real,
	`irpf_amount_cents` integer,
	`total_cents` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`payment_method` text,
	`payment_notes` text,
	`is_rectificative` integer DEFAULT false,
	`rectificative_reason` text,
	`original_invoice_id` text,
	`related_job_ids` text,
	`notes` text,
	`terms` text,
	`footer` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`original_invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_invoice_number_unique` ON `invoices` (`invoice_number`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`external_job_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`brief_text` text,
	`platform` text,
	`type` text,
	`lora_model_id` text,
	`stripe_payment_intent_id` text,
	`due_at` integer,
	`units_planned` integer DEFAULT 0 NOT NULL,
	`units_consumed` integer DEFAULT 0 NOT NULL,
	`ai_cost_estimated` real,
	`ai_cost_real` real,
	`gross_margin_estimated` real,
	`client_segment` text,
	`margin_profile` text,
	`asset_dominant` text,
	`legal_risk` text,
	`turnaround` text,
	`portability_required` text,
	`structural_demand` text,
	`benchmark_level` text,
	`stack_lane` text,
	`stack_candidate_1` text,
	`stack_candidate_2` text,
	`stack_candidate_3` text,
	`stack_winner` text,
	`stack_snapshot` text,
	`client_goal` text,
	`internal_notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "jobs_status_check" CHECK("jobs"."status" IN ('pending', 'processing', 'completed', 'failed', 'delivered')),
	CONSTRAINT "jobs_platform_check" CHECK("jobs"."platform" IS NULL OR "jobs"."platform" IN ('instagram', 'tiktok', 'amazon_pdp', 'paid_ads')),
	CONSTRAINT "jobs_type_check" CHECK("jobs"."type" IS NULL OR "jobs"."type" IN ('image', 'video'))
);
--> statement-breakpoint
CREATE INDEX `idx_jobs_client_id` ON `jobs` (`client_id`);--> statement-breakpoint
CREATE INDEX `idx_jobs_status` ON `jobs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_jobs_due_at` ON `jobs` (`due_at`);--> statement-breakpoint
CREATE INDEX `idx_jobs_stack_lane` ON `jobs` (`stack_lane`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`read` integer DEFAULT 0 NOT NULL,
	`related_job_id` text,
	`related_invoice_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`related_job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`related_invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_notifications_user_id` ON `notifications` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_notifications_read` ON `notifications` (`read`);--> statement-breakpoint
CREATE INDEX `idx_notifications_created_at` ON `notifications` (`created_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE INDEX `idx_sessions_token` ON `sessions` (`token`);--> statement-breakpoint
CREATE INDEX `idx_sessions_user_id` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_expires_at` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`name` text NOT NULL,
	`company` text,
	`stripe_customer_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "users_role_check" CHECK("users"."role" IN ('admin', 'client'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);