CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`contact_name` text,
	`contact_email` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_name_idx` ON `companies` (`name`);--> statement-breakpoint
CREATE TABLE `license_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`activation_code_hash` text NOT NULL,
	`activation_code_preview` text NOT NULL,
	`license_id` text NOT NULL,
	`tier` text DEFAULT 'stage-1' NOT NULL,
	`features_json` text NOT NULL,
	`expires_at` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`max_activations` integer,
	`activation_count` integer DEFAULT 0 NOT NULL,
	`offline_license_json` text,
	`note` text,
	`issued_by` text,
	`issued_at` integer NOT NULL,
	`last_validated_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `license_keys_activation_code_hash_idx` ON `license_keys` (`activation_code_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `license_keys_license_id_idx` ON `license_keys` (`license_id`);--> statement-breakpoint
CREATE INDEX `license_keys_company_id_idx` ON `license_keys` (`company_id`);--> statement-breakpoint
CREATE INDEX `license_keys_status_idx` ON `license_keys` (`status`);--> statement-breakpoint
CREATE TABLE `license_activation_events` (
	`id` text PRIMARY KEY NOT NULL,
	`license_key_id` text NOT NULL,
	`machine_id_hash` text,
	`app_version` text,
	`result` text NOT NULL,
	`message` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`license_key_id`) REFERENCES `license_keys`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `license_activation_events_license_key_id_idx` ON `license_activation_events` (`license_key_id`);--> statement-breakpoint
CREATE INDEX `license_activation_events_created_at_idx` ON `license_activation_events` (`created_at`);
