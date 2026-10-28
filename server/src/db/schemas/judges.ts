import {
  sqliteTable,
  integer,
  text,
  check,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { projects } from "./projects";
import { sql } from "drizzle-orm";
import type { Characteristic } from "@promptimize/shared";

export const judges = sqliteTable(
  "judges",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    basePrompt: text("base_prompt").notNull(),
    characteristics: text("characteristics", { mode: "json" })
      .$type<Characteristic[]>()
      .notNull(),
    mode: text("mode", { enum: ["individual", "batch"] }).notNull(),
    model: text("model").notNull(),
  },
  (t) => [
    check(
      "judges_characteristics_valid",
      sql`json_valid(${t.characteristics})`,
    ),
    uniqueIndex("judges_project_id_name_key").on(t.projectId, t.name),
  ],
);
