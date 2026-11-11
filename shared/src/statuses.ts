import { z } from "zod";

// same except early stopped
export const runStatuses = [
  "pending",
  "running",
  "stopping",
  "done",
  "cancelled",
  "interrupted",
  "failed",
] as const;

export const runState = z.enum(runStatuses);
export type RunState = z.infer<typeof runState>;
// persisted result states only; generating/judging are in-memory run progress
export const resultStatuses = ["output_done", "judged", "judge_error"] as const;

export const resultState = z.enum(resultStatuses);
export type ResultState = z.infer<typeof resultState>;

const terminalRun: Record<RunState, boolean> = {
  pending: false,
  running: false,
  stopping: false,
  done: true,
  cancelled: true,
  interrupted: true,
  failed: true,
};

export function isTerminalRun(status: RunState): boolean {
  return terminalRun[status];
}
