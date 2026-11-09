// All app state lives here. Projects, their library objects, experiments and
// runs come from the server; optimize loops are still simulated in the browser
// (the "model calls" come from sim.ts) and saved to localStorage. A run is
// polled only while its status is non-terminal, so a reload shows the server's
// state instead of losing it.

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
import { snapshotProviders } from './providers'
import * as seed from './seed'
import { batchJudgeFails, generateOutput, goodEnough, judgeOutput, optimizePrompt, roundNote, sleep } from './sim'
import type {
  Experiment,
  Input,
  Judge,
  OptimizeLoop,
  Project,
  Prompt,
  Provider,
  Result,
  Run,
  Settings,
} from './types'

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
  /**
   * Server runs plus the still-simulated optimize-loop runs. Server runs are
   * refreshed by polling; only the latest result set per run is kept.
   */
  runs: Run[]
  loops: OptimizeLoop[]
  settings: Settings
}

interface OptimizeConfig {
  mode: '1-pass' | 'n-pass'
  maxRounds: number
  earlyStop: boolean
  optimizerModel: string
  instructions: string
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
  /** Starts a run on the server, then polls it until it is terminal. */
  startRun: (experimentId: string) => Promise<string>
  retryJudge: (runId: string) => Promise<void>
  stopRun: (runId: string) => Promise<void>
  /** Loads an experiment's run history (server) and polls the active ones. */
  loadRuns: (experimentId: string) => Promise<void>
  /** Fetches one run's results if they aren't in the store yet. */
  loadRun: (runId: string) => Promise<void>
  startOptimize: (experimentId: string, cfg: OptimizeConfig) => string
  stopLoop: (loopId: string) => void
  runTest: (loopId: string, round: number) => void
  saveRoundPrompt: (loopId: string, round: number, name: string) => Promise<Prompt>
  experimentFromRound: (loopId: string, round: number, name: string) => Promise<Experiment>
  updateSettings: (patch: Partial<Settings>) => Promise<void>
  /** Providers live on the server. These call the API, then mirror the response into the store. */
  loadSettings: () => Promise<void>
  addProvider: (body: CreateProviderBody) => Promise<Provider>
  updateProvider: (id: string, body: UpdateProviderBody) => Promise<Provider>
  removeProvider: (id: string) => Promise<void>
  resetDemo: () => void
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
  loops: [],
  settings: seed.settings,
})

// Runs the user asked to stop. Checked between simulated steps.
const stopRequested = new Set<string>()
const judgeAttempts = new Map<string, number>()
// Runs with an in-flight poll loop, and runs whose results are already loaded.
const polling = new Set<string>()
const loadedDetails = new Set<string>()

export const useStore = create<Data & Actions>()(
  persist(
    (set, get) => {
      const patchRun = (id: string, fn: (r: Run) => Run) =>
        set((s) => ({ runs: s.runs.map((r) => (r.id === id ? fn(r) : r)) }))
      const patchResult = (runId: string, key: string, patch: Partial<Result>) =>
        patchRun(runId, (r) => ({
          ...r,
          results: r.results.map((x) => (x.inputKey === key ? { ...x, ...patch } : x)),
        }))
      const patchLoop = (id: string, fn: (l: OptimizeLoop) => OptimizeLoop) =>
        set((s) => ({ loops: s.loops.map((l) => (l.id === id ? fn(l) : l)) }))
      const getRun = (id: string) => get().runs.find((r) => r.id === id)!

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

      /** The judge step. Only touches results that have an output but no verdict. */
      async function judgeStep(runId: string) {
        const run = getRun(runId)
        const judge = run.snapshot.judge
        if (!judge) return
        const pending = run.results.filter((r) => r.status === 'output_done' || r.status === 'judge_error')
        const inputOf = (key: string) => run.snapshot.inputs.find((i) => i.id === key)!

        if (judge.mode === 'batch') {
          pending.forEach((r) => patchResult(runId, r.inputKey, { status: 'judging' }))
          await sleep(900)
          const attempt = (judgeAttempts.get(runId) ?? 0) + 1
          judgeAttempts.set(runId, attempt)
          if (attempt === 1 && batchJudgeFails(runId)) {
            const got = Math.max(1, pending.length - 2)
            pending.forEach((r) => patchResult(runId, r.inputKey, { status: 'judge_error' }))
            patchRun(runId, (r) => ({
              ...r,
              status: 'judge_error',
              error: `Batch judge returned ${got} entries for ${pending.length} outputs. Outputs were kept.`,
            }))
            return
          }
          pending.forEach((r) =>
            patchResult(runId, r.inputKey, {
              status: 'judged',
              judge: judgeOutput(judge, run.snapshot.prompt, inputOf(r.inputKey)),
            }),
          )
        } else {
          for (const r of pending) {
            if (stopRequested.has(runId)) return
            patchResult(runId, r.inputKey, { status: 'judging' })
            await sleep(260)
            patchResult(runId, r.inputKey, {
              status: 'judged',
              judge: judgeOutput(judge, run.snapshot.prompt, inputOf(r.inputKey)),
            })
          }
        }
      }

      async function execute(runId: string) {
        const run = getRun(runId)
        for (const res of run.results) {
          if (stopRequested.has(runId)) break
          if (res.output) continue
          patchResult(runId, res.inputKey, { status: 'generating' })
          await sleep(380)
          const input = run.snapshot.inputs.find((i) => i.id === res.inputKey)!
          patchResult(runId, res.inputKey, { status: 'output_done', output: generateOutput(run.snapshot.prompt, input) })
        }
        if (!stopRequested.has(runId)) await judgeStep(runId)
        const after = getRun(runId)
        if (stopRequested.has(runId)) {
          stopRequested.delete(runId)
          patchRun(runId, (r) => ({ ...r, status: 'stopped' }))
        } else if (after.status !== 'judge_error') {
          patchRun(runId, (r) => ({ ...r, status: 'done', error: undefined }))
        }
      }

      /** Builds a snapshot and an empty run. Doesn't start it. */
      function createRun(
        experimentId: string,
        opts: { promptText?: string; promptName?: string; labels?: Input['label'][]; loopId?: string; round?: number; kind?: Run['kind'] } = {},
      ): string {
        const s = get()
        const e = s.experiments.find((x) => x.id === experimentId)
        if (!e) throw new Error('Experiment not found.')
        // A deleted prompt leaves the reference null; the experiment can't run until one is picked.
        if (!e.promptId) throw new Error('This experiment has no prompt. Pick one before running.')
        const prompt = s.prompts.find((p) => p.id === e.promptId)
        if (!prompt) throw new Error('The prompt for this experiment is missing. Pick one before running.')
        // A null judge is prompt-only: outputs are saved, never scored.
        const judge = e.judgeId ? (s.judges.find((j) => j.id === e.judgeId) ?? null) : null
        let ins = s.inputs.filter((i) => e.inputIds.includes(i.id))
        if (opts.labels) ins = ins.filter((i) => opts.labels!.includes(i.label))
        const run: Run = {
          id: uid(),
          experimentId,
          kind: opts.kind ?? 'run',
          loopId: opts.loopId,
          round: opts.round,
          startedAt: Date.now(),
          status: 'running',
          snapshot: {
            prompt: { ...prompt, text: opts.promptText ?? prompt.text, name: opts.promptName ?? prompt.name },
            inputs: ins.map((i) => ({ ...i })),
            judge: judge ? structuredClone(judge) : null,
            providers: snapshotProviders(s.settings.providers, [prompt.model, ...(judge ? [judge.model] : [])]),
          },
          results: ins.map((i) => ({ inputKey: i.id, status: 'pending' })),
        }
        set((st) => ({ runs: [...st.runs, run] }))
        return run.id
      }

      async function waitForRun(runId: string) {
        await execute(runId)
        // A judge error inside a loop gets one automatic retry from the judge step.
        if (getRun(runId).status === 'judge_error') {
          patchRun(runId, (r) => ({ ...r, status: 'running' }))
          await judgeStep(runId)
          if (getRun(runId).status !== 'judge_error') patchRun(runId, (r) => ({ ...r, status: 'done', error: undefined }))
        }
      }

      async function optimizeLoop(loopId: string) {
        const loop = () => get().loops.find((l) => l.id === loopId)!
        const e = get().experiments.find((x) => x.id === loop().experimentId)!
        const prompt = get().prompts.find((p) => p.id === e.promptId)!
        const labels: Input['label'][] = ['train', 'validation']

        let text = prompt.text
        const baseRun = createRun(e.id, { labels, loopId, round: 0, promptName: `${prompt.name} (original)` })
        patchLoop(loopId, (l) => ({ ...l, rounds: [{ index: 0, promptText: text, runId: baseRun, note: '' }] }))
        await waitForRun(baseRun)
        patchLoop(loopId, (l) => ({ ...l, rounds: l.rounds.map((r) => (r.index === 0 ? { ...r, note: roundNote(1) } : r)) }))

        const max = loop().mode === '1-pass' ? 1 : loop().maxRounds
        let reason = `Used all ${max} round${max > 1 ? 's' : ''}.`
        for (let round = 1; round <= max; round++) {
          if (loop().status !== 'running') {
            reason = `Stopped by you after round ${round - 1}.`
            break
          }
          await sleep(700) // optimizer call
          text = optimizePrompt(text, round, loop().instructions)
          const runId = createRun(e.id, { labels, loopId, round, promptText: text, promptName: `${prompt.name} (round ${round})` })
          patchLoop(loopId, (l) => ({ ...l, rounds: [...l.rounds, { index: round, promptText: text, runId, note: '' }] }))
          await waitForRun(runId)
          patchLoop(loopId, (l) => ({
            ...l,
            rounds: l.rounds.map((r) => (r.index === round ? { ...r, note: roundNote(round + 1) } : r)),
          }))
          if (loop().earlyStop && goodEnough(text) && round < max) {
            reason = `Optimizer stopped early after round ${round}: it judged the prompt good enough.`
            break
          }
        }
        const wasStopped = loop().status === 'stopped'
        patchLoop(loopId, (l) => ({
          ...l,
          status: wasStopped ? 'stopped' : 'done',
          stopReason: wasStopped ? `Stopped by you after round ${l.rounds.length - 1}.` : reason,
          summary:
            'Main changes: shorter summaries (2 sentences max), the customer\'s ask moved to the first sentence, and speculation removed. ' +
            'Validation clarity rose in early rounds, then flattened. Check validation before picking a round; train scores rise faster than validation ones.',
        }))
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
        /** Deletes the project on the server, then its library objects, experiments, runs and loops here. */
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
              loops: s.loops.filter((l) => !expIds.has(l.experimentId)),
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
            loops: s.loops.filter((l) => l.experimentId !== id),
          }))
        },

        startRun: async (experimentId) => {
          const run = runFromApi(await runsApi.start(Number(experimentId)))
          upsertRun(run)
          pollRun(run.id)
          return run.id
        },
        retryJudge: async (runId) => {
          const current = get().runs.find((r) => r.id === runId)
          // Simulated optimize-loop runs still use the local judge step.
          if (current?.loopId) {
            patchRun(runId, (r) => ({ ...r, status: 'running', error: undefined }))
            await judgeStep(runId)
            if (getRun(runId).status !== 'judge_error') patchRun(runId, (r) => ({ ...r, status: 'done' }))
            return
          }

          const run = runFromApi(await runsApi.retryJudging(Number(runId)))
          loadedDetails.add(runId)
          upsertRun(run)
          pollRun(runId)
        },
        stopRun: async (runId) => {
          const current = get().runs.find((r) => r.id === runId)
          // Loops are simulated, so their stop is the in-memory flag.
          if (current?.loopId) {
            stopRequested.add(runId)
            return
          }

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
              runs: [...s.runs.filter((r) => r.loopId || r.experimentId !== experimentId), ...merged],
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

        startOptimize: (experimentId, cfg) => {
          const e = get().experiments.find((x) => x.id === experimentId)
          if (!e?.promptId || !e.judgeId) throw new Error('This experiment needs a prompt and a judge before it can optimize.')
          const l: OptimizeLoop = { id: uid(), experimentId, ...cfg, status: 'running', rounds: [], startedAt: Date.now() }
          set((s) => ({ loops: [...s.loops, l] }))
          void optimizeLoop(l.id)
          return l.id
        },
        stopLoop: (loopId) => patchLoop(loopId, (l) => ({ ...l, status: 'stopped' })),

        runTest: (loopId, round) => {
          const l = get().loops.find((x) => x.id === loopId)!
          const r = l.rounds.find((x) => x.index === round)!
          const runId = createRun(l.experimentId, {
            labels: ['test'],
            loopId,
            round,
            kind: 'test',
            promptText: r.promptText,
            promptName: `round ${round} (test)`,
          })
          patchLoop(loopId, (x) => ({
            ...x,
            rounds: x.rounds.map((y) => (y.index === round ? { ...y, testRunId: runId } : y)),
          }))
          void execute(runId)
        },

        saveRoundPrompt: async (loopId, round, name) => {
          const s = get()
          const l = s.loops.find((x) => x.id === loopId)!
          const e = s.experiments.find((x) => x.id === l.experimentId)!
          const base = e.promptId ? s.prompts.find((p) => p.id === e.promptId) : undefined
          if (!base) throw new Error('This experiment has no prompt to copy.')
          const r = l.rounds.find((x) => x.index === round)!
          return get().savePrompt({ ...base, id: '', name, text: r.promptText })
        },
        experimentFromRound: async (loopId, round, name) => {
          const prompt = await get().saveRoundPrompt(loopId, round, name)
          const s = get()
          const l = s.loops.find((x) => x.id === loopId)!
          const orig = s.experiments.find((x) => x.id === l.experimentId)!
          return get().saveExperiment({ ...orig, id: '', name, promptId: prompt.id, createdAt: Date.now() })
        },

        // The server owns settings. On load we overwrite the cached copy; if the
        // server is down we keep showing the cache instead of an empty screen.
        loadSettings: async () => {
          try {
            const s = await settingsApi.get()
            set({ settings: { defaultOptimizerModel: s.defaultOptimizerModel, providers: s.providers } })
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

        updateSettings: async (patch: Partial<Settings>) => {
          // Optimistic: apply locally first, then persist. If the server is
          // unreachable we keep the local change rather than reverting silently.
          set((s) => ({ settings: { ...s.settings, ...patch } }))
          try {
            await settingsApi.update(patch)
          } catch {}
        },
        // Projects, the library and experiments live on the server. Only the
        // simulated runs and loops are stored in this browser.
        resetDemo: () => set({ runs: [], loops: [] }),
      }
    },
    {
      name: 'promptimize-prototype',
      version: 5,
      // v2 changed the provider shape (kind, models, base URL); older saves get the example providers.
      // v3 moved projects to the server; the old browser copies (string ids) are dropped.
      // v4 moved the library and experiments to the server; the seed-backed copies and
      // the runs that snapshotted them are dropped.
      // v5 runs live on the server too, so the old simulated runs (and the loops that
      // pointed at them) are dropped; runs are reloaded from the server per experiment.
      migrate: (state, version) => {
        const s = state as Data
        if (version < 2) s.settings = seed.settings
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
          s.loops = []
        }
        if (version < 5) {
          s.runs = []
          s.loops = []
        }
        return s
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return
        // Only simulated loop runs die with the tab. Server runs keep their
        // status and are fetched again when their experiment is opened.
        state.runs = state.runs.map((r) =>
          r.loopId && r.status === 'running' ? { ...r, status: 'stopped', error: 'Interrupted: the page was reloaded while this loop run was going.' } : r,
        )
        state.loops = state.loops.map((l) =>
          l.status === 'running' ? { ...l, status: 'stopped', stopReason: 'Interrupted: the page was reloaded.' } : l,
        )
      },
      partialize: (s) => ({
        projectId: s.projectId,
        runs: s.runs,
        loops: s.loops,
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
  return runs
    .filter((r) => r.experimentId === experimentId && !r.loopId)
    .sort((a, b) => b.startedAt - a.startedAt)[0]
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

/** Prompts and judges (in any project) that use a given model id. */
export function modelUsage(s: { prompts: Prompt[]; judges: Judge[]; settings: Settings }, modelId: string) {
  return {
    prompts: s.prompts.filter((p) => p.model === modelId),
    judges: s.judges.filter((j) => j.model === modelId),
    optimizerDefault: s.settings.defaultOptimizerModel === modelId,
  }
}
