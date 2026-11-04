import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { experiments } from "./experiments";

export const optimizeLoops = sqliteTable("optimize_loops", {
  // the doc omits an id, but runs.loop_id needs a real key and an experiment
  // can be optimized more than once
  id: integer("id").primaryKey({ autoIncrement: true }),
  experimentId: integer("experiment_id")
    .notNull()
    .references(() => experiments.id, { onDelete: "cascade" }),
  maxRounds: integer("max_rounds").notNull(),
  earlyStop: integer("early_stop", { mode: "boolean" }).notNull(),
  // only filled once the loop finishes
  summary: text("summary"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});
