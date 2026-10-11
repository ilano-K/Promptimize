import { Flask, Plus } from '@phosphor-icons/react'
import { useState } from 'react'
import { InputEditor, JudgeEditor, PromptEditor } from '../components/editors'
import { Button, Empty, Field, inputCls, LabelTag, Modal, PageHeader, Score, Tag, timeAgo } from '../components/ui'
import { Select } from '../components/Select'
import { go } from '../router'
import { averages, latestRun, uid, useStore } from '../store'
import type { Experiment, Label } from '../types'
import { RunStatusTag } from './Experiment'

export function Experiments() {
  const s = useStore()
  const [creating, setCreating] = useState(false)
  const list = s.experiments.filter((e) => e.projectId === s.projectId).sort((a, b) => b.createdAt - a.createdAt)

  return (
    <>
      <PageHeader
        title="Experiments"
        sub="One prompt, a set of inputs and a judge, all picked from the library."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus size={15} /> New experiment
          </Button>
        }
      />

      {list.length === 0 ? (
        <Empty
          icon={<Flask size={28} />}
          title="No experiments yet"
          body="Pick a prompt, some inputs and a judge. You can create any of them right in the setup form."
          action={
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus size={15} /> New experiment
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((e, i) => {
            const prompt = s.prompts.find((p) => p.id === e.promptId)
            const judge = s.judges.find((j) => j.id === e.judgeId)
            const run = latestRun(s.runs, e.id)
            const avg = run ? averages(run) : {}
            const loops = s.loops.filter((l) => l.experimentId === e.id).length
            return (
              <li key={e.id} className="rise" style={{ animationDelay: `${i * 30}ms` }}>
                <a
                  href={`#/experiments/${e.id}`}
                  className="grid gap-3 rounded-[10px] border border-line bg-surface px-5 py-4 transition-colors hover:border-line-strong md:grid-cols-[1.3fr_1fr_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{e.name}</p>
                    <p className="mt-1 truncate font-mono text-xs text-fg-3">
                      {prompt?.name ?? 'missing prompt'} on {prompt?.model}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-fg-2">
                    {judge ? <span>{judge.name}</span> : <Tag>Prompt-only</Tag>}
                    <span className="text-fg-3">with {e.inputIds.length} inputs</span>
                    {loops > 0 && <Tag tone="accent">{loops} optimize loop{loops > 1 ? 's' : ''}</Tag>}
                  </div>
                  <div className="flex items-center gap-4 md:justify-end">
                    {Object.entries(avg)
                      .slice(0, 2)
                      .map(([k, v]) => (
                        <span key={k} className="flex flex-col">
                          <span className="font-mono text-[11px] text-fg-3">{k}</span>
                          <Score value={v} />
                        </span>
                      ))}
                    {run ? (
                      <span className="flex flex-col items-end gap-1">
                        <RunStatusTag status={run.status} />
                        <span className="text-xs text-fg-3">{timeAgo(run.startedAt)}</span>
                      </span>
                    ) : (
                      <Tag>Not run</Tag>
                    )}
                  </div>
                </a>
              </li>
            )
          })}
        </ul>
      )}

      {creating && <ExperimentForm onClose={() => setCreating(false)} />}
    </>
  )
}

/** Create or edit an experiment. Library objects can be created inline. */
export function ExperimentForm({ initial, onClose }: { initial?: Experiment; onClose: () => void }) {
  const s = useStore()
  const prompts = s.prompts.filter((x) => x.projectId === s.projectId)
  const judges = s.judges.filter((x) => x.projectId === s.projectId)
  const inputs = s.inputs.filter((x) => x.projectId === s.projectId)
  const [v, setV] = useState<Experiment>(
    initial ?? {
      id: uid(),
      projectId: s.projectId,
      name: '',
      promptId: prompts[0]?.id ?? '',
      judgeId: judges[0]?.id ?? null,
      inputIds: inputs.map((i) => i.id),
      createdAt: Date.now(),
    },
  )
  const [inline, setInline] = useState<'prompt' | 'judge' | 'input' | null>(null)
  const ok = v.name.trim() && v.promptId && v.inputIds.length > 0
  const toggle = (id: string) => setV({ ...v, inputIds: v.inputIds.includes(id) ? v.inputIds.filter((x) => x !== id) : [...v.inputIds, id] })
  const selectLabel = (l: Label) => {
    const ids = inputs.filter((i) => i.label === l).map((i) => i.id)
    const all = ids.every((id) => v.inputIds.includes(id))
    setV({ ...v, inputIds: all ? v.inputIds.filter((id) => !ids.includes(id)) : [...new Set([...v.inputIds, ...ids])] })
  }

  return (
    <>
      <Modal
        wide
        title={initial ? 'Edit experiment' : 'New experiment'}
        onClose={onClose}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!ok}
              onClick={() => {
                s.saveExperiment(v)
                onClose()
                if (!initial) go(`experiments/${v.id}`)
              }}
            >
              {initial ? 'Save' : 'Create experiment'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-6">
          <Field label="Name">{(id) => <input id={id} className={inputCls} placeholder="e.g. Summarize, shorter outputs" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />}</Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Prompt">
              {(id) => (
                <div className="flex gap-1.5">
                  <Select
                    id={id}
                    className="flex-1"
                    mono
                    value={v.promptId}
                    onChange={(promptId) => setV({ ...v, promptId })}
                    placeholder="No prompts yet"
                    options={prompts.map((p) => ({ value: p.id, label: p.name, hint: p.model.split('/').slice(1).join('/') }))}
                  />
                  <Button onClick={() => setInline('prompt')} aria-label="Create prompt">
                    <Plus size={15} />
                  </Button>
                </div>
              )}
            </Field>
            <Field label="Judge" help={v.judgeId ? undefined : 'Prompt-only: see outputs without scores. Optimize needs a judge.'}>
              {(id) => (
                <div className="flex gap-1.5">
                  <Select
                    id={id}
                    className="flex-1"
                    value={v.judgeId ?? ''}
                    onChange={(judgeId) => setV({ ...v, judgeId: judgeId || null })}
                    options={[
                      { value: '', label: 'No judge (prompt-only)' },
                      ...judges.map((j) => ({ value: j.id, label: j.name, hint: `${j.characteristics.length} checks, ${j.mode}` })),
                    ]}
                  />
                  <Button onClick={() => setInline('judge')} aria-label="Create judge">
                    <Plus size={15} />
                  </Button>
                </div>
              )}
            </Field>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-medium">
                Inputs <span className="font-mono text-xs font-normal text-fg-3">{v.inputIds.length} selected</span>
              </span>
              <div className="flex flex-wrap gap-1">
                {(['train', 'validation', 'test'] as Label[]).map((l) => (
                  <Button key={l} size="sm" variant="ghost" onClick={() => selectLabel(l)}>
                    Toggle {l}
                  </Button>
                ))}
                <Button size="sm" onClick={() => setInline('input')}>
                  <Plus size={14} /> New input
                </Button>
              </div>
            </div>
            {inputs.length === 0 ? (
              <p className="rounded-md border border-dashed border-line-strong px-4 py-6 text-center text-sm text-fg-2">No inputs in this project yet. Add one above.</p>
            ) : (
              <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-md border border-line">
                {inputs.map((i) => (
                  <li key={i.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface-2">
                      <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={v.inputIds.includes(i.id)} onChange={() => toggle(i.id)} />
                      <span className="w-40 shrink-0 truncate text-sm font-medium">{i.name}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-fg-3">{i.content}</span>
                      <LabelTag label={i.label} />
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {v.inputIds.length === 0 && <p className="mt-1.5 text-xs text-danger">Select at least one input.</p>}
          </div>
        </div>
      </Modal>

      {inline === 'prompt' && <PromptEditor onClose={() => setInline(null)} onSaved={(id) => setV((x) => ({ ...x, promptId: id }))} />}
      {inline === 'judge' && <JudgeEditor onClose={() => setInline(null)} onSaved={(id) => setV((x) => ({ ...x, judgeId: id }))} />}
      {inline === 'input' && <InputEditor onClose={() => setInline(null)} onSaved={(id) => setV((x) => ({ ...x, inputIds: [...x.inputIds, id] }))} />}
    </>
  )
}
