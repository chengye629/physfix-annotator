CREATE TABLE `batch2_annotation_history` (
	`event_id` text PRIMARY KEY NOT NULL,
	`record_key` text NOT NULL,
	`annotator_id` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `batch2_annotations` (
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
CREATE UNIQUE INDEX `batch2_annotation_owner_record` ON `batch2_annotations` (`annotator_id`,`record_id`);