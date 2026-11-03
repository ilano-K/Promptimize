import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { runs } from "./runs";

export const results = sqliteTable(
  "results",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: integer("run_id")
      .notNull()
      .references(() => runs.id),
    snapshotInputKey: text("snapshot_input_key").notNull(),
    output: text("output").notNull(),
    judgeResults: text("judge_results", { mode: "json" }),
    status: text("status", {
      enum: ["output_done", "judged", "judge_error"],
    })
      .notNull()
      .default("output_done"),
  },
  (t) => [
    uniqueIndex("results_run_id_snapshot_input_key").on(
      t.runId,
      t.snapshotInputKey,
    ),
  ],
);
