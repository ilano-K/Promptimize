// Non-component helpers used across the UI. They live outside ui.tsx so that
// React Fast Refresh can reload the component module without losing state.

import type { Label } from '../types'

/** Help text for each input split label, shown in tooltips and editors. */
export const labelHelp: Record<Label, string> = {
  train: 'The optimizer learns from these in full: inputs, outputs, and judge feedback.',
  validation: 'Run every round so you can see if changes really help. The optimizer only sees their number scores.',
  test: 'Never seen during optimizing. Run on demand on the round you pick, as a final check.',
}

/** Compact "2 h ago" style timestamp. */
export function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  return `${Math.round(h / 24)} d ago`
}
