CREATE TABLE `briefs` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`source_ids` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`kind` text DEFAULT 'digest' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`topic` text DEFAULT 'unclassified' NOT NULL,
	`topics` text DEFAULT '[]' NOT NULL,
	`author` text DEFAULT '' NOT NULL,
	`company` text DEFAULT '' NOT NULL,
	`published_at` text,
	`collected_at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`facts` text DEFAULT '[]' NOT NULL,
	`insight` text DEFAULT '' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`starred` text DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sources_url_unique` ON `sources` (`url`);