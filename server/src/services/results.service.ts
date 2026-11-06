import { asc, eq } from "drizzle-orm";
import { db } from "../db";
import { results } from "../db/schemas";
import type { Result } from "@promptimize/shared";


export function listResults(runId: number): Result[] {
  const data = db
    .select()
    .from(results)
    .where(eq(results.runId, runId))
    .orderBy(asc(results.id))
    .all();
  return data;
}

export function saveResult(
  runId: number,
  snapshotInputKey: string,
  output: string,
) {
  return db
    .insert(results)
    .values({
      runId,
      snapshotInputKey,
      output,
      status: "output_done",
    })
    .returning()
    .get();
}
