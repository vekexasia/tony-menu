CREATE TABLE `order_intents` (
	`id` text PRIMARY KEY NOT NULL,
	`lines` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer NOT NULL
);
