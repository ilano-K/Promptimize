CREATE TABLE `inputs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`content` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`label` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `judges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`name` text NOT NULL,
	`base_prompt` text NOT NULL,
	`characteristics` text NOT NULL,
	`mode` text NOT NULL,
	`model` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "judges_characteristics_valid" CHECK(json_valid("judges"."characteristics"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `judges_project_id_name_key` ON `judges` (`project_id`,`name`);--> statement-breakpoint
CREATE TABLE `prompts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`name` text NOT NULL,
	`text` text NOT NULL,
	`model` text NOT NULL,
	`output_schema` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prompts_project_id_name_key` ON `prompts` (`project_id`,`name`);