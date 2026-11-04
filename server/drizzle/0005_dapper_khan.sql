DROP INDEX `projects_name_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `projects_name_unique` ON `projects` (lower("name"));--> statement-breakpoint
DROP INDEX `judges_project_id_name_key`;--> statement-breakpoint
CREATE UNIQUE INDEX `judges_project_id_name_key` ON `judges` (`project_id`,lower("name"));--> statement-breakpoint
DROP INDEX `prompts_project_id_name_key`;--> statement-breakpoint
CREATE UNIQUE INDEX `prompts_project_id_name_key` ON `prompts` (`project_id`,lower("name"));