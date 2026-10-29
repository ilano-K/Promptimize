import { z } from "zod";

const run = z.object({
  id: z.string(),
  status: z.string(),
  startedAt: z.string(),
});

const optimizeLoop = z.object({
  id: z.string(),
  status: z.string(),
  rounds: z.number(),
});

const experimentUsedBy = z.object({
  runs: z.array(run),
  optimizeLoops: z.array(optimizeLoop),
});

export const experiment = z.object({
  id: z.number(),
  name: z.string().min(1),
  projectId: z.number(),
  // null when the referenced prompt/judge was deleted (restorable from a snapshot)
  promptId: z.number().nullable(),
  judgeId: z.number().nullable(),
  inputIds: z.array(z.number()),
  usedBy: experimentUsedBy,
  createdAt: z.string(),
});

export const createExperimentBody = z.object({
  name: z.string().trim().min(1),
  promptId: z.number(),
  judgeId: z.number(),
  inputIds: z.array(z.number()).min(1),
});

export const updateExperimentBody = createExperimentBody
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: "nothing to update",
  });

export type Experiment = z.infer<typeof experiment>;
export type CreateExperimentBody = z.infer<typeof createExperimentBody>;
export type UpdateExperimentBody = z.infer<typeof updateExperimentBody>;
export type ExperimentUsedBy = z.infer<typeof experimentUsedBy>;
