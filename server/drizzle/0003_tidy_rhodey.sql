PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_inputs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`content` text NOT NULL,
	`description` text,
	`label` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_inputs`("id", "project_id", "content", "description", "label") SELECT "id", "project_id", "content", NULLIF("description", ''), "label" FROM `inputs`;--> statement-breakpoint
DROP TABLE `inputs`;--> statement-breakpoint
ALTER TABLE `__new_inputs` RENAME TO `inputs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;