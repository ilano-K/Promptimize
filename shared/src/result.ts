import { z } from "zod";
import { resultState } from "./statuses.js";

export const judgeVerdict = z.record(
  z.string(),
  z.union([z.number(), z.string()]),
);

export const result = z.object({
  id: z.number(),
  runId: z.number(),
  snapshotInputKey: z.string(),
  output: z.string(),
  judgeResults: judgeVerdict.nullable(),
  status: resultState,
  judgeError: z.string().nullable(),
});

export type JudgeVerdict = z.infer<typeof judgeVerdict>;
export type Result = z.infer<typeof result>;
