import {
  check,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { resultStatuses, type JudgeVerdict } from "@promptimize/shared";
import { runs } from "./runs";

export const results = sqliteTable(
  "results",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: integer("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    // key inside the run's snapshot, not an inputs row: results must survive
    // library edits and deletions
    snapshotInputKey: text("snapshot_input_key").notNull(),
    output: text("output").notNull(),
    // null until judged; an empty object would be indistinguishable from
    // "judged, nothing returned"
    judgeResults: text("judge_results", { mode: "json" }).$type<JudgeVerdict>(),
    status: text("status", { enum: resultStatuses })
      .notNull()
      .default("output_done"),
    judgeError: text("judge_error"),
  },
  (t) => [
    // exactly one result per input per run, so retrying judging updates rows
    // instead of inserting duplicates
    uniqueIndex("results_run_id_snapshot_input_key_key").on(
      t.runId,
      t.snapshotInputKey,
    ),
    // retry queries status = 'judge_error', so a typo would make rows
    // silently unretryable
    check(
      "results_status_valid",
      sql`${t.status} in ('output_done', 'judged', 'judge_error')`,
    ),
  ],
);
