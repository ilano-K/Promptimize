// Provider kinds the app knows how to talk to. In the real app each kind maps
// to an AI SDK provider package; "openai-compatible" covers anything that
// speaks the OpenAI API (vLLM, LM Studio, Together, a company gateway, ...).

import type { Provider, ProviderKind } from './types'

export interface ProviderKindInfo {
  kind: ProviderKind
  label: string
  blurb: string
  keyRequired: boolean
  baseUrl?: string // default; editable when set
  baseUrlRequired?: boolean
  suggested: string[]
}

export const PROVIDER_KINDS: ProviderKindInfo[] = [
  {
    kind: 'anthropic',
    label: 'Anthropic',
    blurb: 'Claude models.',
    keyRequired: true,
    suggested: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'],
  },
  {
    kind: 'openai',
    label: 'OpenAI',
    blurb: 'GPT models.',
    keyRequired: true,
    suggested: ['gpt-5', 'gpt-5-mini', 'gpt-5-nano'],
  },
  {
    kind: 'google',
    label: 'Google',
    blurb: 'Gemini models.',
    keyRequired: true,
    suggested: ['gemini-2.5-pro', 'gemini-2.5-flash'],
  },
  {
    kind: 'openrouter',
    label: 'OpenRouter',
    blurb: 'Many providers behind one key.',
    keyRequired: true,
    baseUrl: 'https://openrouter.ai/api/v1',
    suggested: ['meta-llama/llama-3.3-70b-instruct', 'mistralai/mistral-small-3.2', 'deepseek/deepseek-chat'],
  },
  {
    kind: 'ollama',
    label: 'Ollama',
    blurb: 'Models running on your machine. No key.',
    keyRequired: false,
    baseUrl: 'http://localhost:11434/v1',
    suggested: ['llama3.1:8b', 'qwen2.5:7b', 'mistral:7b'],
  },
  {
    kind: 'openai-compatible',
    label: 'OpenAI-compatible',
    blurb: 'Any endpoint that speaks the OpenAI API.',
    keyRequired: false,
    baseUrlRequired: true,
    suggested: [],
  },
]

export const kindInfo = (k: ProviderKind) => PROVIDER_KINDS.find((p) => p.kind === k)!

/** Lowercase, url-safe id from a name, e.g. "My Gateway" -> "my-gateway". */
export function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'provider'
}

// ---- Simulated provider checks. The real server makes a tiny model call (test)
// or calls the provider's model list endpoint (fetch). Keys never leave the server.

interface Target {
  kind: ProviderKind
  baseUrl?: string
  hasKey: boolean
}

type Check<T> = ({ ok: true } & T) | { ok: false; error: string }

const CATALOG: Record<ProviderKind, string[]> = {
  anthropic: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-4-1', 'claude-sonnet-4-5'],
  openai: ['gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-4.1', 'gpt-4.1-mini', 'o4-mini'],
  google: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'],
  openrouter: [
    'anthropic/claude-sonnet-5-5',
    'openai/gpt-5-mini',
    'google/gemini-2.5-flash',
    'meta-llama/llama-3.3-70b-instruct',
    'mistralai/mistral-small-3.2',
    'deepseek/deepseek-chat',
    'qwen/qwen3-235b-a22b',
  ],
  ollama: ['llama3.1:8b', 'qwen2.5:7b', 'mistral:7b', 'gemma3:12b', 'phi4:14b'],
  'openai-compatible': ['qwen2.5-72b-instruct', 'llama-3.3-70b-instruct', 'mistral-small-3.2', 'text-embedding-3-small'],
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

function reach(t: Target): string | null {
  if (kindInfo(t.kind).keyRequired && !t.hasKey) return '401 Unauthorized: no API key set.'
  if (kindInfo(t.kind).baseUrlRequired && !t.baseUrl) return 'No base URL set.'
  return null
}

export async function testConnection(t: Target): Promise<Check<{ ms: number }>> {
  await wait(700 + Math.random() * 500)
  const err = reach(t)
  if (err) return { ok: false, error: err }
  return { ok: true, ms: Math.round(180 + Math.random() * 420) }
}

export async function fetchModels(t: Target): Promise<Check<{ models: string[] }>> {
  await wait(900)
  const err = reach(t)
  if (err) return { ok: false, error: err }
  return { ok: true, models: CATALOG[t.kind] }
}

/** Provider kind + base URL for every provider behind the given model ids, for a run snapshot. */
export function snapshotProviders(providers: Provider[], modelIds: string[]): Record<string, { kind: ProviderKind; baseUrl?: string }> {
  const out: Record<string, { kind: ProviderKind; baseUrl?: string }> = {}
  for (const id of modelIds) {
    const pid = id.split('/')[0]
    const p = providers.find((x) => x.id === pid)
    if (p) out[pid] = { kind: p.kind, baseUrl: p.baseUrl ?? kindInfo(p.kind).baseUrl }
  }
  return out
}
