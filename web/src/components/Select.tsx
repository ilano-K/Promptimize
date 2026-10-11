import { CaretUpDown, Check, MagnifyingGlass } from '@phosphor-icons/react'
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

// A styled replacement for <select>. Native select popups can't be styled, so
// this renders its own listbox: grouped options, a check on the selected one,
// a muted hint per option, a filter box for long lists, and full keyboard use
// (arrows, Home/End, Enter, Escape, typing to filter).

export interface SelectOption {
  value: string
  label: string
  hint?: ReactNode // muted, right-aligned (e.g. provider, "used by 2")
  group?: string // consecutive options with the same group get one header
  groupHint?: ReactNode // shown in the group header (e.g. "needs key")
  tone?: 'warn' // for values that are no longer valid
}

interface Props {
  id?: string
  'aria-label'?: string
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  mono?: boolean // render labels in the mono font (model ids, names)
  size?: 'sm' | 'md'
  className?: string
}

export function Select({ id, value, onChange, options, placeholder = 'Choose...', mono, size = 'md', className = '', ...rest }: Props) {
  const listId = useId()
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [above, setAbove] = useState(false)

  const selected = options.find((o) => o.value === value)
  const searchable = options.length > 8
  const q = query.trim().toLowerCase()
  const shown = q ? options.filter((o) => `${o.label} ${o.group ?? ''}`.toLowerCase().includes(q)) : options

  const show = () => {
    setQuery('')
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    // Open upward when there isn't room below (e.g. near the bottom of a popup).
    const r = trigger.current?.getBoundingClientRect()
    setAbove(!!r && window.innerHeight - r.bottom < 300 && r.top > window.innerHeight - r.bottom)
    setOpen(true)
  }
  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) trigger.current?.focus()
  }
  const pick = (o: SelectOption | undefined) => {
    if (!o) return
    onChange(o.value)
    close()
  }

  // Close when clicking anywhere else.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) close(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Keep the highlighted option in view.
  useLayoutEffect(() => {
    if (!open) return
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      // Stop here so an enclosing popup doesn't close too.
      e.stopPropagation()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(shown.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActive(shown.length - 1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      pick(shown[active])
    } else if (e.key === 'Tab') {
      close(false)
    }
  }

  const h = size === 'sm' ? 'h-8 text-[13px]' : 'h-9 text-sm'

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        ref={trigger}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={rest['aria-label']}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault()
            show()
          } else if (open) onKey(e)
        }}
        className={`flex w-full items-center gap-2 rounded-md border bg-surface px-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/25 ${h} ${
          open ? 'border-accent ring-2 ring-accent/25' : 'border-line-strong hover:border-fg-3'
        }`}
      >
        <span className={`min-w-0 flex-1 truncate ${mono ? 'font-mono text-[13px]' : ''} ${selected ? (selected.tone === 'warn' ? 'text-warn' : 'text-fg') : 'text-fg-3'}`}>
          {selected?.label ?? placeholder}
        </span>
        {selected?.group && <span className="hidden shrink-0 text-xs text-fg-3 sm:inline">{selected.group}</span>}
        <CaretUpDown size={14} className="shrink-0 text-fg-3" />
      </button>

      {open && (
        <div
          className={`pop absolute left-0 z-50 w-full min-w-[240px] overflow-hidden rounded-[10px] border border-line-strong bg-surface shadow-soft ${
            above ? 'bottom-full mb-1.5 origin-bottom' : 'top-full mt-1.5 origin-top'
          }`}
        >
          {searchable && (
            <div className="flex items-center gap-2 border-b border-line px-3">
              <MagnifyingGlass size={14} className="text-fg-3" />
              <input
                autoFocus
                aria-label="Filter options"
                aria-controls={listId}
                aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
                className="h-9 w-full bg-transparent text-[13px] text-fg placeholder:text-fg-3 focus:outline-none"
                placeholder="Filter"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setActive(0)
                }}
                onKeyDown={onKey}
              />
            </div>
          )}
          <ul
            ref={list}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
            className="max-h-72 overflow-y-auto p-1"
          >
            {shown.map((o, i) => {
              const header = o.group && o.group !== shown[i - 1]?.group
              const isSel = o.value === value
              return (
                <li key={o.value} role="presentation">
                  {header && (
                    <div className={`flex items-center gap-2 px-2.5 pt-2 pb-1 ${i > 0 ? 'mt-1 border-t border-line' : ''}`} role="presentation">
                      <span className="text-xs font-medium text-fg-2">{o.group}</span>
                      {o.groupHint}
                    </div>
                  )}
                  <div
                    id={`${listId}-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={isSel}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(o)}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-md py-1.5 pr-2.5 ${o.group ? 'pl-3.5' : 'pl-2.5'} ${
                      i === active ? 'bg-surface-2' : ''
                    }`}
                  >
                    <span className={`min-w-0 flex-1 truncate ${mono ? 'font-mono text-[13px]' : 'text-sm'} ${o.tone === 'warn' ? 'text-warn' : isSel ? 'font-medium text-fg' : 'text-fg'}`}>
                      {o.label}
                    </span>
                    {o.hint && <span className="shrink-0 text-xs text-fg-3">{o.hint}</span>}
                    <Check size={14} weight="bold" className={`shrink-0 text-accent ${isSel ? '' : 'invisible'}`} />
                  </div>
                </li>
              )
            })}
            {shown.length === 0 && <li className="px-2.5 py-3 text-[13px] text-fg-3">No matches</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
