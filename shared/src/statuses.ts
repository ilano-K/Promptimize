import { z } from "zod";

export const loopStatuses = [
  "pending",
  "running",
  "stopping",
  "done",
  "early_stopped",
  "cancelled",
  "interrupted",
  "failed",
] as const;

// same except early stopped
export const runStatuses = [
  "pending",
  "running",
  "stopping",
  "done",
  "cancelled",
  "interrupted",
  "failed",
]as const;

export const loopState = z.enum(loopStatuses);
export type LoopState = z.infer<typeof loopState>;

export const runState = z.enum(runStatuses);
export type RunState = z.infer<typeof runState>;
