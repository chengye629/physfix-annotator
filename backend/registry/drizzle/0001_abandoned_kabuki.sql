CREATE TABLE `annotation_history` (
	`event_id` text PRIMARY KEY NOT NULL,
	`record_key` text NOT NULL,
	`annotator_id` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `annotations` (
	`record_key` text PRIMARY KEY NOT NULL,
	`annotator_id` text NOT NULL,
	`annotator_name` text NOT NULL,
	`record_id` text NOT NULL,
	`payload` text NOT NULL,
	`content_hash` text NOT NULL,
	`version` integer NOT NULL,
	`saved_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `annotation_owner_record` ON `annotations` (`annotator_id`,`record_id`);