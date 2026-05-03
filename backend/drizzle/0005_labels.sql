CREATE TABLE `labels` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL DEFAULT 'primary',
	`sort_order` integer NOT NULL DEFAULT 0,
	`i18n` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `entry_labels` (
	`entry_id` text NOT NULL REFERENCES `menu_entries`(`id`) ON DELETE CASCADE,
	`label_id` text NOT NULL REFERENCES `labels`(`id`) ON DELETE CASCADE,
	PRIMARY KEY(`entry_id`, `label_id`)
);
--> statement-breakpoint
CREATE INDEX `entry_labels_label_idx` ON `entry_labels` (`label_id`);
