// Typed client for the Promptimize server. Request and response shapes come from
// @promptimize/shared so the web app and the server can't drift apart.

import { project } from '@promptimize/shared'
import type { ApiErrorBody, CreateProjectBody, Project, UpdateProjectBody } from '@promptimize/shared'

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
  list: async (): Promise<Project[]> => project.array().parse(await request('GET', '/projects')),
  create: async (body: CreateProjectBody): Promise<Project> => project.parse(await request('POST', '/projects', body)),
  update: async (id: number, body: UpdateProjectBody): Promise<Project> =>
    project.parse(await request('PATCH', `/projects/${id}`, body)),
  remove: async (id: number): Promise<void> => {
    await request('DELETE', `/projects/${id}`)
  },
}
