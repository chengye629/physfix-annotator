CREATE TABLE `demo_snapshots` (
	`source_key` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`frozen_at` text NOT NULL
);
