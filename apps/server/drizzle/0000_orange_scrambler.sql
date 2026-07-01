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
CREATE TABLE `desktop_release_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`release_id` text NOT NULL,
	`target` text NOT NULL,
	`arch` text NOT NULL,
	`url` text NOT NULL,
	`signature` text NOT NULL,
	`sha256` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`release_id`) REFERENCES `desktop_releases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `desktop_release_assets_release_target_arch_idx` ON `desktop_release_assets` (`release_id`,`target`,`arch`);--> statement-breakpoint
CREATE TABLE `desktop_releases` (
	`id` text PRIMARY KEY NOT NULL,
	`version` text NOT NULL,
	`channel` text DEFAULT 'stable' NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`notes` text,
	`pub_date` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `desktop_releases_version_channel_idx` ON `desktop_releases` (`version`,`channel`);--> statement-breakpoint
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
CREATE INDEX `license_activation_events_created_at_idx` ON `license_activation_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `license_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`activation_code_hash` text NOT NULL,
	`activation_code_preview` text NOT NULL,
	`license_id` text NOT NULL,
	`tier` text DEFAULT 'basic' NOT NULL,
	`features_json` text NOT NULL,
	`expires_at` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`max_activations` integer,
	`activation_count` integer DEFAULT 0 NOT NULL,
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
CREATE TABLE `update_server_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
