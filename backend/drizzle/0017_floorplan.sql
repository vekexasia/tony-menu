CREATE TABLE `areas` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer NOT NULL DEFAULT 0,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `areas_sort_idx` ON `areas` (`sort_order`);
--> statement-breakpoint
ALTER TABLE `tables` ADD `area_id` text REFERENCES `areas`(`id`);
--> statement-breakpoint
ALTER TABLE `tables` ADD `x` integer NOT NULL DEFAULT 25;
--> statement-breakpoint
ALTER TABLE `tables` ADD `y` integer NOT NULL DEFAULT 25;
--> statement-breakpoint
ALTER TABLE `tables` ADD `shape` text NOT NULL DEFAULT 'rect';
