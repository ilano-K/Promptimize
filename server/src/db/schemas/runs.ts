import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { runStatuses, type Snapshot } from "@promptimize/shared";
import { experiments } from "./experiments";

export const runs = sqliteTable("runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  experimentId: integer("experiment_id")
    .notNull()
    .references(() => experiments.id, { onDelete: "cascade" }),
  // written once at creation, so it is never absent
  snapshot: text("snapshot", { mode: "json" }).$type<Snapshot>().notNull(),
  // stored, not derived: pending exists before any result row does, and
  // interrupted is only knowable after a restart
  status: text("status", { enum: runStatuses }).notNull().default("pending"),
  startedAt: text("started_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  error: text("error"),
});
