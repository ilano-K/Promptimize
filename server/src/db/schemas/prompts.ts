import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { JsonSchema } from "@promptimize/shared";
import { projects } from "./projects";

export const prompts = sqliteTable(
  "prompts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    text: text("text").notNull(),
    model: text("model").notNull(),
    outputSchema: text("output_schema", { mode: "json" }).$type<JsonSchema>(),
  },
  (t) => [uniqueIndex("prompts_project_id_name_key").on(t.projectId, t.name)],
);
