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
CREATE TABLE `update_server_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
