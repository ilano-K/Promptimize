import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { projects } from "./projects";

export const inputs = sqliteTable("inputs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  description: text("description").notNull().default(""),
  label: text("label", {
    enum: ["train", "validation", "test"],
  }).notNull(),
});
