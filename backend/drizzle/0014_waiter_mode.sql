CREATE TABLE `staff_links` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token` text NOT NULL,
	`session_token` text,
	`consumed_at` integer,
	`revoked_at` integer,
	`last_seen_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staff_links_token_idx` ON `staff_links` (`token`);
--> statement-breakpoint
CREATE UNIQUE INDEX `staff_links_session_token_idx` ON `staff_links` (`session_token`);
--> statement-breakpoint
CREATE TABLE `tables` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`active` integer NOT NULL DEFAULT 1,
	`sort_order` integer NOT NULL DEFAULT 0,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tables_sort_idx` ON `tables` (`sort_order`);
--> statement-breakpoint
CREATE TABLE `table_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`table_id` text NOT NULL REFERENCES `tables`(`id`) ON DELETE CASCADE,
	`opened_at` integer NOT NULL,
	`closed_at` integer
);
--> statement-breakpoint
CREATE INDEX `table_sessions_table_idx` ON `table_sessions` (`table_id`);
--> statement-breakpoint
ALTER TABLE `orders` ADD `table_session_id` text REFERENCES `table_sessions`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX `orders_table_session_idx` ON `orders` (`table_session_id`);
