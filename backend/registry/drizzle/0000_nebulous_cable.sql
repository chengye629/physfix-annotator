CREATE TABLE `registrations` (
	`claim_id` text PRIMARY KEY NOT NULL,
	`plan` text NOT NULL,
	`slot` integer,
	`name_key` text NOT NULL,
	`session_token` text NOT NULL,
	`role` text NOT NULL,
	`display_name` text NOT NULL,
	`annotator_id` text NOT NULL,
	`created_at` text NOT NULL,
	`released_at` text,
	`released_by` text,
	`release_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `active_slot` ON `registrations` (`plan`,`slot`) WHERE "registrations"."released_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `active_name` ON `registrations` (`plan`,`name_key`) WHERE "registrations"."released_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `active_annotator` ON `registrations` (`plan`,`annotator_id`) WHERE "registrations"."released_at" IS NULL;