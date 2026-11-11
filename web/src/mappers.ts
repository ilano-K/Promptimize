// Adapters between the server's API shapes (numeric ids, JSON objects) and the
// screen shapes in types.ts (string ids, JSON text). Runs and loops are still
// simulated locally, so they keep using the screen types.

import type {
  CompareTag,
  Comparison as ApiComparison,
  CreateExperimentBody,
  CreateInputBody,
  CreateJudgeBody,
  CreatePromptBody,
  Experiment as ApiExperiment,
  Input as ApiInput,
  JsonSchema,
  Judge as ApiJudge,
  Prompt as ApiPrompt,
  Result as ApiResult,
  Run as ApiRun,
  RunDetail as ApiRunDetail,
  Snapshot as ApiSnapshot,
  UpdateExperimentBody,
  UpdateInputBody,
  UpdateJudgeBody,
  UpdatePromptBody,
} from '@promptimize/shared'
import type { Experiment, Input, Judge, Label, Prompt, Result, Run, Snapshot } from './types'

const id = (n: number) => String(n)

// ---- Inputs ----
// The server has no name column; `description` is the only textual label.

export function inputFromApi(x: ApiInput): Input {
  return {
    id: id(x.id),
    projectId: id(x.projectId),
    name: x.description ?? '',
    content: x.content,
    label: x.label,
  }
}

export function inputToCreate(x: Input): CreateInputBody {
  return { content: x.content, description: x.name.trim(), label: x.label }
}

export function inputToUpdate(x: Input): UpdateInputBody {
  return { content: x.content, description: x.name.trim(), label: x.label }
}

// ---- Prompts ----

function outputSchemaOf(p: Prompt): JsonSchema | null {
  const raw = p.outputSchema.trim()
  return raw ? (JSON.parse(raw) as JsonSchema) : null
}

export function promptFromApi(x: ApiPrompt): Prompt {
  return {
    id: id(x.id),
    projectId: id(x.projectId),
    name: x.name,
    text: x.text,
    model: x.model,
    outputSchema: x.outputSchema ? JSON.stringify(x.outputSchema, null, 2) : '',
  }
}

export function promptToCreate(x: Prompt): CreatePromptBody {
  return {
    name: x.name.trim(),
    text: x.text,
    model: x.model,
    outputSchema: outputSchemaOf(x) ?? undefined,
  }
}

export function promptToUpdate(x: Prompt): UpdatePromptBody {
  return {
    name: x.name.trim(),
    text: x.text,
    model: x.model,
    outputSchema: outputSchemaOf(x),
  }
}

// ---- Judges ----

export function judgeFromApi(x: ApiJudge): Judge {
  return {
    id: id(x.id),
    projectId: id(x.projectId),
    name: x.name,
    basePrompt: x.basePrompt,
    // The id is only a React key; the server stores name/type.
    characteristics: x.characteristics.map((c, i) => ({ id: `${x.id}-${i}`, name: c.name, type: c.type })),
    mode: x.mode,
    model: x.model,
  }
}

function judgeBody(x: Judge) {
  return {
    name: x.name.trim(),
    basePrompt: x.basePrompt,
    characteristics: x.characteristics.map((c) => ({ name: c.name.trim(), type: c.type })),
    mode: x.mode,
    model: x.model,
  }
}

export function judgeToCreate(x: Judge): CreateJudgeBody {
  return judgeBody(x)
}

export function judgeToUpdate(x: Judge): UpdateJudgeBody {
  return judgeBody(x)
}

// ---- Experiments ----

export function experimentFromApi(x: ApiExperiment): Experiment {
  return {
    id: id(x.id),
    projectId: id(x.projectId),
    name: x.name,
    promptId: x.promptId === null ? null : id(x.promptId),
    judgeId: x.judgeId === null ? null : id(x.judgeId),
    inputIds: x.inputIds.map(id),
    createdAt: Date.parse(x.createdAt),
  }
}

/** A null judge is a prompt-only experiment: outputs are saved but never scored. */
function experimentBody(x: Experiment) {
  if (!x.promptId) throw new Error('An experiment needs a prompt before it can be saved.')
  return {
    name: x.name.trim(),
    promptId: Number(x.promptId),
    judgeId: x.judgeId === null ? null : Number(x.judgeId),
    inputIds: x.inputIds.map(Number),
  }
}

export function experimentToCreate(x: Experiment): CreateExperimentBody {
  return experimentBody(x)
}

export function experimentToUpdate(x: Experiment): UpdateExperimentBody {
  return experimentBody(x)
}

// ---- Runs ----
// Runs live on the server. The screen keeps its string ids and text schema so
// the simulated optimize loops can share the same shapes.

function snapshotFromApi(x: ApiSnapshot): Snapshot {
  const providers: NonNullable<Snapshot['providers']> = {}
  for (const model of Object.values(x.models)) {
    providers[model.providerId] = { kind: model.kind, baseUrl: model.baseUrl }
  }

  return {
    prompt: {
      id: '',
      projectId: '',
      name: x.prompt.name,
      text: x.prompt.text,
      model: x.prompt.model,
      outputSchema: x.prompt.outputSchema ? JSON.stringify(x.prompt.outputSchema, null, 2) : '',
    },
    // The snapshot has no input names: results point at the input's key, and
    // the text the model saw is what the screen shows.
    inputs: x.inputs.map((i) => ({ id: i.key, projectId: '', name: `Input ${i.key}`, content: i.content, label: i.label })),
    judge: x.judge
      ? {
          id: '',
          projectId: '',
          name: x.judge.name,
          basePrompt: x.judge.basePrompt,
          characteristics: x.judge.characteristics.map((c, i) => ({ id: `${i}`, name: c.name, type: c.type })),
          mode: x.judge.mode,
          model: x.judge.model,
        }
      : null,
    providers,
  }
}

/** Maps a run, with results when the server sent the detail shape. */
export function runFromApi(x: ApiRun | ApiRunDetail): Run {
  const detail = 'results' in x ? x : null

  return {
    id: id(x.id),
    experimentId: id(x.experimentId),
    snapshot: snapshotFromApi(x.snapshot),
    results: (detail?.results ?? []).map(resultFromApi),
    status: x.status,
    error: x.error ?? undefined,
    startedAt: Date.parse(x.startedAt),
    loopId: x.loopId === null ? undefined : id(x.loopId),
    round: x.round ?? undefined,
    kind: 'run',
  }
}

/** One stored result as a screen result: the run id is implicit in its parent. */
export function resultFromApi(r: ApiResult): Result {
  return {
    inputKey: r.snapshotInputKey,
    status: r.status,
    output: r.output,
    judge: r.judgeResults ?? undefined,
    judgeError: r.judgeError,
  }
}

// ---- Compare ----

/** One input's two results. A null side means that run never ran the input. */
export interface CompareRowView {
  inputKey: string
  label: Label
  content: string
  a: Result | null
  b: Result | null
}

export interface CompareView {
  a: Run
  b: Run
  tags: CompareTag[]
  rows: CompareRowView[]
}

export function comparisonFromApi(x: ApiComparison): CompareView {
  return {
    a: runFromApi(x.a),
    b: runFromApi(x.b),
    tags: x.tags,
    rows: x.rows.map((r) => ({
      inputKey: r.inputKey,
      label: r.label,
      content: r.content,
      a: r.a ? resultFromApi(r.a) : null,
      b: r.b ? resultFromApi(r.b) : null,
    })),
  }
}
