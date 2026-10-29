// Typed client for the Promptimize server. Request and response shapes come from
// @promptimize/shared so the web app and the server can't drift apart.

import {
  experiment as experimentSchema,
  input as inputSchema,
  judge as judgeSchema,
  project,
  prompt as promptSchema,
} from '@promptimize/shared'
import type {
  ApiErrorBody,
  CreateExperimentBody,
  CreateInputBody,
  CreateJudgeBody,
  CreateProjectBody,
  CreatePromptBody,
  CreateProviderBody,
  Experiment,
  FetchModelsResponse,
  Input,
  Judge,
  Project,
  Prompt,
  ProviderConnectionBody,
  SafeProvider,
  Settings,
  TestConnectionResponse,
  UpdateExperimentBody,
  UpdateInputBody,
  UpdateJudgeBody,
  UpdateProjectBody,
  UpdatePromptBody,
  UpdateProviderBody,
  UpdateSettingsBody,
} from '@promptimize/shared'

export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function request(method: string, path: string, body?: unknown): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', "Can't reach the Promptimize server. Is it running?")
  }
  if (res.status === 204) return null

  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const err = (data as ApiErrorBody | null)?.error
    throw new ApiError(res.status, err?.code ?? 'HTTP_ERROR', err?.message ?? `Request failed (${res.status})`)
  }
  return data
}

export const projectsApi = {
  list: async (): Promise<Project[]> => project.array().parse(await request('GET', '/v1/projects')),
  create: async (body: CreateProjectBody): Promise<Project> => project.parse(await request('POST', '/v1/projects', body)),
  update: async (id: number, body: UpdateProjectBody): Promise<Project> =>
    project.parse(await request('PATCH', `/v1/projects/${id}`, body)),
  remove: async (id: number): Promise<void> => {
    await request('DELETE', `/v1/projects/${id}`)
  },
}

export const inputsApi = {
  list: async (projectId: number): Promise<Input[]> =>
    inputSchema.array().parse(await request('GET', `/v1/projects/${projectId}/inputs`)),
  create: async (projectId: number, body: CreateInputBody): Promise<Input> =>
    inputSchema.parse(await request('POST', `/v1/projects/${projectId}/inputs`, body)),
  update: async (id: number, body: UpdateInputBody): Promise<Input> =>
    inputSchema.parse(await request('PATCH', `/v1/inputs/${id}`, body)),
  remove: async (id: number): Promise<void> => {
    await request('DELETE', `/v1/inputs/${id}`)
  },
}

export const promptsApi = {
  list: async (projectId: number): Promise<Prompt[]> =>
    promptSchema.array().parse(await request('GET', `/v1/projects/${projectId}/prompts`)),
  create: async (projectId: number, body: CreatePromptBody): Promise<Prompt> =>
    promptSchema.parse(await request('POST', `/v1/projects/${projectId}/prompts`, body)),
  update: async (id: number, body: UpdatePromptBody): Promise<Prompt> =>
    promptSchema.parse(await request('PATCH', `/v1/prompts/${id}`, body)),
  remove: async (id: number): Promise<void> => {
    await request('DELETE', `/v1/prompts/${id}`)
  },
}

export const judgesApi = {
  list: async (projectId: number): Promise<Judge[]> =>
    judgeSchema.array().parse(await request('GET', `/v1/projects/${projectId}/judges`)),
  create: async (projectId: number, body: CreateJudgeBody): Promise<Judge> =>
    judgeSchema.parse(await request('POST', `/v1/projects/${projectId}/judges`, body)),
  update: async (id: number, body: UpdateJudgeBody): Promise<Judge> =>
    judgeSchema.parse(await request('PATCH', `/v1/judges/${id}`, body)),
  remove: async (id: number): Promise<void> => {
    await request('DELETE', `/v1/judges/${id}`)
  },
}

export const experimentsApi = {
  list: async (projectId: number): Promise<Experiment[]> =>
    experimentSchema.array().parse(await request('GET', `/v1/projects/${projectId}/experiments`)),
  create: async (projectId: number, body: CreateExperimentBody): Promise<Experiment> =>
    experimentSchema.parse(await request('POST', `/v1/projects/${projectId}/experiments`, body)),
  update: async (id: number, body: UpdateExperimentBody): Promise<Experiment> =>
    experimentSchema.parse(await request('PATCH', `/v1/experiments/${id}`, body)),
  remove: async (id: number): Promise<void> => {
    await request('DELETE', `/v1/experiments/${id}`)
  },
}

export const settingsApi = {
  get: async (): Promise<Settings> => (await request('GET', '/v1/settings')) as Settings,
  update: async (body: UpdateSettingsBody): Promise<{ defaultOptimizerModel: string }> =>
    (await request('PATCH', '/v1/settings', body)) as { defaultOptimizerModel: string },
  addProvider: async (body: CreateProviderBody): Promise<SafeProvider> =>
    (await request('POST', '/v1/settings', body)) as SafeProvider,
  updateProvider: async (id: string, body: UpdateProviderBody): Promise<SafeProvider> =>
    (await request('PATCH', `/v1/settings/${id}`, body)) as SafeProvider,
  deleteProvider: async (id: string): Promise<void> => {
    await request('DELETE', `/v1/settings/${id}`)
  },
  testConnection: async (body: ProviderConnectionBody): Promise<TestConnectionResponse> =>
    (await request('POST', '/v1/settings/test-connection', body)) as TestConnectionResponse,
  fetchModels: async (body: ProviderConnectionBody): Promise<FetchModelsResponse> =>
    (await request('POST', '/v1/settings/fetch-models', body)) as FetchModelsResponse,
}
