CREATE TABLE `checks` (
	`id` text PRIMARY KEY NOT NULL,
	`table_session_id` text NOT NULL,
	`status` text NOT NULL DEFAULT 'open',
	`lines` text NOT NULL,
	`discount` text,
	`adjustments` text NOT NULL DEFAULT '[]',
	`created_at` integer NOT NULL,
	`settled_at` integer,
	`voided_at` integer,
	FOREIGN KEY (`table_session_id`) REFERENCES `table_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `checks_table_session_idx` ON `checks` (`table_session_id`);
