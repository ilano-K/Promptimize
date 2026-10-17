import { ArrowsClockwise, CheckCircle, Eye, EyeSlash, Key, PencilSimple, Plug, Plus, Trash, WarningCircle, X } from '@phosphor-icons/react'
import type { CreateProviderBody, UpdateProviderBody } from '@promptimize/shared'
import { useState } from 'react'
import { Button, Empty, Field, inputCls, Modal, ModelSelect, PageHeader, Panel, Tag } from '../components/ui'
import { fetchModels, kindInfo, PROVIDER_KINDS, slug, testConnection } from '../providers'
import { modelUsage, useStoreShallow } from '../store'
import type { Provider, ProviderKind } from '../types'

export function Settings() {
  const { settings, updateSettings, resetDemo } = useStoreShallow((st) => ({
    settings: st.settings,
    updateSettings: st.updateSettings,
    resetDemo: st.resetDemo,
  }))
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Provider | null>(null)
  const [keyFor, setKeyFor] = useState<Provider | null>(null)

  return (
    <>
      <PageHeader title="Settings" sub="Bring your own providers, keys and models. Settings apply to every project." />

      <div className="flex max-w-3xl flex-col gap-10">
        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold">Providers and models</h2>
              <p className="mt-1 text-sm text-fg-2">Models you add here show up in every model picker.</p>
            </div>
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus size={15} /> Add provider
            </Button>
          </div>

          {settings.providers.length === 0 ? (
            <Empty
              icon={<Plug size={28} />}
              title="No providers yet"
              body="Add a provider such as Anthropic or OpenAI, or any OpenAI-compatible endpoint, then pick the models you want to use."
              action={
                <Button variant="primary" onClick={() => setAdding(true)}>
                  <Plus size={15} /> Add provider
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {settings.providers.map((p) => (
                <ProviderCard key={p.id} provider={p} onEdit={() => setEditing(p)} onKey={() => setKeyFor(p)} />
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-fg-3">
            Keys are kept by the local server in <code className="font-mono">~/.promptimize/config.json</code>, outside any repo. The browser never stores them.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-[15px] font-semibold">Optimizer</h2>
          <p className="mb-4 text-sm text-fg-2">Used by default when you click optimize. You can change it per loop.</p>
          <div className="max-w-sm">
            <Field label="Default optimizer model">
              {(id) => <ModelSelect id={id} value={settings.defaultOptimizerModel} onChange={(m) => updateSettings({ defaultOptimizerModel: m })} />}
            </Field>
          </div>
        </section>

        <section className="border-t border-line pt-6">
          <h2 className="mb-1 text-[15px] font-semibold">Prototype data</h2>
          <p className="mb-4 text-sm text-fg-2">This prototype saves to your browser. Reset to bring back the examples.</p>
          <Button variant="danger" onClick={() => confirm('Reset all prototype data to the examples?') && resetDemo()}>
            Reset example data
          </Button>
        </section>
      </div>

      {adding && <ProviderForm onClose={() => setAdding(false)} />}
      {editing && <ProviderForm initial={editing} onClose={() => setEditing(null)} />}
      {keyFor && <KeyForm provider={keyFor} onClose={() => setKeyFor(null)} />}
    </>
  )
}

function useProviders() {
  const s = useStoreShallow((st) => ({
    settings: st.settings,
    prompts: st.prompts,
    judges: st.judges,
    addProvider: st.addProvider,
    updateProvider: st.updateProvider,
    removeProvider: st.removeProvider,
  }))
  return {
    s,
    add: (body: CreateProviderBody) => s.addProvider(body),
    patch: (id: string, change: UpdateProviderBody) => s.updateProvider(id, change),
    remove: (id: string) => s.removeProvider(id),
  }
}

type Status = { state: 'idle' } | { state: 'pending'; text: string } | { state: 'ok' | 'error'; text: string }

/** One line showing the result of the last connection test or model fetch. */
function StatusLine({ status }: { status: Status }) {
  if (status.state === 'idle') return null
  if (status.state === 'pending') {
    return (
      <p className="flex items-center gap-2 text-[13px] text-fg-2" role="status">
        <span className="skeleton h-2 w-10 rounded" aria-hidden /> {status.text}
      </p>
    )
  }
  const ok = status.state === 'ok'
  return (
    <p className={`flex items-center gap-1.5 text-[13px] ${ok ? 'text-accent-text' : 'text-danger'}`} role="status">
      {ok ? <CheckCircle size={15} weight="fill" /> : <WarningCircle size={15} weight="fill" />} {status.text}
    </p>
  )
}

function ProviderCard({ provider: p, onEdit, onKey }: { provider: Provider; onEdit: () => void; onKey: () => void }) {
  const { s, patch, remove } = useProviders()
  const info = kindInfo(p.kind)
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)
  const suggestions = info.suggested.filter((m) => !p.models.includes(m))

  const addModel = (name: string) => {
    const m = name.trim()
    if (!m || p.models.includes(m)) return
    patch(p.id, { models: [...p.models, m] })
    setDraft('')
    setAdding(false)
  }
  const cancelAdd = () => {
    setDraft('')
    setAdding(false)
  }

  const usageText = (modelId: string) => {
    const u = modelUsage(s, modelId)
    const n = u.prompts.length + u.judges.length
    return [n ? `${n} prompt${n === 1 ? '' : 's'}/judge${n === 1 ? '' : 's'}` : '', u.optimizerDefault ? 'default optimizer' : ''].filter(Boolean).join(', ')
  }

  const removeModel = (m: string) => {
    const used = usageText(`${p.id}/${m}`)
    if (used && !confirm(`${m} is used by ${used}. They'll show it as "not configured" until you pick another model. Remove anyway?`)) return
    patch(p.id, { models: p.models.filter((x) => x !== m) })
  }

  const removeProvider = () => {
    const used = p.models.filter((m) => usageText(`${p.id}/${m}`)).length
    const msg = used
      ? `Remove ${p.name}? ${used} of its models are in use; those prompts and judges will show "not configured".`
      : `Remove ${p.name} and its ${p.models.length} models?`
    if (confirm(msg)) void remove(p.id)
  }

  const keyNeeded = info.keyRequired && !p.hasKey
  const [status, setStatus] = useState<Status>({ state: 'idle' })
  const [fetched, setFetched] = useState<string[] | null>(null)
  // A result is only true for the key and URL it was tested with.
  const [testedWith, setTestedWith] = useState(`${p.hasKey}|${p.baseUrl}`)
  if (testedWith !== `${p.hasKey}|${p.baseUrl}`) {
    setTestedWith(`${p.hasKey}|${p.baseUrl}`)
    setStatus({ state: 'idle' })
  }

  const test = async () => {
    setStatus({ state: 'pending', text: 'Testing connection...' })
    const r = await testConnection(p)
    setStatus(r.ok ? { state: 'ok', text: `Connected in ${r.ms} ms` } : { state: 'error', text: r.error })
  }
  const fetchList = async () => {
    setStatus({ state: 'pending', text: 'Fetching models...' })
    const r = await fetchModels(p)
    if (!r.ok) return setStatus({ state: 'error', text: `Couldn't fetch models. ${r.error}` })
    setStatus({ state: 'ok', text: `Found ${r.models.length} models` })
    setFetched(r.models)
  }
  const busy = status.state === 'pending'

  return (
    <Panel>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3 px-5 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{p.name}</span>
            {p.name !== info.label && <Tag>{info.label}</Tag>}
          </div>
          <p className="mt-0.5 truncate font-mono text-xs text-fg-3">
            {p.baseUrl ?? 'official API'} / models as <span className="text-fg-2">{p.id}/...</span>
          </p>
          {status.state !== 'idle' && (
            <div className="mt-2">
              <StatusLine status={status} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" onClick={test} disabled={busy}>
            <Plug size={14} /> Test connection
          </Button>
          <Button size="sm" variant="ghost" aria-label={`Edit ${p.name}`} onClick={onEdit}>
            <PencilSimple size={15} />
          </Button>
          <Button size="sm" variant="ghost" aria-label={`Remove ${p.name}`} onClick={removeProvider}>
            <Trash size={15} />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-y border-line bg-surface-2/50 px-5 py-2.5">
        <Key size={15} className="text-fg-3" />
        {p.hasKey ? (
          <span className="flex items-center gap-1.5 text-[13px] text-accent-text">
            <CheckCircle size={15} weight="fill" /> Key set
          </span>
        ) : keyNeeded ? (
          <span className="text-[13px] text-warn">Needs a key before its models can run</span>
        ) : (
          <span className="text-[13px] text-fg-2">No key (optional for this provider)</span>
        )}
        <span className="ml-auto flex gap-1">
          {p.hasKey && (
            <Button size="sm" variant="ghost" onClick={() => patch(p.id, { apiKey: '' })}>
              Remove key
            </Button>
          )}
          <Button size="sm" variant={keyNeeded ? 'primary' : 'secondary'} onClick={onKey}>
            {p.hasKey ? 'Replace key' : 'Set key'}
          </Button>
        </span>
      </div>

      <div className="px-5 py-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs text-fg-3">Models</p>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={fetchList} disabled={busy}>
              <ArrowsClockwise size={14} /> Fetch models
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(true)} disabled={adding}>
              <Plus size={14} /> Add model
            </Button>
          </div>
        </div>
        {p.models.length === 0 ? (
          <p className="py-1.5 pl-2 text-[13px] text-fg-2">No models yet. Fetch them from the provider or add one by name.</p>
        ) : (
          <ul className="flex flex-col">
            {p.models.map((m) => {
              const used = usageText(`${p.id}/${m}`)
              return (
                <li key={m} className="group flex items-center gap-3 rounded-md py-1.5 pr-1 pl-2 hover:bg-surface-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{m}</span>
                  {used && <span className="text-xs whitespace-nowrap text-fg-3">used by {used}</span>}
                  <button
                    aria-label={`Remove ${m}`}
                    onClick={() => removeModel(m)}
                    className="grid size-6 place-items-center rounded text-fg-3 hover:bg-surface hover:text-danger"
                  >
                    <X size={13} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {adding && (
          <div className="pop mt-2 rounded-md border border-line bg-surface-2/60 p-3">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                addModel(draft)
              }}
            >
              <input
                autoFocus
                aria-label={`Model name for ${p.name}`}
                className={`${inputCls} h-8 font-mono text-[13px]`}
                placeholder={info.suggested[0] ? `e.g. ${info.suggested[0]}` : 'model name, as the endpoint expects it'}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && cancelAdd()}
              />
              <Button size="sm" variant="primary" type="submit" className="h-8" disabled={!draft.trim() || p.models.includes(draft.trim())}>
                Add
              </Button>
              <Button size="sm" variant="ghost" className="h-8" onClick={cancelAdd}>
                Cancel
              </Button>
            </form>
            {p.models.includes(draft.trim()) && <p className="mt-1.5 text-xs text-fg-3">Already added.</p>}
            {suggestions.length > 0 && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-fg-3">Suggested:</span>
                {suggestions.map((m) => (
                  <button
                    key={m}
                    onClick={() => addModel(m)}
                    className="inline-flex h-6 items-center gap-1 rounded-md border border-dashed border-line-strong px-2 font-mono text-xs text-fg-2 hover:border-accent hover:text-fg"
                  >
                    <Plus size={11} /> {m}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {fetched && (
        <PickModels
          title={`Models from ${p.name}`}
          available={fetched}
          existing={p.models}
          onClose={() => setFetched(null)}
          onAdd={(ms) => patch(p.id, { models: [...p.models, ...ms] })}
        />
      )}
    </Panel>
  )
}

/** Choose which fetched models to add. Already-added ones are shown but locked. */
function PickModels({
  title,
  available,
  existing,
  onClose,
  onAdd,
}: {
  title: string
  available: string[]
  existing: string[]
  onClose: () => void
  onAdd: (models: string[]) => void
}) {
  const [picked, setPicked] = useState<string[]>([])
  const [q, setQ] = useState('')
  const shown = available.filter((m) => m.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!picked.length}
            onClick={() => {
              onAdd(picked)
              onClose()
            }}
          >
            {picked.length ? `Add ${picked.length} model${picked.length === 1 ? '' : 's'}` : 'Add models'}
          </Button>
        </>
      }
    >
      {available.length > 6 && (
        <input aria-label="Filter models" className={`${inputCls} mb-3 font-mono text-[13px]`} placeholder="Filter" value={q} onChange={(e) => setQ(e.target.value)} />
      )}
      <ul className="flex max-h-80 flex-col overflow-y-auto">
        {shown.map((m) => {
          const added = existing.includes(m)
          return (
            <li key={m}>
              <label className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 ${added ? 'opacity-60' : 'cursor-pointer hover:bg-surface-2'}`}>
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--accent)]"
                  disabled={added}
                  checked={added || picked.includes(m)}
                  onChange={() => setPicked((ps) => (ps.includes(m) ? ps.filter((x) => x !== m) : [...ps, m]))}
                />
                <span className="flex-1 font-mono text-[13px]">{m}</span>
                {added && <span className="text-xs text-fg-3">added</span>}
              </label>
            </li>
          )
        })}
        {shown.length === 0 && <li className="px-2 py-3 text-[13px] text-fg-3">No models match.</li>}
      </ul>
    </Modal>
  )
}

/** Add a provider (pick a kind first) or edit an existing one's name and base URL. */
function ProviderForm({ initial, onClose }: { initial?: Provider; onClose: () => void }) {
  const { s, add, patch } = useProviders()
  const [kind, setKind] = useState<ProviderKind | null>(initial?.kind ?? null)
  const info = kind ? kindInfo(kind) : null
  const [name, setName] = useState(initial?.name ?? '')
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? '')
  const [key, setKey] = useState('')
  const [models, setModels] = useState<string[]>([])
  const [custom, setCustom] = useState('')
  const [fetched, setFetched] = useState<string[]>([])
  const [status, setStatus] = useState<Status>({ state: 'idle' })
  const target = () => ({
    kind: kind!,
    baseUrl: baseUrl.trim() || undefined,
    apiKey: key.trim() || undefined,
  })
  const test = async () => {
    setStatus({ state: 'pending', text: 'Testing connection...' })
    const r = await testConnection(target())
    setStatus(r.ok ? { state: 'ok', text: `Connected in ${r.ms} ms` } : { state: 'error', text: r.error })
  }
  const fetchList = async () => {
    setStatus({ state: 'pending', text: 'Fetching models...' })
    const r = await fetchModels(target())
    if (!r.ok) return setStatus({ state: 'error', text: `Couldn't fetch models. ${r.error}` })
    setStatus({ state: 'ok', text: `Found ${r.models.length} models. Tick the ones you want.` })
    setFetched(r.models)
  }

  const pick = (k: ProviderKind) => {
    const i = kindInfo(k)
    setKind(k)
    const taken = s.settings.providers.some((p) => p.name === i.label)
    setName(k === 'openai-compatible' ? '' : taken ? `${i.label} 2` : i.label)
    setBaseUrl(i.baseUrl ?? '')
    setModels(i.suggested.slice(0, 2))
  }

  const nameTaken = s.settings.providers.some((p) => p.id !== initial?.id && p.name.trim().toLowerCase() === name.trim().toLowerCase())
  let urlError: string | undefined
  if (baseUrl.trim()) {
    try {
      new URL(baseUrl.trim())
    } catch {
      urlError = 'Enter a full URL, like https://api.example.com/v1'
    }
  }
  const ok = info && name.trim() && !nameTaken && !urlError && (!info.baseUrlRequired || baseUrl.trim())

  const save = async () => {
    if (!ok || !kind) return
    try {
      if (initial) {
        await patch(initial.id, { name: name.trim(), baseUrl: baseUrl.trim() || undefined })
      } else {
        // A model name typed but not yet added still counts.
        const all = custom.trim() && !models.includes(custom.trim()) ? [...models, custom.trim()] : models
        await add({ name: name.trim(), kind, baseUrl: baseUrl.trim() || undefined, apiKey: key.trim() || undefined, models: all })
      }
      onClose()
    } catch (e) {
      setStatus({ state: 'error', text: e instanceof Error ? e.message : 'Could not save the provider.' })
    }
  }

  if (!info) {
    return (
      <Modal title="Add provider" onClose={onClose} wide>
        <p className="mb-4 text-sm text-fg-2">Pick the kind of provider. You'll add a key and models next.</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PROVIDER_KINDS.map((k) => (
            <button
              key={k.kind}
              onClick={() => pick(k.kind)}
              className={`flex flex-col items-start gap-1 rounded-[10px] border px-4 py-3.5 text-left transition-colors hover:border-accent hover:bg-surface-2 ${
                k.kind === 'openai-compatible' ? 'border-dashed border-line-strong' : 'border-line'
              }`}
            >
              <span className="text-sm font-medium">{k.label}</span>
              <span className="text-xs leading-snug text-fg-2">{k.blurb}</span>
            </button>
          ))}
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      title={initial ? `Edit ${initial.name}` : `Add ${info.label}`}
      onClose={onClose}
      footer={
        <>
          {!initial && (
            <Button variant="ghost" className="mr-auto" onClick={() => setKind(null)}>
              Back
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!ok} onClick={() => void save()}>
            {initial ? 'Save' : 'Add provider'}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <Field
          label="Name"
          help={initial ? `Model ids keep the prefix "${initial.id}/".` : `Shown in model pickers. Models are saved as "${slug(name || info.label)}/<model>".`}
          error={nameTaken ? 'Another provider already has this name.' : undefined}
        >
          {(id) => <input id={id} className={inputCls} placeholder={kind === 'openai-compatible' ? 'e.g. Company gateway' : undefined} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>

        {info && (
          <Field
            label={info.baseUrlRequired ? 'Base URL' : 'Base URL (optional)'}
            help={info.baseUrlRequired ? 'The URL before /chat/completions.' : info.baseUrl ? `Default: ${info.baseUrl}` : 'Leave empty for the official API. Set it to go through a proxy or gateway.'}
            error={urlError}
          >
            {(id) => (
              <input
                id={id}
                className={`${inputCls} font-mono text-[13px]`}
                placeholder="https://api.example.com/v1"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            )}
          </Field>
        )}

        {!initial && (
          <>
            <KeyField required={info.keyRequired} value={key} onChange={setKey} />
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={test} disabled={status.state === 'pending'}>
                  <Plug size={14} /> Test connection
                </Button>
                <Button size="sm" onClick={fetchList} disabled={status.state === 'pending'}>
                  <ArrowsClockwise size={14} /> Fetch models
                </Button>
              </div>
              <StatusLine status={status} />
            </div>
            <div>
              <p className="mb-2 text-[13px] font-medium">Models</p>
              <div className={`flex flex-col gap-1.5 ${fetched.length > 8 ? 'max-h-60 overflow-y-auto' : ''}`}>
                {[...new Set([...info.suggested, ...fetched, ...models])].map((m) => (
                  <label key={m} className="flex items-center gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--accent)]"
                      checked={models.includes(m)}
                      onChange={() => setModels((ms) => (ms.includes(m) ? ms.filter((x) => x !== m) : [...ms, m]))}
                    />
                    <span className="font-mono text-[13px]">{m}</span>
                  </label>
                ))}
              </div>
              <div className="mt-2.5 flex gap-2">
                <input
                  aria-label="Model name"
                  className={`${inputCls} h-8 font-mono text-[13px]`}
                  placeholder="Add another model name"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (custom.trim() && !models.includes(custom.trim())) setModels([...models, custom.trim()])
                      setCustom('')
                    }
                  }}
                />
                <Button
                  size="sm"
                  className="h-8"
                  disabled={!custom.trim() || models.includes(custom.trim())}
                  onClick={() => {
                    setModels([...models, custom.trim()])
                    setCustom('')
                  }}
                >
                  Add
                </Button>
              </div>
              <p className="mt-1.5 text-xs text-fg-3">You can add or remove models later.</p>
            </div>
          </>
        )}
      </form>
    </Modal>
  )
}

function KeyField({ required, value, onChange }: { required: boolean; value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false)
  return (
    <Field
      label={required ? 'API key' : 'API key (optional)'}
      help="Sent to the local server, which saves it in your config file. Prototype: the key is not saved anywhere, only that one was entered."
    >
      {(id) => (
        <div className="relative">
          <input
            id={id}
            type={show ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            className={`${inputCls} pr-10 font-mono text-[13px]`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <button
            type="button"
            aria-label={show ? 'Hide key' : 'Show key'}
            onClick={() => setShow(!show)}
            className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded text-fg-3 hover:text-fg"
          >
            {show ? <EyeSlash size={15} /> : <Eye size={15} />}
          </button>
        </div>
      )}
    </Field>
  )
}

function KeyForm({ provider, onClose }: { provider: Provider; onClose: () => void }) {
  const { patch } = useProviders()
  const [key, setKey] = useState('')
  return (
    <Modal
      title={`${provider.hasKey ? 'Replace' : 'Set'} ${provider.name} key`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!key.trim()}
            onClick={() => {
              void patch(provider.id, { apiKey: key.trim() })
              onClose()
            }}
          >
            Save key
          </Button>
        </>
      }
    >
      <KeyField required value={key} onChange={setKey} />
    </Modal>
  )
}
