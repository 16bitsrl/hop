ALTER TABLE `clicks` ADD `import_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `clicks_import_key_uq` ON `clicks` (`import_key`);