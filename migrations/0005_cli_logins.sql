CREATE TABLE `cli_logins` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`key_hash` text NOT NULL,
	`prefix` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cli_logins_code_unique` ON `cli_logins` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `cli_logins_key_hash_unique` ON `cli_logins` (`key_hash`);