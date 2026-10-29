import { Plus, Trash, Warning } from '@phosphor-icons/react'
import { useState } from 'react'
import { uid, useDefaultModel, usedBy, useStore } from '../store'
import type { Characteristic, Input, Judge, Label, Prompt } from '../types'
import { Button, Field, inputCls, ModelSelect, Modal, monoAreaCls, textareaCls } from './ui'
import { errorMessage, labelHelp } from './ui.helpers'

type Kind = 'input' | 'prompt' | 'judge'

/** "Used by" notice shown when editing an object that experiments reference. */
function UsedBy({ kind, id }: { kind: Kind; id?: string }) {
  const experiments = useStore((s) => s.experiments)
  if (!id) return null
  const list = usedBy(experiments, kind, id)
  if (!list.length) return <p className="text-xs text-fg-3">Not used by any experiment yet.</p>
  return (
    <div className="flex gap-2.5 rounded-md bg-warn-soft px-3 py-2.5 text-[13px] text-warn">
      <Warning size={16} className="mt-0.5 shrink-0" />
      <div>
        <p className="font-medium">
          Used by {list.length} experiment{list.length > 1 ? 's' : ''}. Changes apply from their next run.
        </p>
        <p className="mt-0.5 opacity-90">{list.map((e) => e.name).join(', ')}</p>
        <p className="mt-0.5 opacity-75">Past runs keep their snapshot and won't change.</p>
      </div>
    </div>
  )
}

function Footer({
  onClose,
  onSave,
  onDelete,
  disabled,
  busy,
}: {
  onClose: () => void
  onSave: () => void
  onDelete?: () => void
  disabled?: boolean
  busy?: boolean
}) {
  return (
    <>
      {onDelete && (
        <Button variant="danger" className="mr-auto" onClick={onDelete} disabled={busy}>
          <Trash size={15} /> Delete
        </Button>
      )}
      <Button variant="ghost" onClick={onClose}>
        Cancel
      </Button>
      <Button variant="primary" onClick={onSave} disabled={disabled || busy}>
        {busy ? 'Saving…' : 'Save to library'}
      </Button>
    </>
  )
}

function useDelete(kind: Kind, id: string | undefined, onClose: () => void, onError: (message: string) => void) {
  const experiments = useStore((s) => s.experiments)
  const del = useStore((s) => s.deleteObject)
  if (!id) return undefined
  const used = usedBy(experiments, kind, id)
  return () => {
    const consequence =
      kind === 'input'
        ? 'It will be removed from the input lists of those experiments.'
        : "Those experiments will show it as missing and can't run until you pick another."
    const warning = used.length ? ` This ${kind} is used by ${used.map((e) => e.name).join(', ')}. ${consequence}` : ''
    if (!confirm(`Delete this ${kind}?${warning} Past runs keep their own copy.`)) return
    void (async () => {
      try {
        await del(kind, id)
        onClose()
      } catch (e) {
        onError(errorMessage(e))
      }
    })()
  }
}

export function InputEditor({ initial, onClose, onSaved }: { initial?: Input; onClose: () => void; onSaved?: (id: string) => void }) {
  const projectId = useStore((s) => s.projectId)
  const save = useStore((s) => s.saveInput)
  const [v, setV] = useState<Input>(() => initial ?? { id: '', projectId, name: '', content: '', label: 'train' })
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const onDelete = useDelete('input', initial?.id, onClose, setSaveError)
  const ok = v.name.trim() && v.content.trim()
  const saveAndClose = async () => {
    setBusy(true)
    setSaveError(null)
    try {
      const saved = await save(v)
      onSaved?.(saved.id)
      onClose()
    } catch (e) {
      setSaveError(errorMessage(e))
      setBusy(false)
    }
  }
  return (
    <Modal
      title={initial ? 'Edit input' : 'New input'}
      onClose={onClose}
      footer={<Footer onClose={onClose} onDelete={onDelete} disabled={!ok} busy={busy} onSave={() => void saveAndClose()} />}
    >
      <div className="flex flex-col gap-5">
        <UsedBy kind="input" id={initial?.id} />
        <Field label="Name">{(id) => <input id={id} className={inputCls} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />}</Field>
        <Field label="Content" help="What your app would receive. It replaces {{input}} in the prompt.">
          {(id) => <textarea id={id} rows={5} className={textareaCls} value={v.content} onChange={(e) => setV({ ...v, content: e.target.value })} />}
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-[13px] font-medium">Split label</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {(['train', 'validation', 'test'] as Label[]).map((l) => (
              <label
                key={l}
                className={`cursor-pointer rounded-md border px-3 py-2.5 transition-colors ${
                  v.label === l ? 'border-accent bg-accent-soft' : 'border-line-strong hover:bg-surface-2'
                }`}
              >
                <input type="radio" name="label" className="sr-only" checked={v.label === l} onChange={() => setV({ ...v, label: l })} />
                <span className="font-mono text-[13px] font-medium">{l}</span>
                <span className="mt-1 block text-xs leading-snug text-fg-2">{labelHelp[l]}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-fg-3">The label applies in every experiment that uses this input.</p>
        </fieldset>
        {saveError && (
          <p role="alert" className="text-sm text-danger">
            {saveError}
          </p>
        )}
      </div>
    </Modal>
  )
}

export function PromptEditor({ initial, onClose, onSaved }: { initial?: Prompt; onClose: () => void; onSaved?: (id: string) => void }) {
  const projectId = useStore((s) => s.projectId)
  const save = useStore((s) => s.savePrompt)
  const defaultModel = useDefaultModel()
  const [v, setV] = useState<Prompt>(
    () => initial ?? { id: '', projectId, name: '', text: 'Ticket:\n{{input}}', model: defaultModel, outputSchema: '' },
  )
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const onDelete = useDelete('prompt', initial?.id, onClose, setSaveError)
  let schemaError: string | undefined
  if (v.outputSchema.trim()) {
    try {
      JSON.parse(v.outputSchema)
    } catch {
      schemaError = 'Not valid JSON yet.'
    }
  }
  const ok = v.name.trim() && v.text.trim() && v.model && !schemaError
  const saveAndClose = async () => {
    setBusy(true)
    setSaveError(null)
    try {
      const saved = await save(v)
      onSaved?.(saved.id)
      onClose()
    } catch (e) {
      setSaveError(errorMessage(e))
      setBusy(false)
    }
  }
  return (
    <Modal
      wide
      title={initial ? 'Edit prompt' : 'New prompt'}
      onClose={onClose}
      footer={<Footer onClose={onClose} onDelete={onDelete} disabled={!ok} busy={busy} onSave={() => void saveAndClose()} />}
    >
      <div className="flex flex-col gap-5">
        <UsedBy kind="prompt" id={initial?.id} />
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
          <Field label="Name">{(id) => <input id={id} className={inputCls} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />}</Field>
          <Field label="Model" help="To test another model, make a separate prompt.">
            {(id) => <ModelSelect id={id} value={v.model} onChange={(model) => setV({ ...v, model })} />}
          </Field>
        </div>
        <Field label="Prompt text" help="Use {{input}} where the input should go.">
          {(id) => <textarea id={id} rows={8} className={monoAreaCls} value={v.text} onChange={(e) => setV({ ...v, text: e.target.value })} />}
        </Field>
        <Field label="Output schema (optional)" help="JSON shape the output must follow. Leave empty for free-form output like markdown." error={schemaError}>
          {(id) => (
            <textarea
              id={id}
              rows={4}
              className={monoAreaCls}
              placeholder='{ "summary": "string" }'
              value={v.outputSchema}
              onChange={(e) => setV({ ...v, outputSchema: e.target.value })}
            />
          )}
        </Field>
        {saveError && (
          <p role="alert" className="text-sm text-danger">
            {saveError}
          </p>
        )}
      </div>
    </Modal>
  )
}

export function JudgeEditor({ initial, onClose, onSaved }: { initial?: Judge; onClose: () => void; onSaved?: (id: string) => void }) {
  const projectId = useStore((s) => s.projectId)
  const save = useStore((s) => s.saveJudge)
  const defaultModel = useDefaultModel()
  const [v, setV] = useState<Judge>(
    () =>
      initial ?? {
        id: '',
        projectId,
        name: '',
        basePrompt: '',
        characteristics: [{ id: uid(), name: 'clarity', type: 'number' }],
        mode: 'individual',
        model: defaultModel,
      },
  )
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const onDelete = useDelete('judge', initial?.id, onClose, setSaveError)
  const setChar = (i: number, c: Characteristic) => setV({ ...v, characteristics: v.characteristics.map((x, j) => (j === i ? c : x)) })
  const names = v.characteristics.map((c) => c.name.trim())
  const dupes = names.some((n, i) => n && names.indexOf(n) !== i)
  const ok = v.name.trim() && v.basePrompt.trim() && v.model && v.characteristics.length && names.every(Boolean) && !dupes

  const shape = Object.fromEntries(v.characteristics.filter((c) => c.name.trim()).map((c) => [c.name.trim(), c.type === 'number' ? 'number 0-1' : 'string']))
  const preview = v.mode === 'batch' ? [shape, '...one per output'] : shape
  const saveAndClose = async () => {
    setBusy(true)
    setSaveError(null)
    try {
      const saved = await save(v)
      onSaved?.(saved.id)
      onClose()
    } catch (e) {
      setSaveError(errorMessage(e))
      setBusy(false)
    }
  }

  return (
    <Modal
      wide
      title={initial ? 'Edit judge' : 'New judge'}
      onClose={onClose}
      footer={<Footer onClose={onClose} onDelete={onDelete} disabled={!ok} busy={busy} onSave={() => void saveAndClose()} />}
    >
      <div className="flex flex-col gap-5">
        <UsedBy kind="judge" id={initial?.id} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">{(id) => <input id={id} className={inputCls} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />}</Field>
          <Field label="Model">{(id) => <ModelSelect id={id} value={v.model} onChange={(model) => setV({ ...v, model })} />}</Field>
        </div>
        <Field label="Base prompt" help="Your instructions to the judge, including what scores mean (for example, what 0.4 vs 0.8 clarity looks like).">
          {(id) => <textarea id={id} rows={6} className={monoAreaCls} value={v.basePrompt} onChange={(e) => setV({ ...v, basePrompt: e.target.value })} />}
        </Field>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium">Characteristics</span>
          {v.characteristics.map((c, i) => (
            <div key={c.id ?? `row-${i}`} className="flex gap-2">
              <input
                aria-label="Characteristic name"
                className={`${inputCls} font-mono`}
                value={c.name}
                placeholder="e.g. accuracy"
                onChange={(e) => setChar(i, { ...c, name: e.target.value.replace(/\s/g, '_') })}
              />
              <div className="flex shrink-0 rounded-md border border-line-strong p-0.5" role="radiogroup" aria-label="Type">
                {(['number', 'text'] as const).map((t) => (
                  <button
                    key={t}
                    role="radio"
                    aria-checked={c.type === t}
                    onClick={() => setChar(i, { ...c, type: t })}
                    className={`rounded px-2.5 text-[13px] transition-colors ${c.type === t ? 'bg-surface-2 font-medium text-fg' : 'text-fg-3 hover:text-fg'}`}
                  >
                    {t === 'number' ? 'Number 0-1' : 'Text'}
                  </button>
                ))}
              </div>
              <Button
                variant="ghost"
                aria-label="Remove characteristic"
                disabled={v.characteristics.length === 1}
                onClick={() => setV({ ...v, characteristics: v.characteristics.filter((_, j) => j !== i) })}
              >
                <Trash size={15} />
              </Button>
            </div>
          ))}
          {dupes && <p className="text-xs text-danger">Two characteristics have the same name.</p>}
          <div>
            <Button size="sm" variant="ghost" onClick={() => setV({ ...v, characteristics: [...v.characteristics, { id: uid(), name: '', type: 'number' }] })}>
              <Plus size={14} /> Add characteristic
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset>
            <legend className="mb-2 text-[13px] font-medium">Judge mode</legend>
            <div className="flex flex-col gap-2">
              {(
                [
                  ['individual', 'Individual', 'One judge call per output.'],
                  ['batch', 'Batch', 'One call for all outputs. Cheaper; can return the wrong number of entries.'],
                ] as const
              ).map(([m, title, body]) => (
                <label key={m} className={`cursor-pointer rounded-md border px-3 py-2 ${v.mode === m ? 'border-accent bg-accent-soft' : 'border-line-strong hover:bg-surface-2'}`}>
                  <input type="radio" className="sr-only" checked={v.mode === m} onChange={() => setV({ ...v, mode: m })} />
                  <span className="text-[13px] font-medium">{title}</span>
                  <span className="block text-xs text-fg-2">{body}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <p className="mb-2 text-[13px] font-medium">Output structure</p>
            <pre className="overflow-x-auto rounded-md bg-surface-2 p-3 font-mono text-xs leading-relaxed text-fg-2">{JSON.stringify(preview, null, 2)}</pre>
            <p className="mt-1.5 text-xs text-fg-3">Built from your characteristics. You don't write a schema.</p>
          </div>
        </div>
        {saveError && (
          <p role="alert" className="text-sm text-danger">
            {saveError}
          </p>
        )}
      </div>
    </Modal>
  )
}
