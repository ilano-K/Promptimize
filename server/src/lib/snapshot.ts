import {
  snapshotV1,
  type Input,
  type Judge,
  type Prompt,
  type Provider,
  type Snapshot,
} from "@promptimize/shared";
import { parseModelId } from "./llm";
import { ModelNotConfiguredError } from "../errors/domain";

type SnapshotSource = {
  prompt: Prompt;
  judge: Judge | null;
  inputs: Input[];
  providers: Provider[];
  now: Date;
};

type SnapshotInput = Snapshot["inputs"][number];
type SnapshotModel = Snapshot["models"][string];

/**
 * Freezes what a run is about to execute: the prompt, the judge, every input's
 * text, and the provider behind each model. Results, Compare, retry judging and
 * restore all read this copy, so later library edits can't rewrite history.
 *
 * Pure on purpose: no DB and no config lookup, so every case is testable
 * without a server.
 */
export function buildSnapshot(source: SnapshotSource): Snapshot {
  const { prompt, judge, inputs, providers, now } = source;

  const { name, text, model, outputSchema } = prompt;

  const snapshotJudge =
    judge === null
      ? null
      : {
          name: judge.name,
          basePrompt: judge.basePrompt,
          characteristics: judge.characteristics,
          mode: judge.mode,
          model: judge.model,
        };

  // sorted by id so a run's result order is stable; key is the input id as text
  // and is only ever generated here, results look it up instead of recomputing
  const parsedInputs = [...inputs]
    .sort((a, b) => a.id - b.id)
    .map((input) => toSnapshotInput(input));

  // keyed by full model id; prompt and judge often share one, so dedupe first
  const modelIds = [...new Set([prompt.model, judge?.model])].filter(
    (m) => m !== undefined,
  );
  const models = Object.fromEntries(
    modelIds.map((m) => toSnapshotModel(m, providers)),
  );
  const assemble = {
    version: 1,
    createdAt: now.toISOString(),
    prompt: { name, text, model, outputSchema },
    judge: snapshotJudge,
    inputs: parsedInputs,
    models,
  };

  // parsed rather than cast: this is the only place the snapshot JSON is
  // produced, so a mistake in here fails on the first run, not on first read
  return snapshotV1.parse(assemble);
}

function toSnapshotInput(input: Input): SnapshotInput {
  return {
    key: String(input.id),
    label: input.label,
    content: input.content,
  };
}

// Copies the provider's identity, never its config: the api key must not reach
// a snapshot. Same provider lookup rule as assertModelConfigured.
function toSnapshotModel(
  model: string,
  providers: Provider[],
): [string, SnapshotModel] {
  const { providerId, modelName } = parseModelId(model);

  const provider = providers.find(
    (p) => p.id === providerId && p.models.includes(modelName),
  );
  if (!provider) {
    throw new ModelNotConfiguredError(model);
  }

  return [
    model,
    {
      providerId: provider.id,
      kind: provider.kind,
      // builtin providers have no endpoint; "" and whitespace mean the same
      baseUrl: provider.baseUrl?.trim() || undefined,
    },
  ];
}
