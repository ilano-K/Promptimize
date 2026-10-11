import { X } from '@phosphor-icons/react'
import { useEffect, useId, useRef, useState, type ReactNode, type ButtonHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { kindInfo } from '../providers'
import { useModelGroups } from '../store'
import { Select } from './Select'
import type { Label } from '../types'

// Radius system: controls (buttons, inputs, tags) 6px, panels and modals 10px.

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover',
  secondary: 'bg-surface text-fg border border-line-strong hover:bg-surface-2',
  ghost: 'text-fg-2 hover:text-fg hover:bg-surface-2',
  danger: 'bg-surface text-danger border border-line-strong hover:bg-danger-soft',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 ${
        size === 'sm' ? 'h-7 px-2.5 text-[13px]' : 'h-9 px-3.5 text-sm'
      } ${variants[variant]} ${className}`}
    />
  )
}

export function Field({ label, help, error, children }: { label: string; help?: ReactNode; error?: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-fg">
        {label}
      </label>
      {children(id)}
      {help && !error && <p className="text-xs text-fg-3">{help}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}

const control =
  'w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg placeholder:text-fg-3 transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25'

export const inputCls = `${control} h-9`
export const textareaCls = `${control} py-2 leading-relaxed`
export const monoAreaCls = `${control} py-2 font-mono text-[13px] leading-relaxed`

export function LabelTag({ label }: { label: Label }) {
  const styles: Record<Label, string> = {
    train: 'bg-accent-soft text-accent-text',
    validation: 'bg-surface-2 text-fg-2 border border-line',
    test: 'bg-surface text-fg-2 border border-dashed border-line-strong',
  }
  return (
    <Tip text={labelHelp[label]}>
      <span className={`inline-flex h-5 items-center rounded-md px-1.5 font-mono text-[11px] ${styles[label]}`}>{label}</span>
    </Tip>
  )
}

export const labelHelp: Record<Label, string> = {
  train: 'The optimizer learns from these in full: inputs, outputs, and judge feedback.',
  validation: 'Run every round so you can see if changes really help. The optimizer only sees their number scores.',
  test: 'Never seen during optimizing. Run on demand on the round you pick, as a final check.',
}

export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'warn' | 'danger' }) {
  const tones = {
    neutral: 'bg-surface-2 text-fg-2',
    accent: 'bg-accent-soft text-accent-text',
    warn: 'bg-warn-soft text-warn',
    danger: 'bg-danger-soft text-danger',
  }
  return <span className={`inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>
}

const TIP_W = 224
const EDGE = 8

/**
 * Hover/focus tooltip. Rendered into <body> with fixed positioning so a
 * container with overflow-hidden can't clip it, and kept inside the viewport:
 * it shifts sideways near the screen edges and flips below when there's no room above.
 */
export function Tip({ text, children }: { text: string; children: ReactNode }) {
  const anchor = useRef<HTMLSpanElement>(null)
  const tipId = useId()
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null)

  const show = () => {
    const r = anchor.current?.getBoundingClientRect()
    if (!r) return
    const left = Math.min(Math.max(EDGE, r.left + r.width / 2 - TIP_W / 2), window.innerWidth - TIP_W - EDGE)
    const below = r.top < 72
    setPos({ left, top: below ? r.bottom + 6 : r.top - 6, below })
  }
  const hide = () => setPos(null)

  useEffect(() => {
    if (!pos) return
    window.addEventListener('scroll', hide, true)
    return () => window.removeEventListener('scroll', hide, true)
  }, [pos])

  return (
    <span
      ref={anchor}
      className="inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      aria-describedby={pos ? tipId : undefined}
    >
      {children}
      {pos &&
        createPortal(
          <span
            id={tipId}
            role="tooltip"
            style={{ left: pos.left, top: pos.top, width: TIP_W }}
            className={`pointer-events-none fixed z-[60] rounded-md bg-fg px-2.5 py-1.5 text-xs leading-snug text-bg shadow-soft ${pos.below ? '' : '-translate-y-full'}`}
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  )
}

/** A 0-1 score as a number with a small inline bar (no background track). */
export function Score({ value, prev }: { value: number; prev?: number }) {
  const delta = prev === undefined ? undefined : value - prev
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[13px] tabular-nums">
      <span className="text-fg">{value.toFixed(2)}</span>
      <span className="h-1 rounded-full bg-accent/70" style={{ width: `${Math.max(2, value * 36)}px` }} />
      {delta !== undefined && Math.abs(delta) >= 0.005 && (
        <span className={delta > 0 ? 'text-accent-text' : 'text-danger'}>
          {delta > 0 ? '+' : ''}
          {delta.toFixed(2)}
        </span>
      )}
    </span>
  )
}

const modalStack: object[] = []

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const token = {}
    modalStack.push(token)
    // Escape closes only the topmost modal (an inline editor can open over the experiment form).
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && modalStack[modalStack.length - 1] === token && close.current()
    window.addEventListener('keydown', onKey)
    ref.current?.querySelector<HTMLElement>('input, textarea, select')?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      modalStack.splice(modalStack.indexOf(token), 1)
    }
  }, [])
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-scrim p-4 md:p-10" onMouseDown={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={`rise w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} rounded-[10px] border border-line-strong bg-surface shadow-soft`}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X size={16} />
          </Button>
        </div>
        <div className="px-5 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  )
}

export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-[10px] border border-dashed border-line-strong px-6 py-14 text-center">
      <div className="mb-3 text-fg-3">{icon}</div>
      <p className="font-medium">{title}</p>
      <p className="mt-1 max-w-[42ch] text-sm text-fg-2">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function PageHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {sub && <div className="mt-1.5 text-sm text-fg-2">{sub}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[10px] border border-line bg-surface ${className}`}>{children}</section>
}

/** Picks from the models configured in Settings, grouped by provider. */
export function ModelSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const groups = useModelGroups()
  const known = groups.some((g) => g.models.some((m) => m.id === value))
  return (
    <div className="flex flex-col gap-1">
      <Select
        id={id}
        mono
        value={value}
        onChange={onChange}
        placeholder="No models configured"
        options={[
          ...(value && !known ? [{ value, label: value, hint: 'not configured', tone: 'warn' as const }] : []),
          ...groups.flatMap((g) => {
            const needsKey = kindInfo(g.provider.kind).keyRequired && !g.provider.hasKey
            return g.models.map((m) => ({
              value: m.id,
              label: m.name,
              group: g.provider.name,
              groupHint: needsKey ? <Tag tone="warn">needs key</Tag> : undefined,
            }))
          }),
        ]}
      />
      {value && !known && <p className="text-xs text-warn">This model isn't set up in Settings anymore.</p>}
      {!value && (
        <a href="#/settings" className="text-xs text-accent-text underline-offset-2 hover:underline">
          Add a provider and model in Settings
        </a>
      )}
    </div>
  )
}

/** First configured model id, used as the default for new prompts and judges. */
export function useDefaultModel(): string {
  return useModelGroups().flatMap((g) => g.models)[0]?.id ?? ''
}

export function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  return `${Math.round(h / 24)} d ago`
}
