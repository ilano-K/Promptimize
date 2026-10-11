// Simulated model calls. The real app calls providers through the AI SDK on
// the server; here everything is generated locally and deterministically from
// the text involved, so the same prompt + input always gives similar results.

import type { Input, Judge, JudgeValue, Prompt } from './types'

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Pseudo-random number in [0, 1) derived from a string. */
export function rand(seed: string): number {
  return (hash(seed) % 10000) / 10000
}

const clamp = (n: number) => Math.max(0, Math.min(1, n))

function firstSentence(text: string): string {
  const s = text.split(/(?<=[.!?])\s/)[0] ?? text
  return s.length > 110 ? s.slice(0, 107).trimEnd() + '...' : s
}

/** How much a prompt text "helps". Longer, more specific prompts score a bit higher. */
function promptQuality(text: string): number {
  const rules = text.split('\n').filter((l) => l.trim().startsWith('-')).length
  return Math.min(0.32, rules * 0.055) + rand(text) * 0.06
}

export function generateOutput(prompt: Prompt, input: Input): string {
  const lead = firstSentence(input.content)
  const q = promptQuality(prompt.text)
  if (prompt.outputSchema.trim()) {
    return JSON.stringify(
      {
        summary: lead,
        priority: rand(input.id + prompt.text) > 0.5 ? 'high' : 'normal',
        next_step: q > 0.15 ? 'Reply with refund timeline' : 'Investigate',
      },
      null,
      2,
    )
  }
  const extra =
    q > 0.2
      ? 'Action needed: confirm the account details and reply within one business day.'
      : 'The customer seems unhappy and there may be several issues worth looking into, possibly related to billing or the product itself.'
  return `**Summary:** ${lead}\n\n${extra}`
}

const textFeedback: Record<string, string[]> = {
  weak: [
    'Too long; the second sentence adds speculation the ticket does not support.',
    'Misses the concrete ask from the customer.',
    'Hedges ("possibly", "may be") make the action unclear.',
  ],
  ok: [
    'Clear and short. Could name the product area.',
    'Good action line; summary slightly repeats the ticket wording.',
  ],
  strong: ['Concise and actionable. Matches the ticket precisely.', 'Clear ask, correct priority, no filler.'],
}

export function judgeOutput(judge: Judge, prompt: Prompt, input: Input): Record<string, JudgeValue> {
  const q = promptQuality(prompt.text) + (rand(prompt.model) - 0.5) * 0.1
  const out: Record<string, JudgeValue> = {}
  for (const c of judge.characteristics) {
    const seed = c.name + input.id + prompt.text + judge.basePrompt
    const base = 0.42 + rand(c.name + input.id) * 0.2
    const score = clamp(base + q + (rand(seed) - 0.5) * 0.14)
    if (c.type === 'number') {
      out[c.name] = Math.round(score * 100) / 100
    } else {
      const bucket = score < 0.55 ? 'weak' : score < 0.75 ? 'ok' : 'strong'
      const list = textFeedback[bucket]
      out[c.name] = list[Math.floor(rand(seed + 'f') * list.length)]
    }
  }
  return out
}

/** Batch mode sometimes returns the wrong number of entries; simulate that. */
export function batchJudgeFails(seed: string): boolean {
  return rand(seed) < 0.18
}

const improvements = [
  '- Keep the summary to at most 2 sentences.',
  '- State the customer\'s concrete request in the first sentence.',
  '- Do not speculate about causes the ticket does not mention.',
  '- End with one line starting "Action needed:".',
  '- Use plain language; avoid hedging words like "possibly".',
  '- If the ticket mentions money, include the amount.',
]

const roundNotes = [
  'Outputs speculated about causes. Example: ticket "Charged twice" got "may be related to the product itself".',
  'Summaries were too long; 4 of 6 train outputs exceeded 2 sentences.',
  'The customer\'s ask was buried. Example: refund request appeared only in the last line.',
  'Hedging language still present in 2 outputs ("possibly", "seems").',
  'Amounts were dropped from billing tickets. Example: "$49" missing in the double-charge case.',
  'Mostly clean. One output still repeated the ticket verbatim.',
]

export function optimizePrompt(current: string, round: number, instructions: string): string {
  const lines = current.trimEnd().split('\n')
  const add = improvements.filter((l) => !lines.includes(l))
  const next = [...lines]
  // Each round adds one rule and occasionally rewrites the opening line.
  if (add[0]) next.push(add[0])
  if (round === 2 && next[0] && !next[0].startsWith('You are')) {
    next[0] = 'You are a support lead. ' + next[0]
  }
  if (instructions.trim() && round === 1) {
    next.push(`- ${instructions.trim().replace(/\.$/, '')}.`)
  }
  return next.join('\n')
}

export function roundNote(round: number): string {
  return roundNotes[(round - 1) % roundNotes.length]
}

/** Whether the optimizer would decide the prompt is good enough. */
export function goodEnough(promptText: string): boolean {
  return promptQuality(promptText) > 0.3
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
