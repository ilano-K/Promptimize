import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { experiments } from "./experiments";
import { optimizeLoops } from "./optimize-loops";
import { runStatuses } from "@promptimize/shared";
import { sql } from "drizzle-orm";

export const runs = sqliteTable(
  "runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    experimentId: integer("experiment_id")
      .notNull()
      .references(() => experiments.id, { onDelete: "cascade" }),
    snapshot: text("snapshot", { mode: "json" }).notNull(),
    loopId: integer("loop_id").references(() => optimizeLoops.id),
    round: integer("rounds"),
    note: text("note"),
    status: text("status", { enum: runStatuses }),
    startedAt: text("startedAt")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (t) => [uniqueIndex("runs_loop_id_round_key").on(t.loopId, t.round)],
);
