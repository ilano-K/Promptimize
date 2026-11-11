import { ArrowsLeftRight, Columns, Warning } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import type { CompareTag } from '@promptimize/shared'
import { compareApi } from '../api'
import { Button, Empty, LabelTag, PageHeader, Panel, Score, Tag } from '../components/ui'
import { errorMessage, timeAgo } from '../components/ui.helpers'
import { Select } from '../components/Select'
import { go } from '../router'
import { averages, useStoreShallow } from '../store'
import type { Result, Run } from '../types'
import { comparisonFromApi, type CompareView } from '../mappers'
import { JudgeResult } from './Experiment'

// What each server tag kind means to a reader. The server owns the diff; the
// screen only chooses wording.
const tagTitles: Record<CompareTag['kind'], string> = {
  'prompt.text': 'Prompt text',
  'prompt.model': 'Prompt model',
  'prompt.outputSchema': 'Output schema',
  'judge.present': 'Judge',
  'judge.basePrompt': 'Judge prompt',
  'judge.characteristics': 'Judge characteristics',
  'judge.mode': 'Judge mode',
  'judge.model': 'Judge model',
  'input.present': 'Input',
  'input.content': 'Input text',
  'input.label': 'Input label',
  'model.present': 'Provider',
  'model.kind': 'Provider type',
  'model.baseUrl': 'Provider endpoint',
}

const tagText = (tag: CompareTag) =>
  tag.target ? `${tagTitles[tag.kind]} · ${tag.target}` : tagTitles[tag.kind]

/** One side of a row: the result, "no output", or "not in this run". */
function Cell({ result, present, side }: { result: Result | null; present: boolean; side: 'A' | 'B' }) {
  // Presence comes from the snapshot, not from the result: a run that never
  // wrote a result still has the input.
  if (!present) return <p className="text-[13px] text-fg-3">Only in run {side === 'A' ? 'B' : 'A'}.</p>
  if (!result) return <p className="text-[13px] text-fg-3">No result in this run.</p>

  return (
    <>
      <pre className="font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap">
        {result.output || 'No output'}
      </pre>
      {result.status === 'judge_error' ? (
        <p className="border-t border-line pt-3 text-[13px] text-danger">No verdict. Output kept.</p>
      ) : result.judge ? (
        <div className="border-t border-line pt-3">
          <JudgeResult values={result.judge} />
        </div>
      ) : null}
    </>
  )
}

export function Compare({ a, b }: { a?: string; b?: string }) {
  const s = useStoreShallow((st) => ({
    experiments: st.experiments,
    projectId: st.projectId,
    runs: st.runs,
    prompts: st.prompts,
    loadRuns: st.loadRuns,
  }))

  const exps = s.experiments.filter((e) => e.projectId === s.projectId)
  // Each side picks an experiment, then one of its runs (latest by default). Value format: "expId:runId".
  const runsOf = (id: string) =>
    s.runs
      .filter((r) => r.experimentId === id && !r.loopId && !['pending', 'running', 'stopping'].includes(r.status))
      .sort((x, y) => y.startedAt - x.startedAt)
  const resolve = (v?: string) => {
    if (!v) return undefined
    const [eid, rid] = v.split(':')
    const runs = runsOf(eid)
    return { eid, run: runs.find((r) => r.id === rid) ?? runs[0] }
  }
  const A = resolve(a)
  const B = resolve(b)
  const set = (side: 'a' | 'b', v: string) => {
    const q = new URLSearchParams({ ...(a ? { a } : {}), ...(b ? { b } : {}), [side]: v })
    go(`compare?${q}`)
  }

  // Runs are not loaded for experiments the user never opened, so a picked
  // experiment has to fetch its history before a run can be chosen.
  const asked = useRef(new Set<string>())
  useEffect(() => {
    for (const v of [a, b]) {
      const eid = v?.split(':')[0]
      if (!eid || asked.current.has(eid) || runsOf(eid).length > 0) continue
      asked.current.add(eid)
      void s.loadRuns(eid).catch(() => {})
    }
  })

  const ra = A?.run
  const rb = B?.run
  // A comparison belongs to one run pair, so the answer is stored with the
  // pair that produced it: a late response for an old pair can never be shown
  // against a newer selection.
  const pair = ra && rb ? `${ra.id}:${rb.id}` : null

  const [loaded, setLoaded] = useState<{ pair: string; view: CompareView } | null>(null)
  const [failed, setFailed] = useState<{ pair: string; message: string } | null>(null)
  const [attempt, setAttempt] = useState(0)

  // The comparison is server data: one request per run pair, nothing kept.
  useEffect(() => {
    if (!pair) return
    const [runA, runB] = pair.split(':')
    let live = true
    compareApi
      .compare(Number(runA), Number(runB))
      .then((x) => {
        if (live) setLoaded({ pair, view: comparisonFromApi(x) })
      })
      .catch((err) => {
        if (live) setFailed({ pair, message: errorMessage(err) })
      })
    return () => {
      live = false
    }
  }, [pair, attempt])

  const view = pair && loaded?.pair === pair ? loaded.view : null
  const error = pair && failed?.pair === pair ? failed.message : null
  // Nothing is on screen for this pair yet and no request has failed.
  const loading = pair !== null && !view && !error

  const picker = (side: 'a' | 'b', cur?: { eid: string; run?: Run }) => (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-fg-3" htmlFor={`exp-${side}`}>
        {side === 'a' ? 'Left' : 'Right'}
      </label>
      <Select
        id={`exp-${side}`}
        value={cur?.eid ?? ''}
        onChange={(v) => set(side, v)}
        placeholder="Choose experiment"
        options={exps.map((e) => {
          const p = s.prompts.find((x) => x.id === e.promptId)
          const count = runsOf(e.id).length
          return { value: e.id, label: e.name, hint: p?.name ?? (count ? `${count} runs` : 'no runs yet') }
        })}
      />
      {cur && runsOf(cur.eid).length > 1 && (
        <Select
          aria-label="Run"
          size="sm"
          value={cur.run?.id ?? ''}
          onChange={(v) => set(side, `${cur.eid}:${v}`)}
          options={runsOf(cur.eid).map((r, i, all) => ({
            value: r.id,
            label: `Run ${all.length - i}`,
            hint: timeAgo(r.startedAt),
          }))}
        />
      )}
    </div>
  )

  return (
    <>
      <PageHeader title="Compare" sub="Two runs side by side. You decide which is better; the app won't pick a winner." />

      <Panel className="mb-6 grid gap-4 p-5 md:grid-cols-[1fr_auto_1fr] md:items-start">
        {picker('a', A)}
        <Button
          variant="ghost"
          className="self-center md:mt-5"
          aria-label="Swap sides"
          disabled={!a || !b}
          onClick={() => go(`compare?a=${b}&b=${a}`)}
        >
          <ArrowsLeftRight size={16} />
        </Button>
        {picker('b', B)}
      </Panel>

      {!ra || !rb ? (
        <Empty
          icon={<Columns size={28} />}
          title={exps.length === 0 ? 'No experiments yet' : 'Pick two runs'}
          body={
            exps.length === 0
              ? 'Create an experiment, run it twice, then come back to compare the two runs.'
              : 'Latest runs are shown by default. Two runs of the same experiment are fine: you can compare an edited prompt against its earlier version.'
          }
          action={exps.length === 0 ? <Button onClick={() => go('experiments')}>Go to experiments</Button> : undefined}
        />
      ) : error ? (
        <Panel className="flex flex-col gap-3 p-5">
          <p className="text-sm font-medium text-danger">Couldn't compare these runs.</p>
          <p className="text-[13px] text-fg-2">{error}</p>
          <Button
            className="self-start"
            onClick={() => {
              setFailed(null)
              setAttempt((n) => n + 1)
            }}
          >
            Try again
          </Button>
        </Panel>
      ) : !view ? (
        <p className="text-[13px] text-fg-3">{loading ? 'Comparing…' : 'No comparison yet.'}</p>
      ) : (
        <>
          {view.tags.length > 0 ? (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-warn">
                  <Warning size={15} /> Not a like-for-like comparison:
                </span>
                {view.tags.map((t) => (
                  <Tag key={`${t.kind}:${t.target ?? ''}`} tone="warn">
                    {tagText(t)}
                  </Tag>
                ))}
              </div>
              <Panel className="mb-6 p-4">
                <ul className="flex flex-col gap-3">
                  {view.tags.map((t) => (
                    <li key={`diff:${t.kind}:${t.target ?? ''}`} className="grid gap-2 md:grid-cols-[10rem_1fr_1fr]">
                      <span className="text-[13px] font-medium">{tagTitles[t.kind]}</span>
                      <pre className="font-mono text-[12px] whitespace-pre-wrap text-fg-2">{t.a ?? '—'}</pre>
                      <pre className="font-mono text-[12px] whitespace-pre-wrap text-fg-2">{t.b ?? '—'}</pre>
                    </li>
                  ))}
                </ul>
              </Panel>
            </>
          ) : (
            <p className="mb-6 text-[13px] text-fg-2">
              No snapshot differences: both runs used the same prompt, inputs, judge and models.
            </p>
          )}

          <div className="mb-6 grid gap-3 md:grid-cols-2">
            {[view.a, view.b].map((r, i) => (
              <Panel key={i} className="p-4">
                <p className="font-medium">{s.experiments.find((e) => e.id === r.experimentId)?.name}</p>
                <p className="font-mono text-xs text-fg-3">
                  {r.snapshot.prompt.name} on {r.snapshot.prompt.model}
                </p>
                <div className="mt-3 flex flex-wrap gap-6">
                  {Object.entries(averages(r)).map(([k, v]) => (
                    <div key={k} className="flex flex-col">
                      <span className="font-mono text-[11px] text-fg-3">avg {k}</span>
                      <Score value={v} />
                    </div>
                  ))}
                  {!r.snapshot.judge && <span className="text-[13px] text-fg-3">Prompt-only, no scores</span>}
                </div>
              </Panel>
            ))}
          </div>

          <ul className="flex flex-col gap-3">
            {view.rows.map((row) => {
              const inA = view.a.snapshot.inputs.some((i) => i.id === row.inputKey)
              const inB = view.b.snapshot.inputs.some((i) => i.id === row.inputKey)
              return (
                <li key={row.inputKey} className="rounded-[10px] border border-line bg-surface">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line px-4 py-3">
                    <LabelTag label={row.label} />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-fg-3">{row.content}</span>
                  </div>
                  <div className="grid md:grid-cols-2 md:divide-x md:divide-line">
                    {[
                      { key: 'a' as const, res: row.a, present: inA },
                      { key: 'b' as const, res: row.b, present: inB },
                    ].map((cell) => (
                      <div key={cell.key} className="flex flex-col gap-3 p-4">
                        <Cell result={cell.res} present={cell.present} side={cell.key === 'a' ? 'A' : 'B'} />
                      </div>
                    ))}
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </>
  )
}
