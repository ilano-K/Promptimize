import { Books, Plus } from '@phosphor-icons/react'
import { useState } from 'react'
import { InputEditor, JudgeEditor, PromptEditor } from '../components/editors'
import { Button, Empty, LabelTag, PageHeader, Tag } from '../components/ui'
import { go } from '../router'
import { usedBy, useStore } from '../store'
import type { Input, Judge, Label, Prompt } from '../types'

type Tab = 'inputs' | 'prompts' | 'judges'

export function Library({ tab }: { tab: Tab }) {
  const s = useStore()
  const inputs = s.inputs.filter((x) => x.projectId === s.projectId)
  const prompts = s.prompts.filter((x) => x.projectId === s.projectId)
  const judges = s.judges.filter((x) => x.projectId === s.projectId)
  const [labelFilter, setLabelFilter] = useState<Label | 'all'>('all')
  const [editing, setEditing] = useState<{ kind: Tab; obj?: Input | Prompt | Judge } | null>(null)

  const counts = { inputs: inputs.length, prompts: prompts.length, judges: judges.length }
  const newLabel = { inputs: 'New input', prompts: 'New prompt', judges: 'New judge' }[tab]
  const uses = (kind: 'input' | 'prompt' | 'judge', id: string) => usedBy(s.experiments, kind, id).length

  return (
    <>
      <PageHeader
        title="Library"
        sub="Reusable inputs, prompts and judges. Experiments reference these, so an edit reaches every experiment that uses it."
        actions={
          <Button variant="primary" onClick={() => setEditing({ kind: tab })}>
            <Plus size={15} /> {newLabel}
          </Button>
        }
      />

      <div role="tablist" className="mb-6 flex gap-1 border-b border-line">
        {(['inputs', 'prompts', 'judges'] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => go(`library/${t}`)}
            className={`-mb-px flex h-9 items-center gap-2 border-b-2 px-3 text-sm capitalize transition-colors ${
              tab === t ? 'border-accent font-medium text-fg' : 'border-transparent text-fg-2 hover:text-fg'
            }`}
          >
            {t}
            <span className="font-mono text-xs text-fg-3">{counts[t]}</span>
          </button>
        ))}
      </div>

      {tab === 'inputs' && (
        <>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {(['all', 'train', 'validation', 'test'] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLabelFilter(l)}
                className={`h-7 rounded-md px-2.5 text-[13px] transition-colors ${
                  labelFilter === l ? 'bg-fg text-bg' : 'border border-line text-fg-2 hover:bg-surface-2'
                }`}
              >
                {l === 'all' ? 'All' : l}
                {l !== 'all' && <span className="ml-1.5 font-mono text-xs opacity-60">{inputs.filter((i) => i.label === l).length}</span>}
              </button>
            ))}
          </div>
          {inputs.length === 0 ? (
            <LibEmpty what="inputs" onNew={() => setEditing({ kind: 'inputs' })} />
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-[10px] border border-line bg-surface">
              {inputs
                .filter((i) => labelFilter === 'all' || i.label === labelFilter)
                .map((i) => (
                  <li key={i.id}>
                    <button onClick={() => setEditing({ kind: 'inputs', obj: i })} className="grid w-full gap-1 px-4 py-3 text-left transition-colors hover:bg-surface-2 md:grid-cols-[200px_1fr_auto] md:items-center md:gap-4">
                      <span className="flex items-center gap-2 font-medium">
                        {i.name}
                      </span>
                      <span className="truncate text-sm text-fg-2">{i.content}</span>
                      <span className="flex items-center gap-3">
                        <UsedCount n={uses('input', i.id)} />
                        <LabelTag label={i.label} />
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </>
      )}

      {tab === 'prompts' &&
        (prompts.length === 0 ? (
          <LibEmpty what="prompts" onNew={() => setEditing({ kind: 'prompts' })} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {prompts.map((p) => (
              <button key={p.id} onClick={() => setEditing({ kind: 'prompts', obj: p })} className="flex flex-col gap-3 rounded-[10px] border border-line bg-surface p-4 text-left transition-colors hover:border-line-strong">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono font-medium">{p.name}</p>
                    <p className="mt-0.5 font-mono text-xs text-fg-3">{p.model}</p>
                  </div>
                  <UsedCount n={uses('prompt', p.id)} />
                </div>
                <pre className="line-clamp-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-fg-2">{p.text}</pre>
                <div>{p.outputSchema.trim() ? <Tag tone="accent">JSON schema</Tag> : <Tag>Free-form output</Tag>}</div>
              </button>
            ))}
          </div>
        ))}

      {tab === 'judges' &&
        (judges.length === 0 ? (
          <LibEmpty what="judges" onNew={() => setEditing({ kind: 'judges' })} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {judges.map((j) => (
              <button key={j.id} onClick={() => setEditing({ kind: 'judges', obj: j })} className="flex flex-col gap-3 rounded-[10px] border border-line bg-surface p-4 text-left transition-colors hover:border-line-strong">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{j.name}</p>
                    <p className="mt-0.5 font-mono text-xs text-fg-3">
                      {j.model} / {j.mode}
                    </p>
                  </div>
                  <UsedCount n={uses('judge', j.id)} />
                </div>
                <p className="line-clamp-2 text-sm text-fg-2">{j.basePrompt}</p>
                <div className="flex flex-wrap gap-1.5">
                  {j.characteristics.map((c) => (
                    <span key={c.name} className="inline-flex h-6 items-center gap-1.5 rounded-md border border-line px-2 font-mono text-xs">
                      {c.name}
                      <span className="text-fg-3">{c.type === 'number' ? '0-1' : 'text'}</span>
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        ))}

      {editing?.kind === 'inputs' && <InputEditor initial={editing.obj as Input | undefined} onClose={() => setEditing(null)} />}
      {editing?.kind === 'prompts' && <PromptEditor initial={editing.obj as Prompt | undefined} onClose={() => setEditing(null)} />}
      {editing?.kind === 'judges' && <JudgeEditor initial={editing.obj as Judge | undefined} onClose={() => setEditing(null)} />}
    </>
  )
}

function UsedCount({ n }: { n: number }) {
  return <span className="font-mono text-xs whitespace-nowrap text-fg-3">{n ? `used by ${n}` : 'unused'}</span>
}

function LibEmpty({ what, onNew }: { what: string; onNew: () => void }) {
  return (
    <Empty
      icon={<Books size={28} />}
      title={`No ${what} in this project`}
      body={`Add ${what} here, or create them inline while setting up an experiment. Either way they land in the library.`}
      action={
        <Button variant="primary" onClick={onNew}>
          <Plus size={15} /> Add {what.slice(0, -1)}
        </Button>
      }
    />
  )
}
