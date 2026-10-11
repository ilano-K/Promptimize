import { ArrowLeft, FloppyDisk, Flask, Info, Sparkle, Stop, TestTube, WarningCircle } from '@phosphor-icons/react'
import { diffLines } from 'diff'
import { useState } from 'react'
import { Button, Empty, Field, inputCls, LabelTag, Modal, PageHeader, Panel, Score, Tag, Tip } from '../components/ui'
import { go } from '../router'
import { averagesFor, useStore } from '../store'
import type { OptimizeLoop, Run } from '../types'
import { RunView } from './Experiment'

export function Loop({ experimentId, loopId, roundParam }: { experimentId: string; loopId: string; roundParam?: string }) {
  const s = useStore()
  const loop = s.loops.find((l) => l.id === loopId)
  const e = s.experiments.find((x) => x.id === experimentId)
  const [tab, setTab] = useState<'diff' | 'results' | 'test'>('diff')
  const [saving, setSaving] = useState<'prompt' | 'experiment' | null>(null)

  if (!loop || !e) return <Empty icon={<WarningCircle size={28} />} title="Optimize loop not found" body="It may have been deleted with its experiment." />

  const runOf = (id?: string) => s.runs.find((r) => r.id === id)
  const numberChars = loop.rounds[0] ? (runOf(loop.rounds[0].runId)?.snapshot.judge?.characteristics.filter((c) => c.type === 'number').map((c) => c.name) ?? []) : []
  const selected = loop.rounds.find((r) => String(r.index) === roundParam) ?? loop.rounds[loop.rounds.length - 1]
  const prev = selected && loop.rounds.find((r) => r.index === selected.index - 1)
  const selRun = runOf(selected?.runId)
  const testRun = runOf(selected?.testRunId)
  const pick = (i: number) => go(`experiments/${e.id}/loops/${loop.id}?round=${i}`)

  return (
    <>
      <a href={`#/experiments/${e.id}`} className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-fg-2 hover:text-fg">
        <ArrowLeft size={14} /> {e.name}
      </a>
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            <Sparkle size={22} className="text-accent" />
            {loop.mode === '1-pass' ? '1-pass rewrite' : `Optimize, up to ${loop.maxRounds} rounds`}
          </span>
        }
        sub={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-xs">optimizer {loop.optimizerModel}</span>
            {loop.mode === 'n-pass' && <span className="text-xs">{loop.earlyStop ? 'May stop early' : 'Always uses all rounds'}</span>}
            {loop.instructions && <span className="text-xs">Instructions: "{loop.instructions}"</span>}
          </span>
        }
        actions={
          loop.status === 'running' ? (
            <Button onClick={() => s.stopLoop(loop.id)}>
              <Stop size={14} weight="fill" /> Stop after this step
            </Button>
          ) : undefined
        }
      />

      <Panel className="mb-6 px-5 py-4">
        {loop.status === 'running' ? (
          <p className="flex items-center gap-2 text-sm text-fg-2">
            <span className="size-2 animate-pulse rounded-full bg-accent motion-reduce:animate-none" aria-hidden />
            Running round {Math.max(0, loop.rounds.length - 1)}
            {loop.mode === 'n-pass' && ` of up to ${loop.maxRounds}`}. Each round is saved as soon as it finishes.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {loop.status === 'stopped' ? <Tag tone="warn">Stopped</Tag> : <Tag>Done</Tag>}
              <span className="text-sm text-fg-2">{loop.stopReason}</span>
            </div>
            {loop.summary && <p className="mt-3 max-w-[85ch] text-sm leading-relaxed">{loop.summary}</p>}
          </>
        )}
        <p className="mt-3 flex items-start gap-2 text-xs text-fg-3">
          <Info size={14} className="mt-px shrink-0" />
          There's no automatic "best" round. Text feedback can't be averaged, so you browse the rounds and decide.
        </p>
      </Panel>

      {/* Round overview. Train vs validation side by side makes overfitting visible. */}
      <Panel className="mb-6 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-fg-3">
              <th className="px-5 py-2.5 font-normal">Round</th>
              {numberChars.map((c) => (
                <th key={c} className="px-3 py-2.5 font-normal" colSpan={2}>
                  <span className="font-mono">{c}</span>
                  <span className="mt-1 flex gap-6">
                    <LabelTag label="train" />
                    <LabelTag label="validation" />
                  </span>
                </th>
              ))}
              <th className="px-3 py-2.5 font-normal">
                <LabelTag label="test" />
              </th>
            </tr>
          </thead>
          <tbody>
            {loop.rounds.map((r) => {
              const run = runOf(r.runId)
              const p = loop.rounds.find((x) => x.index === r.index - 1)
              const pRun = runOf(p?.runId)
              const isSel = r.index === selected?.index
              const t = runOf(r.testRunId)
              return (
                <tr
                  key={r.index}
                  onClick={() => pick(r.index)}
                  className={`cursor-pointer border-b border-line last:border-0 transition-colors ${isSel ? 'bg-surface-2 shadow-[inset_2px_0_0_var(--accent)]' : 'hover:bg-surface-2'}`}
                >
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-2 font-medium">
                      {r.index === 0 ? 'Original' : `Round ${r.index}`}
                      {run?.status === 'running' && <Tag tone="accent">Running</Tag>}
                    </span>
                  </td>
                  {numberChars.map((c) => (
                    <ScoreCells key={c} run={run} prev={pRun} c={c} />
                  ))}
                  <td className="px-3 py-3">
                    {t ? t.status === 'running' ? <Tag tone="accent">Running</Tag> : <ScoreCell run={t} label="test" c={numberChars[0]} /> : <span className="text-xs text-fg-3">not run</span>}
                  </td>
                </tr>
              )
            })}
            {loop.status === 'running' && (
              <tr>
                <td colSpan={numberChars.length * 2 + 2} className="px-5 py-3">
                  <div className="skeleton h-3 w-40 rounded" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>

      {selected && (
        <section className="rise" key={selected.index}>
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 className="text-lg font-semibold">{selected.index === 0 ? 'Original prompt' : `Round ${selected.index}`}</h2>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setSaving('prompt')} disabled={selected.index === 0}>
                <FloppyDisk size={15} /> Save as prompt
              </Button>
              <Button variant="primary" onClick={() => setSaving('experiment')} disabled={selected.index === 0}>
                <Flask size={15} /> Create experiment with this prompt
              </Button>
            </div>
          </div>

          {selected.note && (
            <div className="mb-5 rounded-md border-l-2 border-accent bg-surface-2 px-4 py-3 text-sm">
              <span className="text-xs text-fg-3">What went wrong in this round</span>
              <p className="mt-0.5 leading-relaxed">{selected.note}</p>
            </div>
          )}

          <div role="tablist" className="mb-4 flex gap-1 border-b border-line">
            {(
              [
                ['diff', selected.index === 0 ? 'Prompt' : 'Prompt diff'],
                ['results', 'Train + validation results'],
                ['test', 'Test'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`-mb-px h-9 border-b-2 px-3 text-sm whitespace-nowrap transition-colors ${tab === k ? 'border-accent font-medium' : 'border-transparent text-fg-2 hover:text-fg'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'diff' && <PromptDiff before={prev?.promptText} after={selected.promptText} beforeLabel={prev ? (prev.index === 0 ? 'Original' : `Round ${prev.index}`) : undefined} />}
          {tab === 'results' && (selRun ? <RunView run={selRun} compact /> : null)}
          {tab === 'test' && (
            <TestTab loop={loop} round={selected.index} testRun={testRun} />
          )}
        </section>
      )}

      {saving && selected && <SaveRound loop={loop} round={selected.index} kind={saving} onClose={() => setSaving(null)} />}
    </>
  )
}

function ScoreCells({ run, prev, c }: { run?: Run; prev?: Run; c: string }) {
  return (
    <>
      <td className="px-3 py-3">
        <ScoreCell run={run} prev={prev} label="train" c={c} />
      </td>
      <td className="px-3 py-3">
        <ScoreCell run={run} prev={prev} label="validation" c={c} />
      </td>
    </>
  )
}

function ScoreCell({ run, prev, label, c }: { run?: Run; prev?: Run; label: 'train' | 'validation' | 'test'; c?: string }) {
  if (!run || !c) return <span className="text-xs text-fg-3">-</span>
  const v = averagesFor(run, label)[c]
  if (v === undefined) return run.status === 'running' ? <div className="skeleton h-3 w-14 rounded" /> : <span className="text-xs text-fg-3">-</span>
  const p = prev && run.status !== 'running' ? averagesFor(prev, label)[c] : undefined
  return <Score value={v} prev={p} />
}

function PromptDiff({ before, after, beforeLabel }: { before?: string; after: string; beforeLabel?: string }) {
  if (before === undefined) {
    return (
      <Panel className="p-5">
        <pre className="font-mono text-[13px] leading-relaxed whitespace-pre-wrap">{after}</pre>
      </Panel>
    )
  }
  const parts = diffLines(before.trimEnd() + '\n', after.trimEnd() + '\n')
  const added = parts.filter((p) => p.added).reduce((n, p) => n + (p.count ?? 0), 0)
  const removed = parts.filter((p) => p.removed).reduce((n, p) => n + (p.count ?? 0), 0)
  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-line px-5 py-2.5 text-xs text-fg-3">
        Compared with {beforeLabel}
        <span className="font-mono text-accent-text">+{added}</span>
        <span className="font-mono text-danger">-{removed}</span>
      </div>
      <div className="py-2 font-mono text-[13px] leading-relaxed">
        {parts.flatMap((p, i) =>
          p.value
            .replace(/\n$/, '')
            .split('\n')
            .map((line, j) => (
              <div key={`${i}-${j}`} className={`flex px-5 ${p.added ? 'bg-diff-add' : p.removed ? 'bg-diff-del' : ''}`}>
                <span className={`w-5 shrink-0 select-none ${p.added ? 'text-accent-text' : p.removed ? 'text-danger' : 'text-fg-3'}`}>{p.added ? '+' : p.removed ? '-' : ' '}</span>
                <span className="whitespace-pre-wrap">{line || ' '}</span>
              </div>
            )),
        )}
      </div>
    </Panel>
  )
}

function TestTab({ loop, round, testRun }: { loop: OptimizeLoop; round: number; testRun?: Run }) {
  const s = useStore()
  const e = s.experiments.find((x) => x.id === loop.experimentId)!
  const tests = s.inputs.filter((i) => e.inputIds.includes(i.id) && i.label === 'test')
  if (testRun) return <RunView run={testRun} compact />
  const tested = loop.rounds.filter((r) => r.testRunId).map((r) => (r.index === 0 ? 'Original' : `round ${r.index}`))
  return (
    <Empty
      icon={<TestTube size={28} />}
      title={tests.length ? `Run ${tests.length} test inputs on this round` : 'No test inputs in this experiment'}
      body={
        tests.length
          ? 'The optimizer never saw these. Use them as a last check on the round you picked, not to choose between rounds.'
          : 'Label some inputs as test in the library to get a final check on unseen inputs.'
      }
      action={
        tests.length ? (
          <div className="flex flex-col items-center gap-2">
            <Tip text="Testing every round and picking the best test score would turn test into a second validation set.">
              <Button variant="primary" disabled={loop.status === 'running'} onClick={() => s.runTest(loop.id, round)}>
                <TestTube size={15} /> Run test set
              </Button>
            </Tip>
            {tested.length > 0 && <p className="text-xs text-warn">Already tested: {tested.join(', ')}.</p>}
          </div>
        ) : undefined
      }
    />
  )
}

function SaveRound({ loop, round, kind, onClose }: { loop: OptimizeLoop; round: number; kind: 'prompt' | 'experiment'; onClose: () => void }) {
  const s = useStore()
  const e = s.experiments.find((x) => x.id === loop.experimentId)!
  const base = s.prompts.find((p) => p.id === e.promptId)
  const [name, setName] = useState(kind === 'prompt' ? `${base?.name ?? 'prompt'} v${round + 1}` : `${e.name}, round ${round}`)
  const [saved, setSaved] = useState(false)
  return (
    <Modal
      title={kind === 'prompt' ? 'Save round as prompt' : 'Create experiment with this prompt'}
      onClose={onClose}
      footer={
        saved ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button variant="primary" onClick={() => go('library/prompts')}>
              Open library
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!name.trim()}
              onClick={() => {
                if (kind === 'prompt') {
                  s.saveRoundPrompt(loop.id, round, name.trim())
                  setSaved(true)
                } else {
                  const id = s.experimentFromRound(loop.id, round, name.trim())
                  onClose()
                  go(`experiments/${id}`)
                }
              }}
            >
              {kind === 'prompt' ? 'Save prompt' : 'Create experiment'}
            </Button>
          </>
        )
      }
    >
      {saved ? (
        <p className="text-sm">Saved "{name}" to the library as a new prompt. The original prompt is unchanged.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <Field label={kind === 'prompt' ? 'Prompt name' : 'Experiment name'}>{(id) => <input id={id} className={inputCls} value={name} onChange={(ev) => setName(ev.target.value)} />}</Field>
          <p className="text-[13px] text-fg-2">
            {kind === 'prompt'
              ? `Saves round ${round}'s text as a new prompt (model: ${base?.model}).`
              : `Saves round ${round}'s prompt to the library and makes a new experiment with the same inputs and judge as "${e.name}".`}
          </p>
        </div>
      )}
    </Modal>
  )
}
