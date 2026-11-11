import { z } from "zod";
import { input } from "./inputs.js";
import { judge } from "./judges.js";
import { prompt } from "./prompts.js";

// What a removal warning needs to name: the object that would be affected.
// Kept small on purpose, because this rides along on reads, not in tables.
export const usageRef = z.object({
  id: z.number(),
  name: z.string(),
  projectId: z.number(),
});

export const usageRefs = z.array(usageRef);

// Reads carry the experiments that reference the object; writes do not, so a
// freshly created object has no usage to report yet.
export const promptRead = prompt.extend({ usedBy: usageRefs });
export const judgeRead = judge.extend({ usedBy: usageRefs });
export const inputRead = input.extend({ usedBy: usageRefs });

// Models live in the config file, not in a table, so usage is keyed by the
// model id that prompts and judges store.
export const modelUsage = z.object({
  prompts: usageRefs,
  judges: usageRefs,
});

export const usage = z.object({
  models: z.record(z.string(), modelUsage),
});

export type UsageRef = z.infer<typeof usageRef>;
export type PromptRead = z.infer<typeof promptRead>;
export type JudgeRead = z.infer<typeof judgeRead>;
export type InputRead = z.infer<typeof inputRead>;
export type ModelUsage = z.infer<typeof modelUsage>;
export type Usage = z.infer<typeof usage>;
