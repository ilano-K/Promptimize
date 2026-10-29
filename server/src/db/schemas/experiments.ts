import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { prompts } from "./prompts";
import { judges } from "./judges";
import { inputs } from "./inputs";
import { projects } from "./projects";
import { sql } from "drizzle-orm";

export const experiments = sqliteTable("experiments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  promptId: integer("prompt_id").references(() => prompts.id, {
    onDelete: "set null",
  }),
  judgeId: integer("judge_id").references(() => judges.id, {
    onDelete: "set null",
  }),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

// many-to-many join table; the composite PK also indexes experiment_id and
// makes a duplicate (experiment, input) pair impossible
export const experiment_inputs = sqliteTable(
  "experiment_inputs",
  {
    experimentId: integer("experiment_id")
      .notNull()
      .references(() => experiments.id, { onDelete: "cascade" }),
    inputId: integer("input_id")
      .notNull()
      .references(() => inputs.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.experimentId, t.inputId] })],
);
