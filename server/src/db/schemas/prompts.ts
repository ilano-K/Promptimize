import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
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
  // lower(name): "Clarity" and "clarity" are the same name for the user, so the
  // DB is the one that rejects the duplicate (translated to DUPLICATE_NAME)
  (t) => [
    uniqueIndex("prompts_project_id_name_key").on(t.projectId, sql`lower(${t.name})`),
  ],
);
