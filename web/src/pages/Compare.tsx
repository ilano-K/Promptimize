import { ArrowsLeftRight, Columns, Warning } from '@phosphor-icons/react'
import { Button, Empty, LabelTag, PageHeader, Panel, Score, Tag } from '../components/ui'
import { timeAgo } from '../components/ui.helpers'
import { Select } from '../components/Select'
import { go } from '../router'
import { averages, useStoreShallow } from '../store'
import type { Run } from '../types'
import { JudgeResult } from './Experiment'

/** What differs between two snapshots, apart from the prompt being compared. Any change counts. */
function differences(a: Run, b: Run): string[] {
  const out: string[] = []
  const key = (r: Run) =>
    r.snapshot.inputs
      .map((i) => `${i.id}|${i.content}|${i.label}`)
      .sort()
      .join('\n')
  if (key(a) !== key(b)) out.push('Inputs differ')
  const ja = a.snapshot.judge
  const jb = b.snapshot.judge
  if (!ja !== !jb) out.push('One side has no judge')
  else if (ja && jb) {
    if (ja.basePrompt !== jb.basePrompt || JSON.stringify(ja.characteristics) !== JSON.stringify(jb.characteristics)) out.push('Judge prompt or characteristics differ')
    if (ja.mode !== jb.mode) out.push(`Judge mode: ${ja.mode} vs ${jb.mode}`)
    if (ja.model !== jb.model) out.push(`Judge model: ${ja.model} vs ${jb.model}`)
  }
  if (a.snapshot.prompt.model !== b.snapshot.prompt.model) out.push(`Prompt model: ${a.snapshot.prompt.model} vs ${b.snapshot.prompt.model}`)
  if (a.snapshot.prompt.outputSchema !== b.snapshot.prompt.outputSchema) out.push('Output schema differs')
  // Same provider id, but pointed somewhere else (base URL or kind changed between the runs).
  const pa = a.snapshot.providers ?? {}
  const pb = b.snapshot.providers ?? {}
  for (const id of Object.keys(pa)) {
    const x = pa[id]
    const y = pb[id]
    if (!y) continue
    if (x.baseUrl !== y.baseUrl) out.push(`Provider "${id}" endpoint: ${x.baseUrl ?? 'official API'} vs ${y.baseUrl ?? 'official API'}`)
    else if (x.kind !== y.kind) out.push(`Provider "${id}" type: ${x.kind} vs ${y.kind}`)
  }
  return out
}

export function Compare({ a, b }: { a?: string; b?: string }) {
  const s = useStoreShallow((st) => ({
    experiments: st.experiments,
    projectId: st.projectId,
    runs: st.runs,
    prompts: st.prompts,
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

  const options = exps.filter((e) => runsOf(e.id).length > 0)
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
        options={options.map((e) => {
          const p = s.prompts.find((x) => x.id === e.promptId)
          return { value: e.id, label: e.name, hint: p?.name }
        })}
      />
      {cur && runsOf(cur.eid).length > 1 && (
        <Select
          aria-label="Run"
          size="sm"
          value={cur.run?.id ?? ''}
          onChange={(v) => set(side, `${cur.eid}:${v}`)}
          options={runsOf(cur.eid).map((r, i, all) => ({ value: r.id, label: `Run ${all.length - i}`, hint: timeAgo(r.startedAt) }))}
        />
      )}
    </div>
  )

  const ra = A?.run
  const rb = B?.run
  const diffs = ra && rb ? differences(ra, rb) : []
  const keys = ra && rb ? [...new Set([...ra.results.map((r) => r.inputKey), ...rb.results.map((r) => r.inputKey)])] : []

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
          title={options.length < 2 ? 'Need two experiments with runs' : 'Pick two experiments'}
          body={options.length < 2 ? 'Run at least two experiments, then come back to compare their outputs.' : 'Their latest runs are shown by default. You can choose an older run under each.'}
          action={options.length < 2 ? <Button onClick={() => go('experiments')}>Go to experiments</Button> : undefined}
        />
      ) : (
        <>
          {diffs.length > 0 ? (
            <div className="mb-6 flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-[13px] font-medium text-warn">
                <Warning size={15} /> Not a like-for-like comparison:
              </span>
              {diffs.map((d) => (
                <Tag key={d} tone="warn">
                  {d}
                </Tag>
              ))}
            </div>
          ) : (
            <p className="mb-6 text-[13px] text-fg-2">Same inputs, judge, judge mode and models. Only the prompt differs.</p>
          )}

          <div className="mb-6 grid gap-3 md:grid-cols-2">
            {[ra, rb].map((r, i) => (
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
            {keys.map((k) => {
              const input = ra.snapshot.inputs.find((i) => i.id === k) ?? rb.snapshot.inputs.find((i) => i.id === k)!
              return (
                <li key={k} className="rounded-[10px] border border-line bg-surface">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line px-4 py-3">
                    <span className="text-sm font-medium">{input.name}</span>
                    <LabelTag label={input.label} />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-fg-3">{input.content}</span>
                  </div>
                  <div className="grid md:grid-cols-2 md:divide-x md:divide-line">
                    {[ra, rb].map((r, i) => {
                      const res = r.results.find((x) => x.inputKey === k)
                      return (
                        <div key={i} className="flex flex-col gap-3 p-4">
                          {res ? (
                            <>
                              <pre className="font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap">{res.output ?? 'No output'}</pre>
                              {res.judge && (
                                <div className="border-t border-line pt-3">
                                  <JudgeResult values={res.judge} />
                                </div>
                              )}
                            </>
                          ) : (
                            <p className="text-[13px] text-fg-3">Not in this run.</p>
                          )}
                        </div>
                      )
                    })}
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
