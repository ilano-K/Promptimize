// All app state lives here. In the real app the server owns this data and the
// browser polls it; in the prototype the store plays the server's role and the
// "model calls" come from sim.ts. State is saved to localStorage so a reload
// keeps your work (runs in flight on reload are marked as stopped, like a
// server restart marks them "interrupted").

import type { CreateProjectBody, UpdateProjectBody } from '@promptimize/shared'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { projectsApi } from './api'
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
  /** The open project's id as a string (the library and experiments still key on strings). */
  projectId: string
  inputs: Input[]
  prompts: Prompt[]
  judges: Judge[]
  experiments: Experiment[]
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
  saveInput: (i: Input) => void
  savePrompt: (p: Prompt) => void
  saveJudge: (j: Judge) => void
  deleteObject: (kind: 'input' | 'prompt' | 'judge', id: string) => void
  saveExperiment: (e: Experiment) => void
  deleteExperiment: (id: string) => void
  startRun: (experimentId: string) => string
  retryJudge: (runId: string) => void
  stopRun: (runId: string) => void
  startOptimize: (experimentId: string, cfg: OptimizeConfig) => string
  stopLoop: (loopId: string) => void
  runTest: (loopId: string, round: number) => void
  saveRoundPrompt: (loopId: string, round: number, name: string) => string
  experimentFromRound: (loopId: string, round: number, name: string) => string
  updateSettings: (s: Partial<Settings>) => void
  resetDemo: () => void
}

const initial = (): Data => ({
  projects: [],
  projectsStatus: 'loading',
  projectId: '',
  inputs: seed.inputs,
  prompts: seed.prompts,
  judges: seed.judges,
  experiments: seed.experiments,
  runs: seed.runs,
  loops: [],
  settings: seed.settings,
})

// Runs the user asked to stop. Checked between simulated steps.
const stopRequested = new Set<string>()
const judgeAttempts = new Map<string, number>()

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
        const e = s.experiments.find((x) => x.id === experimentId)!
        const prompt = s.prompts.find((p) => p.id === e.promptId)!
        const judge = e.judgeId ? s.judges.find((j) => j.id === e.judgeId) ?? null : null
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
            set({ projects: await projectsApi.list(), projectsStatus: 'ready' })
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

        saveInput: (i) => set((s) => ({ inputs: upsert(s.inputs, i) })),
        savePrompt: (p) => set((s) => ({ prompts: upsert(s.prompts, p) })),
        saveJudge: (j) => set((s) => ({ judges: upsert(s.judges, j) })),
        deleteObject: (kind, id) =>
          set((s) =>
            kind === 'input'
              ? { inputs: s.inputs.filter((x) => x.id !== id) }
              : kind === 'prompt'
                ? { prompts: s.prompts.filter((x) => x.id !== id) }
                : { judges: s.judges.filter((x) => x.id !== id) },
          ),

        saveExperiment: (e) => set((s) => ({ experiments: upsert(s.experiments, e) })),
        deleteExperiment: (id) =>
          set((s) => ({
            experiments: s.experiments.filter((x) => x.id !== id),
            runs: s.runs.filter((r) => r.experimentId !== id),
            loops: s.loops.filter((l) => l.experimentId !== id),
          })),

        startRun: (experimentId) => {
          const id = createRun(experimentId)
          void execute(id)
          return id
        },
        retryJudge: (runId) => {
          patchRun(runId, (r) => ({ ...r, status: 'running', error: undefined }))
          void (async () => {
            await judgeStep(runId)
            if (getRun(runId).status !== 'judge_error') patchRun(runId, (r) => ({ ...r, status: 'done' }))
          })()
        },
        stopRun: (runId) => {
          stopRequested.add(runId)
        },

        startOptimize: (experimentId, cfg) => {
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

        saveRoundPrompt: (loopId, round, name) => {
          const s = get()
          const l = s.loops.find((x) => x.id === loopId)!
          const e = s.experiments.find((x) => x.id === l.experimentId)!
          const base = s.prompts.find((p) => p.id === e.promptId)!
          const r = l.rounds.find((x) => x.index === round)!
          const p: Prompt = { ...base, id: uid(), name, text: r.promptText }
          set((st) => ({ prompts: [...st.prompts, p] }))
          return p.id
        },
        experimentFromRound: (loopId, round, name) => {
          const promptId = get().saveRoundPrompt(loopId, round, name)
          const l = get().loops.find((x) => x.id === loopId)!
          const orig = get().experiments.find((x) => x.id === l.experimentId)!
          const e: Experiment = { ...orig, id: uid(), name, promptId, createdAt: Date.now() }
          set((s) => ({ experiments: [...s.experiments, e] }))
          return e.id
        },

        updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
        // Projects are real data on the server, so a demo reset leaves them alone.
        resetDemo: () => {
          const { projects, projectsStatus, projectsError, projectId } = get()
          set({ ...initial(), projects, projectsStatus, projectsError, projectId })
        },
      }
    },
    {
      name: 'promptimize-prototype',
      version: 3,
      // v2 changed the provider shape (kind, models, base URL); older saves get the example providers.
      // v3 moved projects to the server; the old browser copies (string ids) are dropped.
      migrate: (state, version) => {
        const s = state as Data
        if (version < 2) s.settings = seed.settings
        if (version < 3) {
          delete (s as Partial<Data>).projects
          s.projectId = ''
        }
        return s
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return
        state.runs = state.runs.map((r) =>
          r.status === 'running' ? { ...r, status: 'stopped', error: 'Interrupted: the page was reloaded while this run was going.' } : r,
        )
        state.loops = state.loops.map((l) =>
          l.status === 'running' ? { ...l, status: 'stopped', stopReason: 'Interrupted: the page was reloaded.' } : l,
        )
      },
      partialize: (s) => ({
        projectId: s.projectId,
        inputs: s.inputs,
        prompts: s.prompts,
        judges: s.judges,
        experiments: s.experiments,
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

/** Prompts and judges (in any project) that use a given model id. */
export function modelUsage(s: { prompts: Prompt[]; judges: Judge[]; settings: Settings }, modelId: string) {
  return {
    prompts: s.prompts.filter((p) => p.model === modelId),
    judges: s.judges.filter((j) => j.model === modelId),
    optimizerDefault: s.settings.defaultOptimizerModel === modelId,
  }
}
