import { FolderSimple, PencilSimple, Plus, Trash } from '@phosphor-icons/react'
import { useState } from 'react'
import { Button, Empty, Field, inputCls, Modal, PageHeader, Tag, textareaCls, timeAgo } from '../components/ui'
import { go } from '../router'
import { uid, useStore } from '../store'
import type { Project } from '../types'

export function Projects() {
  const s = useStore()
  const [editing, setEditing] = useState<Project | 'new' | null>(null)

  const open = (id: string) => {
    s.setProject(id)
    go('experiments')
  }

  const stats = (p: Project) => {
    const exps = s.experiments.filter((e) => e.projectId === p.id)
    const expIds = new Set(exps.map((e) => e.id))
    const lastRun = Math.max(0, ...s.runs.filter((r) => expIds.has(r.experimentId)).map((r) => r.startedAt))
    return {
      experiments: exps.length,
      inputs: s.inputs.filter((x) => x.projectId === p.id).length,
      prompts: s.prompts.filter((x) => x.projectId === p.id).length,
      judges: s.judges.filter((x) => x.projectId === p.id).length,
      lastActive: lastRun || p.createdAt,
    }
  }

  return (
    <>
      <PageHeader
        title="Projects"
        sub="Each project has its own library of inputs, prompts and judges, and its own experiments."
        actions={
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Plus size={15} /> New project
          </Button>
        }
      />

      {s.projects.length === 0 ? (
        <Empty
          icon={<FolderSimple size={28} />}
          title="No projects yet"
          body="Start with one project per AI app or feature you want to optimize prompts for."
          action={
            <Button variant="primary" onClick={() => setEditing('new')}>
              <Plus size={15} /> New project
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {s.projects.map((p, i) => {
            const st = stats(p)
            const current = p.id === s.projectId
            return (
              <li key={p.id} className="rise relative" style={{ animationDelay: `${i * 30}ms` }}>
                <button
                  onClick={() => open(p.id)}
                  className={`flex h-full w-full flex-col rounded-[10px] border bg-surface p-5 text-left transition-colors hover:border-line-strong ${
                    current ? 'border-accent/60' : 'border-line'
                  }`}
                >
                  <span className="flex items-center gap-2 pr-9">
                    <span className="truncate font-medium">{p.name}</span>
                    {current && <Tag tone="accent">Open</Tag>}
                  </span>
                  <span className={`mt-1.5 line-clamp-2 min-h-[2.5em] text-sm ${p.description ? 'text-fg-2' : 'text-fg-3'}`}>
                    {p.description || 'No description'}
                  </span>
                  <span className="mt-5 grid grid-cols-4 gap-2 border-t border-line pt-4">
                    {(
                      [
                        ['experiments', st.experiments],
                        ['inputs', st.inputs],
                        ['prompts', st.prompts],
                        ['judges', st.judges],
                      ] as const
                    ).map(([label, n]) => (
                      <span key={label} className="flex flex-col">
                        <span className="font-mono text-base tabular-nums">{n}</span>
                        <span className="text-[11px] text-fg-3">{label}</span>
                      </span>
                    ))}
                  </span>
                  {st.lastActive && <span className="mt-4 text-xs text-fg-3">Active {timeAgo(st.lastActive)}</span>}
                </button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Edit ${p.name}`}
                  className="absolute top-3.5 right-3.5"
                  onClick={() => setEditing(p)}
                >
                  <PencilSimple size={15} />
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      {editing && <ProjectForm initial={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

export function ProjectForm({ initial, onClose }: { initial?: Project; onClose: () => void }) {
  const s = useStore()
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const taken = s.projects.some((p) => p.id !== initial?.id && p.name.trim().toLowerCase() === name.trim().toLowerCase())
  const ok = name.trim() && !taken

  const save = () => {
    const p: Project = {
      id: initial?.id ?? uid(),
      name: name.trim(),
      description: description.trim() || undefined,
      createdAt: initial?.createdAt ?? Date.now(),
    }
    s.saveProject(p)
    onClose()
    if (!initial) {
      s.setProject(p.id)
      go('experiments')
    }
  }

  const remove = () => {
    if (!initial) return
    const n = s.experiments.filter((e) => e.projectId === initial.id).length
    if (confirm(`Delete "${initial.name}"? This deletes its library, ${n} experiment${n === 1 ? '' : 's'} and all their runs. It can't be undone.`)) {
      s.deleteProject(initial.id)
      onClose()
    }
  }

  return (
    <Modal
      title={initial ? 'Edit project' : 'New project'}
      onClose={onClose}
      footer={
        <>
          {initial && (
            <Button variant="danger" className="mr-auto" onClick={remove}>
              <Trash size={15} /> Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!ok} onClick={save}>
            {initial ? 'Save' : 'Create project'}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (ok) save()
        }}
      >
        <Field label="Name" error={taken ? 'A project with this name already exists.' : undefined}>
          {(id) => <input id={id} className={inputCls} placeholder="e.g. Support desk" value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Description (optional)" help="What app or feature these prompts belong to.">
          {(id) => <textarea id={id} rows={3} className={textareaCls} value={description} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
      </form>
    </Modal>
  )
}
