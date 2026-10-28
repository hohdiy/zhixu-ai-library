CREATE TABLE `research_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`feed_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`checked_at` text,
	`candidates` text DEFAULT '[]' NOT NULL,
	`source_ids` text DEFAULT '[]' NOT NULL,
	`error` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `research_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`run_key` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`status` text DEFAULT 'running' NOT NULL,
	`feed_ids` text NOT NULL,
	`brief_id` text NOT NULL,
	`error` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `research_runs_run_key_unique` ON `research_runs` (`run_key`);--> statement-breakpoint
CREATE TABLE `research_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`enabled` text DEFAULT '0' NOT NULL,
	`feed_ids` text DEFAULT '[]' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `sources` ADD `feed_id` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `research_run_id` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `analyzed_at` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `reading_error` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sources` ADD `reading_attempted_at` text;