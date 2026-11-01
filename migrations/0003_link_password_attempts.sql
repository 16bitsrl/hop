CREATE TABLE `link_password_attempts` (
	`link_id` text NOT NULL,
	`ip_hash` text NOT NULL,
	`count` integer NOT NULL,
	`window_start` integer NOT NULL,
	PRIMARY KEY(`link_id`, `ip_hash`),
	FOREIGN KEY (`link_id`) REFERENCES `links`(`id`) ON UPDATE no action ON DELETE cascade
);
