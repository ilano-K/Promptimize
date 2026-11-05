import { db } from "../db";
import { results } from "../db/schemas";

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
