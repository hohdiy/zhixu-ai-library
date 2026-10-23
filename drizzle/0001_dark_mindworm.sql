CREATE TABLE `feed_registry` (
	`id` text PRIMARY KEY NOT NULL,
	`following` text DEFAULT '1' NOT NULL,
	`entry` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL
);
