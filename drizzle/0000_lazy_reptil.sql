CREATE TABLE `queue_managers` (
	`queue_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`queue_id`, `user_id`),
	FOREIGN KEY (`queue_id`) REFERENCES `queues`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `queue_managers_user` ON `queue_managers` (`user_id`);--> statement-breakpoint
CREATE TABLE `queues` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`hours` text DEFAULT '' NOT NULL,
	`time_zone` text DEFAULT 'UTC' NOT NULL,
	`slug` text NOT NULL,
	`paused` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `queues_slug` ON `queues` (`slug`);--> statement-breakpoint
CREATE INDEX `queues_owner` ON `queues` (`owner_id`);--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`queue_id` text NOT NULL,
	`service_date` text NOT NULL,
	`number` integer NOT NULL,
	`name` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`token` text NOT NULL,
	`status` text DEFAULT 'waiting' NOT NULL,
	`joined_at` integer NOT NULL,
	`called_at` integer,
	FOREIGN KEY (`queue_id`) REFERENCES `queues`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tickets_number` ON `tickets` (`queue_id`,`service_date`,`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `tickets_token` ON `tickets` (`token`);--> statement-breakpoint
CREATE INDEX `tickets_date` ON `tickets` (`service_date`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`email` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `users_org_email` ON `users` (`org_id`,`email`);