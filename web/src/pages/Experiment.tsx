import { ArrowClockwise, ArrowLeft, Columns, PencilSimple, Play, Sparkle, Stop, Trash, WarningCircle } from '@phosphor-icons/react'
import { useState } from 'react'
import { JudgeEditor, PromptEditor } from '../components/editors'
import { Button, Empty, Field, inputCls, LabelTag, Modal, ModelSelect, PageHeader, Panel, Score, Tag, textareaCls } from '../components/ui'
import { errorMessage, timeAgo } from '../components/ui.helpers'
import { Select } from '../components/Select'
import { go } from '../router'
import { averages, useStoreShallow } from '../store'
import type { Experiment as Exp, Label, Run, RunStatus } from '../types'
import { ExperimentForm } from './Experiments'

export function RunStatusTag({ status }: { status: RunStatus }) {
  if (status === 'running') return <Tag tone="accent">Running</Tag>
  if (status === 'done') return <Tag>Done</Tag>
  if (status === 'judge_error') return <Tag tone="danger">Judge error</Tag>
  return <Tag tone="warn">Stopped</Tag>
}

export function Experiment({ id, runParam }: { id: string; runParam?: string }) {
  const s = useStoreShallow((st) => ({
    experiments: st.experiments,
    prompts: st.prompts,
    judges: st.judges,
    inputs: st.inputs,
    runs: st.runs,
    loops: st.loops,
    startRun: st.startRun,
    deleteExperiment: st.deleteExperiment,
  }))
  const e = s.experiments.find((x) => x.id === id)
  const [editing, setEditing] = useState<'exp' | 'prompt' | 'judge' | null>(null)
  const [optimizing, setOptimizing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  if (!e) {
    return <Empty icon={<WarningCircle size={28} />} title="Experiment not found" body="It may have been deleted." action={<Button onClick={() => go('experiments')}>Back to experiments</Button>} />
  }

  const prompt = s.prompts.find((p) => p.id === e.promptId)
  const judge = s.judges.find((j) => j.id === e.judgeId)
  const ins = s.inputs.filter((i) => e.inputIds.includes(i.id))
  const runs = s.runs.filter((r) => r.experimentId === e.id && !r.loopId).sort((a, b) => b.startedAt - a.startedAt)
  const loops = s.loops.filter((l) => l.experimentId === e.id).sort((a, b) => b.startedAt - a.startedAt)
  const run = runs.find((r) => r.id === runParam) ?? runs[0]
  const running = runs.some((r) => r.status === 'running')
  const split = (l: Label) => ins.filter((i) => i.label === l).length

  // Tell the user when the library changed since the last run's snapshot.
  const changed: string[] = []
  if (runs[0] && prompt) {
    const snap = runs[0].snapshot
    if (snap.prompt.text !== prompt.text || snap.prompt.outputSchema !== prompt.outputSchema) changed.push('prompt')
    if (snap.prompt.model !== prompt.model) changed.push('prompt model')
    if (JSON.stringify(snap.judge) !== JSON.stringify(judge ?? null)) changed.push('judge')
    const snapIns = snap.inputs.map((i) => i.id + i.content + i.label).sort().join()
    if (snapIns !== ins.map((i) => i.id + i.content + i.label).sort().join()) changed.push('inputs')
  }

  return (
    <>
      <a href="#/experiments" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-fg-2 hover:text-fg">
        <ArrowLeft size={14} /> Experiments
      </a>
      <PageHeader
        title={e.name}
        sub={
          !prompt
            ? 'Missing prompt: edit the experiment and pick a new one. Runs need one.'
            : !judge
              ? 'Run sends every input to the prompt; outputs are saved without being scored.'
              : 'Run sends every input to the prompt, then every output to the judge.'
        }
        actions={
          <>
            <Button variant="ghost" onClick={() => setEditing('exp')}>
              <PencilSimple size={15} /> Edit
            </Button>
            <Button onClick={() => go(`compare?a=${e.id}`)} disabled={!runs.length}>
              <Columns size={15} /> Compare
            </Button>
            <Button onClick={() => setOptimizing(true)} disabled={!prompt || !judge || running}>
              <Sparkle size={15} /> Optimize
            </Button>
            <Button variant="primary" disabled={running || !prompt} onClick={() => go(`experiments/${e.id}?run=${s.startRun(e.id)}`)}>
              <Play size={15} weight="fill" /> Run
            </Button>
          </>
        }
      />

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_0.8fr]">
        <Panel className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-fg-3">Prompt</span>
            <Button size="sm" variant="ghost" onClick={() => setEditing('prompt')} disabled={!prompt}>
              Edit
            </Button>
          </div>
          {prompt ? (
            <>
              <p className="font-mono text-sm font-medium">{prompt.name}</p>
              <p className="font-mono text-xs text-fg-3">{prompt.model}</p>
              <pre className="mt-3 max-h-28 overflow-y-auto font-mono text-xs leading-relaxed whitespace-pre-wrap text-fg-2">{prompt.text}</pre>
            </>
          ) : (
            <p className="text-sm text-warn">Missing prompt. Use Edit to pick another one from the library.</p>
          )}
        </Panel>
        <Panel className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-fg-3">Judge</span>
            {judge && (
              <Button size="sm" variant="ghost" onClick={() => setEditing('judge')}>
                Edit
              </Button>
            )}
          </div>
          {judge ? (
            <>
              <p className="text-sm font-medium">{judge.name}</p>
              <p className="font-mono text-xs text-fg-3">
                {judge.model} / {judge.mode}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {judge.characteristics.map((c) => (
                  <span key={c.name} className="inline-flex h-6 items-center gap-1.5 rounded-md border border-line px-2 font-mono text-xs">
                    {c.name} <span className="text-fg-3">{c.type === 'number' ? '0-1' : 'text'}</span>
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-fg-2">No judge. This experiment only generates outputs; add one to score them.</p>
          )}
        </Panel>
        <Panel className="p-4">
          <span className="text-xs text-fg-3">Inputs</span>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{ins.length}</p>
          <div className="mt-3 flex flex-col gap-1.5">
            {(['train', 'validation', 'test'] as Label[]).map((l) => (
              <div key={l} className="flex items-center justify-between">
                <LabelTag label={l} />
                <span className="font-mono text-xs text-fg-2">{split(l)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {changed.length > 0 && !running && (
        <p className="mt-3 flex items-center gap-2 text-[13px] text-warn">
          <WarningCircle size={15} /> The {changed.join(', ')} changed since the last run. The next run will use the new version.
        </p>
      )}

      {loops.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-[15px] font-semibold">Optimize loops</h2>
          <div className="flex flex-col gap-2">
            {loops.map((l) => (
              <a key={l.id} href={`#/experiments/${e.id}/loops/${l.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[10px] border border-line bg-surface px-4 py-3 transition-colors hover:border-line-strong">
                <Sparkle size={16} className="text-accent" />
                <span className="text-sm font-medium">{l.mode === '1-pass' ? '1-pass rewrite' : `N-pass, up to ${l.maxRounds} rounds`}</span>
                <span className="font-mono text-xs text-fg-3">{l.optimizerModel}</span>
                <span className="ml-auto flex items-center gap-3">
                  <span className="text-xs text-fg-3">
                    {Math.max(0, l.rounds.length - 1)} round{l.rounds.length === 2 ? '' : 's'} / {timeAgo(l.startedAt)}
                  </span>
                  {l.status === 'running' ? <Tag tone="accent">Running</Tag> : l.status === 'stopped' ? <Tag tone="warn">Stopped</Tag> : <Tag>Done</Tag>}
                </span>
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold">Runs</h2>
          {runs.length > 1 && (
            <Select
              aria-label="Choose run"
              size="sm"
              className="w-56"
              value={run?.id ?? ''}
              onChange={(id) => go(`experiments/${e.id}?run=${id}`)}
              options={runs.map((r, i) => ({ value: r.id, label: `Run ${runs.length - i}`, hint: `${timeAgo(r.startedAt)}, ${r.status.replace('_', ' ')}` }))}
            />
          )}
        </div>
        {run ? (
          <RunView run={run} />
        ) : (
          <Empty
            icon={<Play size={28} />}
            title="Not run yet"
            body="A run sends every input to the prompt and saves a snapshot of exactly what was used."
            action={
              <Button variant="primary" disabled={!prompt || !judge} onClick={() => go(`experiments/${e.id}?run=${s.startRun(e.id)}`)}>
                <Play size={15} weight="fill" /> Run experiment
              </Button>
            }
          />
        )}
      </section>

      <div className="mt-14 border-t border-line pt-6">
        <Button
          variant="danger"
          size="sm"
          disabled={deleting}
          onClick={() => {
            if (!confirm('Delete this experiment and its runs? Library objects stay.')) return
            setDeleting(true)
            void (async () => {
              try {
                await s.deleteExperiment(e.id)
                go('experiments')
              } catch (err) {
                alert(errorMessage(err))
                setDeleting(false)
              }
            })()
          }}
        >
          <Trash size={14} /> {deleting ? 'Deleting…' : 'Delete experiment'}
        </Button>
      </div>

      {editing === 'exp' && <ExperimentForm initial={e} onClose={() => setEditing(null)} />}
      {editing === 'prompt' && prompt && <PromptEditor initial={prompt} onClose={() => setEditing(null)} />}
      {editing === 'judge' && judge && <JudgeEditor initial={judge} onClose={() => setEditing(null)} />}
      {optimizing && <OptimizeForm experiment={e} onClose={() => setOptimizing(false)} />}
    </>
  )
}

/** Progress, averages and per-input results for one run. */
export function RunView({ run, compact }: { run: Run; compact?: boolean }) {
  const { retryJudge, stopRun } = useStoreShallow((st) => ({ retryJudge: st.retryJudge, stopRun: st.stopRun }))
  const judge = run.snapshot.judge
  const done = run.results.filter((r) => r.output).length
  const judged = run.results.filter((r) => r.status === 'judged').length
  const total = run.results.length
  const avg = averages(run)

  return (
    <div className="flex flex-col gap-4">
      <Panel className="flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <RunStatusTag status={run.status} />
          <span className="text-xs text-fg-3">{timeAgo(run.startedAt)}</span>
        </div>
        <Stat label="Outputs" value={`${done}/${total}`} />
        {judge && <Stat label="Judged" value={`${judged}/${total}`} />}
        {Object.entries(avg).map(([k, v]) => (
          <div key={k} className="flex flex-col">
            <span className="font-mono text-[11px] text-fg-3">avg {k}</span>
            <Score value={v} />
          </div>
        ))}
        <div className="ml-auto flex items-center gap-3">
          {!compact && (
            <span className="hidden font-mono text-xs text-fg-3 lg:inline">
              snapshot: {run.snapshot.prompt.model}
              {judge && ` / judge ${judge.model}`}
            </span>
          )}
          {run.status === 'running' && (
            <Button size="sm" onClick={() => stopRun(run.id)}>
              <Stop size={13} weight="fill" /> Stop
            </Button>
          )}
        </div>
        {run.status === 'running' && (
          <div className="h-0.5 w-full overflow-hidden rounded-full">
            <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${((done + judged) / (total * (judge ? 2 : 1))) * 100}%` }} />
          </div>
        )}
      </Panel>

      {run.status === 'judge_error' && (
        <div className="flex flex-col gap-3 rounded-[10px] border border-danger/30 bg-danger-soft px-5 py-4 sm:flex-row sm:items-center">
          <WarningCircle size={20} className="shrink-0 text-danger" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-danger">The judge's response couldn't be parsed.</p>
            <p className="mt-0.5 text-fg-2">{run.error} Retrying only re-runs the judge step.</p>
          </div>
          <Button onClick={() => retryJudge(run.id)}>
            <ArrowClockwise size={15} /> Retry judge step
          </Button>
        </div>
      )}
      {run.status === 'stopped' && run.error && <p className="text-[13px] text-warn">{run.error}</p>}

      <ul className="flex flex-col gap-2">
        {run.results.map((r) => {
          const input = run.snapshot.inputs.find((i) => i.id === r.inputKey)!
          return (
            <li key={r.inputKey} className={`grid gap-4 rounded-[10px] border border-line bg-surface p-4 ${judge ? 'lg:grid-cols-[0.9fr_1.3fr_1fr]' : 'lg:grid-cols-[0.9fr_2fr]'}`}>
              <div className="min-w-0">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-sm font-medium">{input.name}</span>
                  <LabelTag label={input.label} />
                </div>
                <p className="text-[13px] leading-relaxed text-fg-2">{input.content}</p>
              </div>
              <div className="min-w-0">
                <span className="mb-1.5 block text-xs text-fg-3">Output</span>
                {r.output ? (
                  <pre className="font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap text-fg">{r.output}</pre>
                ) : r.status === 'generating' ? (
                  <Skeleton lines={3} />
                ) : (
                  <p className="text-[13px] text-fg-3">{run.status === 'stopped' ? 'Not generated (run stopped)' : 'Waiting'}</p>
                )}
              </div>
              {judge && (
                <div className="min-w-0">
                  <span className="mb-1.5 block text-xs text-fg-3">Judge</span>
                  {r.status === 'judged' && r.judge ? (
                    <JudgeResult values={r.judge} />
                  ) : r.status === 'judging' ? (
                    <Skeleton lines={2} />
                  ) : r.status === 'judge_error' ? (
                    <p className="text-[13px] text-danger">No verdict. Output kept.</p>
                  ) : (
                    <p className="text-[13px] text-fg-3">Waiting</p>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function JudgeResult({ values, prev }: { values: Record<string, string | number>; prev?: Record<string, string | number> }) {
  return (
    <dl className="flex flex-col gap-2">
      {Object.entries(values).map(([k, v]) => (
        <div key={k} className={typeof v === 'number' ? 'flex items-center justify-between gap-3' : ''}>
          <dt className="font-mono text-xs text-fg-3">{k}</dt>
          <dd className={typeof v === 'number' ? '' : 'mt-0.5 text-[13px] leading-snug text-fg-2'}>
            {typeof v === 'number' ? <Score value={v} prev={typeof prev?.[k] === 'number' ? (prev[k] as number) : undefined} /> : v}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] text-fg-3">{label}</span>
      <span className="font-mono text-sm tabular-nums">{value}</span>
    </div>
  )
}

function Skeleton({ lines }: { lines: number }) {
  return (
    <div className="flex flex-col gap-1.5" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton h-3 rounded" style={{ width: `${90 - i * 18}%` }} />
      ))}
    </div>
  )
}

function OptimizeForm({ experiment, onClose }: { experiment: Exp; onClose: () => void }) {
  const s = useStoreShallow((st) => ({ settings: st.settings, inputs: st.inputs, startOptimize: st.startOptimize }))
  const [mode, setMode] = useState<'1-pass' | 'n-pass'>('n-pass')
  const [maxRounds, setMaxRounds] = useState(4)
  const [earlyStop, setEarlyStop] = useState(true)
  const [model, setModel] = useState(s.settings.defaultOptimizerModel)
  const [instructions, setInstructions] = useState('')
  const ins = s.inputs.filter((i) => experiment.inputIds.includes(i.id))
  const count = (l: Label) => ins.filter((i) => i.label === l).length

  return (
    <Modal
      title="Optimize prompt"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={count('train') === 0}
            onClick={() => {
              const id = s.startOptimize(experiment.id, { mode, maxRounds, earlyStop, optimizerModel: model, instructions })
              onClose()
              go(`experiments/${experiment.id}/loops/${id}`)
            }}
          >
            <Sparkle size={15} /> Start
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['1-pass', '1-pass', 'One rewrite, then one run.'],
              ['n-pass', 'N-pass', 'Rewrite, run and judge in a loop.'],
            ] as const
          ).map(([m, t, b]) => (
            <label key={m} className={`cursor-pointer rounded-md border px-3 py-2.5 ${mode === m ? 'border-accent bg-accent-soft' : 'border-line-strong hover:bg-surface-2'}`}>
              <input type="radio" className="sr-only" checked={mode === m} onChange={() => setMode(m)} />
              <span className="text-sm font-medium">{t}</span>
              <span className="block text-xs text-fg-2">{b}</span>
            </label>
          ))}
        </div>

        {mode === 'n-pass' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Max rounds">
              {(id) => <input id={id} type="number" min={2} max={10} className={inputCls} value={maxRounds} onChange={(e) => setMaxRounds(Math.max(2, Math.min(10, +e.target.value || 2)))} />}
            </Field>
            <fieldset>
              <legend className="mb-1.5 text-[13px] font-medium">When to stop</legend>
              <div className="flex flex-col gap-1.5 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" className="accent-[var(--accent)]" checked={earlyStop} onChange={() => setEarlyStop(true)} /> May stop early
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" className="accent-[var(--accent)]" checked={!earlyStop} onChange={() => setEarlyStop(false)} /> Always use all rounds
                </label>
              </div>
            </fieldset>
          </div>
        )}

        <Field label="Optimizer model" help="Default comes from settings. Recorded with the result.">
          {(id) => <ModelSelect id={id} value={model} onChange={setModel} />}
        </Field>
        <Field label="Instructions (optional)" help='Constraints for the rewrite, e.g. "keep it under 200 words".'>
          {(id) => <textarea id={id} rows={2} className={textareaCls} value={instructions} onChange={(e) => setInstructions(e.target.value)} />}
        </Field>

        <div className="rounded-md bg-surface-2 px-4 py-3 text-[13px] leading-relaxed text-fg-2">
          <p className="mb-1.5 font-medium text-fg">What the optimizer sees</p>
          <ul className="flex flex-col gap-1">
            <li className="flex items-center gap-2">
              <LabelTag label="train" /> {count('train')} inputs, in full
            </li>
            <li className="flex items-center gap-2">
              <LabelTag label="validation" /> {count('validation')} inputs, number scores only
            </li>
            <li className="flex items-center gap-2">
              <LabelTag label="test" /> {count('test')} inputs, never. Run them later on a round you pick.
            </li>
          </ul>
          {count('train') === 0 && <p className="mt-2 text-danger">Add at least one train input to optimize.</p>}
          {count('validation') === 0 && count('train') > 0 && <p className="mt-2 text-warn">No validation inputs: you won't be able to tell real gains from overfitting.</p>}
        </div>
      </div>
    </Modal>
  )
}
