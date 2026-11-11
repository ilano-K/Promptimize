// Shared domain types. These mirror the logical schema in docs/TECHNICAL.md.
// The server owns projects, the library, experiments and runs; the shapes
// below are the web-facing versions (string ids and numeric timestamps) used
// by the screens.

export type Label = 'train' | 'validation' | 'test'
export type CharType = 'text' | 'number'
export type JudgeMode = 'individual' | 'batch'

// Projects live on the server (SQLite), so their shape comes from the shared package.
export type { Project } from '@promptimize/shared'

export interface Input {
  id: string
  projectId: string
  /** Shown as the input's name; stored in the server's `description` column. */
  name: string
  content: string
  label: Label
}

export interface Prompt {
  id: string
  projectId: string
  name: string
  text: string
  model: string
  outputSchema: string // empty string = free-form output
}

export interface Characteristic {
  /** Stable key for list editing; generated when a row is created. */
  id?: string
  name: string
  type: CharType
}

export interface Judge {
  id: string
  projectId: string
  name: string
  basePrompt: string
  characteristics: Characteristic[]
  mode: JudgeMode
  model: string
}

export interface Experiment {
  id: string
  projectId: string
  name: string
  promptId: string | null // null = the prompt was deleted
  inputIds: string[]
  judgeId: string | null // null = the judge was deleted
  createdAt: number
}

/** A frozen copy of everything a run used. Library edits never change it. */
export interface Snapshot {
  prompt: Prompt
  inputs: Input[]
  judge: Judge | null
  /** Where each provider used by this run pointed, keyed by provider id. Never includes the key. */
  providers?: Record<string, { kind: ProviderKind; baseUrl?: string }>
}

export type ResultStatus = 'pending' | 'generating' | 'output_done' | 'judging' | 'judged' | 'judge_error'

export type JudgeValue = string | number

export interface Result {
  inputKey: string // input id inside the snapshot
  status: ResultStatus
  output?: string
  judge?: Record<string, JudgeValue>
  /** Why the judge could not score this output; null when it did. */
  judgeError?: string | null
}

/**
 * The server's run states.
 */
export type RunStatus = 'pending' | 'running' | 'stopping' | 'done' | 'cancelled' | 'interrupted' | 'failed'

export interface Run {
  id: string
  experimentId: string
  snapshot: Snapshot
  results: Result[]
  status: RunStatus
  error?: string
  startedAt: number
}

export type ProviderKind = 'anthropic' | 'openai' | 'google' | 'openrouter' | 'ollama' | 'openai-compatible'

export interface Provider {
  id: string // prefix of every model id from this provider, e.g. "anthropic"
  kind: ProviderKind
  name: string
  baseUrl?: string
  hasKey: boolean // the key itself lives only in the server's config file
  models: string[] // model names as the provider calls them, e.g. "claude-sonnet-5-5"
}

export interface Settings {
  providers: Provider[]
}

/** An experiment that references a library object or a model. */
export interface UsageRef {
  id: string
  name: string
  projectId: string
}

/** Which prompts and judges point at each model id. Keyed by "<provider id>/<model>". */
export interface Usage {
  models: Record<string, { prompts: UsageRef[]; judges: UsageRef[] }>
}
