CREATE TABLE `admin_review_history` (
	`event_id` text PRIMARY KEY NOT NULL,
	`review_key` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `admin_reviews` (
	`review_key` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`record_id` text NOT NULL,
	`reviewer_name` text NOT NULL,
	`payload` text NOT NULL,
	`version` integer NOT NULL,
	`saved_at` text NOT NULL
);
