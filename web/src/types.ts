// Shared domain types. These mirror the logical schema in docs/TECHNICAL.md so the
// prototype can later be wired to the real server without reshaping data.

export type Label = 'train' | 'validation' | 'test'
export type CharType = 'text' | 'number'
export type JudgeMode = 'individual' | 'batch'

// Projects live on the server (SQLite), so their shape comes from the shared package.
// The other objects below are still prototype data held in the browser.
export type { Project } from '@promptimize/shared'

export interface Input {
  id: string
  projectId: string
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
  promptId: string
  inputIds: string[]
  judgeId: string | null // null = prompt-only mode
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
}

export type RunStatus = 'running' | 'done' | 'judge_error' | 'stopped'

export interface Run {
  id: string
  experimentId: string
  snapshot: Snapshot
  results: Result[]
  status: RunStatus
  error?: string
  startedAt: number
  loopId?: string
  round?: number
  kind: 'run' | 'test'
}

export interface Round {
  index: number // 0 = the original prompt
  promptText: string
  runId: string
  note: string
  testRunId?: string
}

export interface OptimizeLoop {
  id: string
  experimentId: string
  mode: '1-pass' | 'n-pass'
  maxRounds: number
  earlyStop: boolean
  optimizerModel: string
  instructions: string
  status: 'running' | 'done' | 'stopped'
  stopReason?: string
  summary?: string
  rounds: Round[]
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
  defaultOptimizerModel: string // "<provider id>/<model>"
  providers: Provider[]
}
