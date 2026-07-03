CREATE TABLE `order_destinations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer NOT NULL DEFAULT 0,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `entry_destinations` (
	`entry_id` text NOT NULL REFERENCES `menu_entries`(`id`) ON DELETE CASCADE,
	`destination_id` text NOT NULL REFERENCES `order_destinations`(`id`) ON DELETE CASCADE,
	PRIMARY KEY(`entry_id`, `destination_id`)
);
--> statement-breakpoint
CREATE INDEX `entry_destinations_destination_idx` ON `entry_destinations` (`destination_id`);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_day` integer NOT NULL,
	`daily_number` integer NOT NULL,
	`status` text NOT NULL DEFAULT 'submitted',
	`reject_reason` text,
	`idempotency_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_day_number_idx` ON `orders` (`order_day`, `daily_number`);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_idempotency_idx` ON `orders` (`idempotency_key`);
--> statement-breakpoint
CREATE INDEX `orders_day_idx` ON `orders` (`order_day`);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL REFERENCES `orders`(`id`) ON DELETE CASCADE,
	`entry_id` text REFERENCES `menu_entries`(`id`) ON DELETE SET NULL,
	`name` text NOT NULL,
	`price` integer NOT NULL,
	`quantity` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`order_id`);
--> statement-breakpoint
CREATE TABLE `order_item_destinations` (
	`id` text PRIMARY KEY NOT NULL,
	`order_item_id` text NOT NULL REFERENCES `order_items`(`id`) ON DELETE CASCADE,
	`destination_id` text REFERENCES `order_destinations`(`id`) ON DELETE SET NULL,
	`destination_name` text NOT NULL,
	`printed_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `order_item_destinations_item_idx` ON `order_item_destinations` (`order_item_id`);
--> statement-breakpoint
CREATE INDEX `order_item_destinations_destination_idx` ON `order_item_destinations` (`destination_id`);
