import { Flask, Plus } from '@phosphor-icons/react'
import { useState } from 'react'
import { InputEditor, JudgeEditor, PromptEditor } from '../components/editors'
import { Button, Empty, Field, inputCls, LabelTag, Modal, PageHeader, Score, Tag } from '../components/ui'
import { errorMessage, timeAgo } from '../components/ui.helpers'
import { Select } from '../components/Select'
import { go } from '../router'
import { averages, latestRun, useStoreShallow } from '../store'
import type { Experiment, Label } from '../types'
import { RunStatusTag } from './Experiment'

export function Experiments() {
  const s = useStoreShallow((st) => ({
    experiments: st.experiments,
    projectId: st.projectId,
    prompts: st.prompts,
    judges: st.judges,
    runs: st.runs,
  }))
  const [creating, setCreating] = useState(false)
  const list = s.experiments.filter((e) => e.projectId === s.projectId).sort((a, b) => b.createdAt - a.createdAt)

  return (
    <>
      <PageHeader
        title="Experiments"
        sub="One prompt and a set of inputs, with an optional judge to score them."
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
          body="Pick a prompt and some inputs, plus a judge if you want the outputs scored. You can create any of them right in the setup form."
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
            return (
              <li key={e.id} className="rise" style={{ animationDelay: `${i * 30}ms` }}>
                <a
                  href={`#/experiments/${e.id}`}
                  className="grid gap-3 rounded-[10px] border border-line bg-surface px-5 py-4 transition-colors hover:border-line-strong md:grid-cols-[1.3fr_1fr_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{e.name}</p>
                    <p className="mt-1 truncate font-mono text-xs text-fg-3">
                      {prompt ? `${prompt.name} on ${prompt.model}` : 'missing prompt'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-fg-2">
                    {!prompt && <Tag tone="warn">Missing prompt</Tag>}
                    {judge ? <span>{judge.name}</span> : <span className="text-fg-3">no judge</span>}
                    <span className="text-fg-3">with {e.inputIds.length} inputs</span>
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
  const s = useStoreShallow((st) => ({
    prompts: st.prompts,
    judges: st.judges,
    inputs: st.inputs,
    projectId: st.projectId,
    saveExperiment: st.saveExperiment,
  }))
  const prompts = s.prompts.filter((x) => x.projectId === s.projectId)
  const judges = s.judges.filter((x) => x.projectId === s.projectId)
  const inputs = s.inputs.filter((x) => x.projectId === s.projectId)
  const [v, setV] = useState<Experiment>(
    () =>
      initial ?? {
        id: '',
        projectId: s.projectId,
        name: '',
        promptId: prompts[0]?.id ?? null,
        judgeId: judges[0]?.id ?? null,
        inputIds: inputs.map((i) => i.id),
        createdAt: Date.now(),
      },
  )
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [inline, setInline] = useState<'prompt' | 'judge' | 'input' | null>(null)
  const ok = v.name.trim() && v.promptId && v.inputIds.length > 0 && !busy
  const save = async () => {
    setBusy(true)
    setSaveError(null)
    try {
      const saved = await s.saveExperiment(v)
      onClose()
      if (!initial) go(`experiments/${saved.id}`)
    } catch (e) {
      setSaveError(errorMessage(e))
      setBusy(false)
    }
  }
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
              onClick={() => void save()}
            >
              {busy ? 'Saving…' : initial ? 'Save' : 'Create experiment'}
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
                    value={v.promptId ?? ''}
                    onChange={(promptId) => setV({ ...v, promptId: promptId || null })}
                    placeholder="No prompts yet"
                    options={prompts.map((p) => ({ value: p.id, label: p.name, hint: p.model.split('/').slice(1).join('/') }))}
                  />
                  <Button onClick={() => setInline('prompt')} aria-label="Create prompt">
                    <Plus size={15} />
                  </Button>
                </div>
              )}
            </Field>
            <Field label="Judge" help="Optional. Without one the run saves every output but scores none.">
              {(id) => (
                <div className="flex gap-1.5">
                  <Select
                    id={id}
                    className="flex-1"
                    value={v.judgeId ?? ''}
                    onChange={(judgeId) => setV({ ...v, judgeId: judgeId || null })}
                    placeholder="No judges yet"
                    options={[
                      { value: '', label: 'No judge', hint: 'outputs not scored' },
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
          {saveError && (
            <p role="alert" className="text-sm text-danger">
              {saveError}
            </p>
          )}
        </div>
      </Modal>

      {inline === 'prompt' && <PromptEditor onClose={() => setInline(null)} onSaved={(id) => setV((x) => ({ ...x, promptId: id }))} />}
      {inline === 'judge' && <JudgeEditor onClose={() => setInline(null)} onSaved={(id) => setV((x) => ({ ...x, judgeId: id }))} />}
      {inline === 'input' && <InputEditor onClose={() => setInline(null)} onSaved={(id) => setV((x) => ({ ...x, inputIds: [...x.inputIds, id] }))} />}
    </>
  )
}
