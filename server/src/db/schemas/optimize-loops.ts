import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { experiments } from "./experiments";

export const optimizeLoops = sqliteTable("optimize_loops", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  experimentId: integer("experiment_id")
    .notNull()
    .references(() => experiments.id, { onDelete: "cascade" }),
  maxRounds: integer("max_rounds").notNull(),
  earlyStop: integer("early_stop", { mode: "boolean" }).notNull(),
  summary: text("summary"),
});
