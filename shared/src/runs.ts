import { z } from "zod";
import { jsonSchema } from "./json-schema";
import { characteristics, judgeMode } from "./judges";
import { providerKinds } from "./settings";
import { inputLabels } from "./inputs";
import { runStatuses } from "./statuses";

// A snapshot is the copy of an experiment that a run executes and that results,
// Compare, retry judging and restore all read back. It is stored as JSON, so it
// must stay self-contained: names for restore, input text for results, provider
// shape for Compare.
const snapshotPrompt = z.object({
  name: z.string(),
  text: z.string(),
  model: z.string(),
  outputSchema: jsonSchema.nullable(),
});

// null for prompt-only experiments
const snapshotJudge = z.object({
  name: z.string(),
  basePrompt: z.string(),
  characteristics: characteristics,
  mode: judgeMode,
  model: z.string(),
});

// Identity of the provider behind a model, never its key. baseUrl is optional
// because builtin providers use their own default endpoint.
const snapshotModel = z.object({
  providerId: z.string(),
  kind: z.enum(providerKinds),
  baseUrl: z.string().optional(),
});

export const snapshotV1 = z.object({
  // bump only when the shape changes incompatibly; readers switch on it
  version: z.literal(1),
  createdAt: z.string(),
  prompt: snapshotPrompt,
  judge: snapshotJudge.nullable(),
  inputs: z.array(
    z.object({
      // the input's id as text: results point at the snapshot with this, not at
      // the library row, so deleted inputs never break past runs
      key: z.string(),
      label: z.enum(inputLabels),
      content: z.string(),
    }),
  ),
  // keyed by full model id ("provider/model"), the same id stored on prompt/judge
  models: z.record(z.string(), snapshotModel),
});

export const run = z.object({
  id: z.number(),
  experimentId: z.number(),
  snapshot: snapshotV1,
  status: z.enum(runStatuses),
  startedAt: z.string(),
  loopId: z.number().nullable(),
  round: z.number().nullable(),
  note: z.string().nullable(),
  error: z.string().nullable(),
});

export type Snapshot = z.infer<typeof snapshotV1>;
export type Run = z.infer<typeof run>;
