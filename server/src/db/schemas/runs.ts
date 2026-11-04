import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { runStatuses } from "@promptimize/shared";
import { experiments } from "./experiments";
import { optimizeLoops } from "./optimize-loops";

export const runs = sqliteTable(
  "runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    experimentId: integer("experiment_id")
      .notNull()
      .references(() => experiments.id, { onDelete: "cascade" }),
    // written once at creation, so it is never absent
    snapshot: text("snapshot", { mode: "json" }).notNull(),
    // stored, not derived: pending exists before any result row does, and
    // interrupted is only knowable after a restart
    status: text("status", { enum: runStatuses }).notNull().default("pending"),
    startedAt: text("started_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    loopId: integer("loop_id").references(() => optimizeLoops.id, {
      onDelete: "cascade",
    }),
    // 1-based position inside its loop; null for runs outside an optimize loop
    round: integer("round"),
    note: text("note"),
  },
  (t) => [
    // one run per round per loop; SQLite keeps NULLs distinct, so in-loop and
    // out-of-loop runs never collide
    uniqueIndex("runs_loop_id_round_key").on(t.loopId, t.round),
  ],
);
