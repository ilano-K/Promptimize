// All app state lives here. Projects, their library objects, experiments and
// runs come from the server. A run is polled only while its status is
// non-terminal, so a reload shows the server's state instead of losing it.

import type { CreateProjectBody, CreateProviderBody, UpdateProjectBody, UpdateProviderBody } from '@promptimize/shared'
import { isTerminalRun, type RunState } from '@promptimize/shared'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useShallow } from 'zustand/react/shallow'
import { experimentsApi, inputsApi, judgesApi, projectsApi, promptsApi, runsApi, settingsApi } from './api'
import {
  experimentFromApi,
  experimentToCreate,
  experimentToUpdate,
  inputFromApi,
  inputToCreate,
  inputToUpdate,
  judgeFromApi,
  judgeToCreate,
  judgeToUpdate,
  promptFromApi,
  promptToCreate,
  promptToUpdate,
  runFromApi,
} from './mappers'
import type { Experiment, Input, Judge, Project, Prompt, Provider, Run, Settings } from './types'

export const uid = () => crypto.randomUUID().slice(0, 8)

interface Data {
  /** Projects come from the server (SQLite) and aren't saved in localStorage. */
  projects: Project[]
  projectsStatus: 'loading' | 'ready' | 'error'
  projectsError?: string
  /** The open project's id as a string (the library and experiments key on strings). */
  projectId: string
  /** Library objects and experiments come from the server. Every project's set is loaded. */
  inputs: Input[]
  prompts: Prompt[]
  judges: Judge[]
  experiments: Experiment[]
  /** Server runs, refreshed by polling; only the latest result set per run is kept. */
  runs: Run[]
  settings: Settings
}

interface Actions {
  loadProjects: () => Promise<void>
  setProject: (id: number) => void
  /** Create/update/delete reject with an ApiError when the server refuses. */
  createProject: (body: CreateProjectBody) => Promise<Project>
  updateProject: (id: number, body: UpdateProjectBody) => Promise<Project>
  deleteProject: (id: number) => Promise<void>
  saveInput: (i: Input) => Promise<Input>
  savePrompt: (p: Prompt) => Promise<Prompt>
  saveJudge: (j: Judge) => Promise<Judge>
  deleteObject: (kind: 'input' | 'prompt' | 'judge', id: string) => Promise<void>
  saveExperiment: (e: Experiment) => Promise<Experiment>
  deleteExperiment: (id: string) => Promise<void>
  /** Recreates the experiment's deleted prompt from its newest run snapshot. */
  restorePrompt: (experimentId: string) => Promise<Prompt>
  /** Recreates the experiment's deleted judge from its newest run snapshot. */
  restoreJudge: (experimentId: string) => Promise<Judge>
  /** Starts a run on the server, then polls it until it is terminal. */
  startRun: (experimentId: string) => Promise<string>
  retryJudge: (runId: string) => Promise<void>
  stopRun: (runId: string) => Promise<void>
  /** Loads an experiment's run history (server) and polls the active ones. */
  loadRuns: (experimentId: string) => Promise<void>
  /** Fetches one run's results if they aren't in the store yet. */
  loadRun: (runId: string) => Promise<void>
  /** Providers live on the server. These call the API, then mirror the response into the store. */
  loadSettings: () => Promise<void>
  addProvider: (body: CreateProviderBody) => Promise<Provider>
  updateProvider: (id: string, body: UpdateProviderBody) => Promise<Provider>
  removeProvider: (id: string) => Promise<void>
}

const initial = (): Data => ({
  projects: [],
  projectsStatus: 'loading',
  projectId: '',
  inputs: [],
  prompts: [],
  judges: [],
  experiments: [],
  runs: [],
  settings: { providers: [] },
})

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Runs with an in-flight poll loop, and runs whose results are already loaded.
const polling = new Set<string>()
const loadedDetails = new Set<string>()

export const useStore = create<Data & Actions>()(
  persist(
    (set) => {
      const upsertRun = (run: Run) =>
        set((s) => ({
          runs: s.runs.some((r) => r.id === run.id) ? s.runs.map((r) => (r.id === run.id ? run : r)) : [...s.runs, run],
        }))

      /** GETs one run with its results and mirrors it into the store. */
      async function fetchRun(runId: string) {
        const run = runFromApi(await runsApi.get(Number(runId)))
        loadedDetails.add(runId)
        upsertRun(run)
        return run
      }

      /** Keeps GETting a run once a second until its status is terminal. */
      function pollRun(runId: string) {
        if (polling.has(runId)) return
        polling.add(runId)
        void (async () => {
          try {
            let run = await fetchRun(runId)
            while (!isTerminalRun(run.status as RunState)) {
              await sleep(1000)
              run = await fetchRun(runId)
            }
          } catch {
            // The last state stays visible; opening the experiment retries.
          } finally {
            polling.delete(runId)
          }
        })()
      }

      return {
        ...initial(),

        loadProjects: async () => {
          set({ projectsStatus: 'loading', projectsError: undefined })
          try {
            const projects = await projectsApi.list()
            // Load every project's library and experiments too: the Projects
            // screen shows counts for all of them, and switching projects is instant.
            const bundles = await Promise.all(
              projects.map(async (p) => {
                const [inputs, prompts, judges, experiments] = await Promise.all([
                  inputsApi.list(p.id),
                  promptsApi.list(p.id),
                  judgesApi.list(p.id),
                  experimentsApi.list(p.id),
                ])
                return { inputs, prompts, judges, experiments }
              }),
            )
            set({
              projects,
              projectsStatus: 'ready',
              inputs: bundles.flatMap((b) => b.inputs.map(inputFromApi)),
              prompts: bundles.flatMap((b) => b.prompts.map(promptFromApi)),
              judges: bundles.flatMap((b) => b.judges.map(judgeFromApi)),
              experiments: bundles.flatMap((b) => b.experiments.map(experimentFromApi)),
            })
          } catch (e) {
            set({ projectsStatus: 'error', projectsError: e instanceof Error ? e.message : String(e) })
          }
        },
        setProject: (id) => set({ projectId: String(id) }),
        createProject: async (body) => {
          const p = await projectsApi.create(body)
          set((s) => ({ projects: [p, ...s.projects] }))
          return p
        },
        updateProject: async (id, body) => {
          const p = await projectsApi.update(id, body)
          set((s) => ({ projects: s.projects.map((x) => (x.id === id ? p : x)) }))
          return p
        },
        /** Deletes the project on the server, then its library objects, experiments and runs here. */
        deleteProject: async (id) => {
          await projectsApi.remove(id)
          const key = String(id)
          set((s) => {
            const expIds = new Set(s.experiments.filter((e) => e.projectId === key).map((e) => e.id))
            return {
              projects: s.projects.filter((p) => p.id !== id),
              projectId: s.projectId === key ? '' : s.projectId,
              inputs: s.inputs.filter((x) => x.projectId !== key),
              prompts: s.prompts.filter((x) => x.projectId !== key),
              judges: s.judges.filter((x) => x.projectId !== key),
              experiments: s.experiments.filter((x) => x.projectId !== key),
              runs: s.runs.filter((r) => !expIds.has(r.experimentId)),
            }
          })
        },

        saveInput: async (i) => {
          const saved = i.id
            ? inputFromApi(await inputsApi.update(Number(i.id), inputToUpdate(i)))
            : inputFromApi(await inputsApi.create(Number(i.projectId), inputToCreate(i)))
          set((s) => ({ inputs: upsert(s.inputs, saved) }))
          return saved
        },
        savePrompt: async (p) => {
          const saved = p.id
            ? promptFromApi(await promptsApi.update(Number(p.id), promptToUpdate(p)))
            : promptFromApi(await promptsApi.create(Number(p.projectId), promptToCreate(p)))
          set((s) => ({ prompts: upsert(s.prompts, saved) }))
          return saved
        },
        saveJudge: async (j) => {
          const saved = j.id
            ? judgeFromApi(await judgesApi.update(Number(j.id), judgeToUpdate(j)))
            : judgeFromApi(await judgesApi.create(Number(j.projectId), judgeToCreate(j)))
          set((s) => ({ judges: upsert(s.judges, saved) }))
          return saved
        },
        deleteObject: async (kind, id) => {
          if (kind === 'input') {
            await inputsApi.remove(Number(id))
            set((s) => ({
              inputs: s.inputs.filter((x) => x.id !== id),
              // The join rows cascade on the server; mirror that here.
              experiments: s.experiments.map((e) =>
                e.inputIds.includes(id) ? { ...e, inputIds: e.inputIds.filter((x) => x !== id) } : e,
              ),
            }))
            return
          }
          if (kind === 'prompt') {
            await promptsApi.remove(Number(id))
            set((s) => ({
              prompts: s.prompts.filter((x) => x.id !== id),
              experiments: s.experiments.map((e) => (e.promptId === id ? { ...e, promptId: null } : e)),
            }))
            return
          }
          await judgesApi.remove(Number(id))
          set((s) => ({
            judges: s.judges.filter((x) => x.id !== id),
            experiments: s.experiments.map((e) => (e.judgeId === id ? { ...e, judgeId: null } : e)),
          }))
        },

        saveExperiment: async (e) => {
          const saved = e.id
            ? experimentFromApi(await experimentsApi.update(Number(e.id), experimentToUpdate(e)))
            : experimentFromApi(await experimentsApi.create(Number(e.projectId), experimentToCreate(e)))
          set((s) => ({ experiments: upsert(s.experiments, saved) }))
          return saved
        },
        deleteExperiment: async (id) => {
          await experimentsApi.remove(Number(id))
          set((s) => ({
            experiments: s.experiments.filter((x) => x.id !== id),
            runs: s.runs.filter((r) => r.experimentId !== id),
          }))
        },

        restorePrompt: async (experimentId) => {
          const restored = promptFromApi(await experimentsApi.restorePrompt(Number(experimentId)))
          set((s) => ({
            prompts: upsert(s.prompts, restored),
            // The server linked it to this experiment; mirror that here.
            experiments: s.experiments.map((e) => (e.id === experimentId ? { ...e, promptId: restored.id } : e)),
          }))
          return restored
        },
        restoreJudge: async (experimentId) => {
          const restored = judgeFromApi(await experimentsApi.restoreJudge(Number(experimentId)))
          set((s) => ({
            judges: upsert(s.judges, restored),
            experiments: s.experiments.map((e) => (e.id === experimentId ? { ...e, judgeId: restored.id } : e)),
          }))
          return restored
        },

        startRun: async (experimentId) => {
          const run = runFromApi(await runsApi.start(Number(experimentId)))
          upsertRun(run)
          pollRun(run.id)
          return run.id
        },
        retryJudge: async (runId) => {
          const run = runFromApi(await runsApi.retryJudging(Number(runId)))
          loadedDetails.add(runId)
          upsertRun(run)
          pollRun(runId)
        },
        stopRun: async (runId) => {
          const run = runFromApi(await runsApi.stop(Number(runId)))
          loadedDetails.add(runId)
          upsertRun(run)
          pollRun(runId)
        },

        loadRuns: async (experimentId) => {
          const runs = (await runsApi.list(Number(experimentId))).map((r) => runFromApi(r))
          set((s) => {
            // Keep the results another poll already fetched for the same runs.
            const existing = new Map(s.runs.map((r) => [r.id, r]))
            const merged = runs.map((r) => {
              const loaded = existing.get(r.id)
              return loaded && loaded.results.length > 0 ? { ...r, results: loaded.results } : r
            })
            return {
              // Replace this experiment's server runs wholesale so deleted runs disappear.
              runs: [...s.runs.filter((r) => r.experimentId !== experimentId), ...merged],
            }
          })

          for (const run of runs) {
            if (!isTerminalRun(run.status as RunState)) pollRun(run.id)
          }
          const newest = runs.sort((a, b) => b.startedAt - a.startedAt)[0]
          if (newest && !polling.has(newest.id) && !loadedDetails.has(newest.id)) void fetchRun(newest.id).catch(() => {})
        },
        loadRun: async (runId) => {
          if (loadedDetails.has(runId)) return
          const run = await fetchRun(runId)
          if (!isTerminalRun(run.status as RunState)) pollRun(runId)
        },

        // The server owns settings. On load we overwrite the cached copy; if the
        // server is down we keep showing the cache instead of an empty screen.
        loadSettings: async () => {
          try {
            const s = await settingsApi.get()
            set({ settings: { providers: s.providers } })
          } catch {}
        },
        addProvider: async (body) => {
          const p = await settingsApi.addProvider(body)
          set((s) => ({ settings: { ...s.settings, providers: [...s.settings.providers, p] } }))
          return p
        },
        updateProvider: async (id, body) => {
          const p = await settingsApi.updateProvider(id, body)
          set((s) => ({ settings: { ...s.settings, providers: s.settings.providers.map((x) => (x.id === id ? p : x)) } }))
          return p
        },
        removeProvider: async (id) => {
          await settingsApi.deleteProvider(id)
          set((s) => ({ settings: { ...s.settings, providers: s.settings.providers.filter((x) => x.id !== id) } }))
        },
      }
    },
    {
      name: 'promptimize-prototype',
      version: 5,
      // v2 changed the provider shape (kind, models, base URL); older saves get the example providers.
      // v3 moved projects to the server; the old browser copies (string ids) are dropped.
      // v4 moved the library and experiments to the server; the seed-backed copies and
      // the runs that snapshotted them are dropped.
      // v5 runs live on the server too, so the old simulated runs are dropped; runs are
      // reloaded from the server per experiment.
      migrate: (state, version) => {
        const s = state as Data
        if (version < 2) s.settings = { providers: [] }
        if (version < 3) {
          delete (s as Partial<Data>).projects
          s.projectId = ''
        }
        if (version < 4) {
          delete (s as Partial<Data>).inputs
          delete (s as Partial<Data>).prompts
          delete (s as Partial<Data>).judges
          delete (s as Partial<Data>).experiments
          s.runs = []
        }
        if (version < 5) s.runs = []
        return s
      },
      partialize: (s) => ({
        projectId: s.projectId,
        runs: s.runs,
        settings: s.settings,
      }),
    },
  ),
)

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  return list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]
}

// ---- Selectors / helpers ----

/**
 * Like useStore, but re-renders only when the fields the selector picks change.
 * Use this instead of `const s = useStore()` so a component isn't re-rendered by
 * unrelated slices (e.g. a Settings screen re-rendering on every run step).
 */
export function useStoreShallow<T>(selector: (state: Data & Actions) => T): T {
  return useStore(useShallow(selector))
}

export function usedBy(experiments: Experiment[], kind: 'input' | 'prompt' | 'judge', id: string): Experiment[] {
  return experiments.filter((e) =>
    kind === 'input' ? e.inputIds.includes(id) : kind === 'prompt' ? e.promptId === id : e.judgeId === id,
  )
}

/** Mean of every number characteristic across judged results. */
export function averages(run: Run): Record<string, number> {
  const judge = run.snapshot.judge
  if (!judge) return {}
  const out: Record<string, number> = {}
  for (const c of judge.characteristics.filter((c) => c.type === 'number')) {
    const vals = run.results.map((r) => r.judge?.[c.name]).filter((v): v is number => typeof v === 'number')
    if (vals.length) out[c.name] = vals.reduce((a, b) => a + b, 0) / vals.length
  }
  return out
}

/** Averages limited to inputs with a given label. */
export function averagesFor(run: Run, label: Input['label']): Record<string, number> {
  const keys = new Set(run.snapshot.inputs.filter((i) => i.label === label).map((i) => i.id))
  return averages({ ...run, results: run.results.filter((r) => keys.has(r.inputKey)) })
}

export function latestRun(runs: Run[], experimentId: string): Run | undefined {
  return runs.filter((r) => r.experimentId === experimentId).sort((a, b) => b.startedAt - a.startedAt)[0]
}

export interface ModelGroup {
  provider: Provider
  models: { id: string; name: string }[] // id = "<provider id>/<model>"
}

/** Every configured model, grouped by provider. This is what model pickers offer. */
export function useModelGroups(): ModelGroup[] {
  const providers = useStore((s) => s.settings.providers)
  return providers.map((p) => ({ provider: p, models: p.models.map((m) => ({ id: `${p.id}/${m}`, name: m })) }))
}

/** First configured model id, used as the default for new prompts and judges. */
export function useDefaultModel(): string {
  return useModelGroups().flatMap((g) => g.models)[0]?.id ?? ''
}