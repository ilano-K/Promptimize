// Adapters between the server's API shapes (numeric ids, JSON objects) and the
// screen shapes in types.ts (string ids, JSON text). Runs and loops are still
// simulated locally, so they keep using the screen types.

import type {
  CreateExperimentBody,
  CreateInputBody,
  CreateJudgeBody,
  CreatePromptBody,
  Experiment as ApiExperiment,
  Input as ApiInput,
  JsonSchema,
  Judge as ApiJudge,
  Prompt as ApiPrompt,
  UpdateExperimentBody,
  UpdateInputBody,
  UpdateJudgeBody,
  UpdatePromptBody,
} from '@promptimize/shared'
import type { Experiment, Input, Judge, Prompt } from './types'

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
