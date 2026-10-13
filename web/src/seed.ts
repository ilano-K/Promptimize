// Example data so the prototype has something to show on first load.

import { snapshotProviders } from './providers'
import { generateOutput, judgeOutput } from './sim'
import type { Experiment, Input, Judge, Prompt, Run, Settings } from './types'

const t = (id: string, name: string, label: Input['label'], content: string): Input => ({
  id,
  projectId: 'p1',
  name,
  label,
  content,
})

export const inputs: Input[] = [
  t('in1', 'Charged twice', 'train', 'I was charged $49 twice for my March subscription. Please refund the duplicate charge. Order #A-20931.'),
  t('in2', 'Export broken', 'train', 'CSV export has been failing since yesterday with "Error 500". I need the report for a board meeting on Friday.'),
  t('in3', 'Cancel plan', 'train', 'How do I cancel? I can\'t find the option anywhere in settings and I don\'t want to be billed next month.'),
  t('in4', 'Angry about downtime', 'train', 'Third outage this week. Our team lost two hours of work. What are you doing about this?'),
  t('in5', 'Seat upgrade', 'validation', 'We hired four people. Can we add 4 seats mid-cycle and get billed pro-rata?'),
  t('in6', 'SSO login loop', 'validation', 'After enabling SSO, users get stuck in a redirect loop on the login page. Chrome and Firefox both.'),
  t('in7', 'Invoice address', 'test', 'Our invoices show the old office address. Please update it to 14 Harbour St, Leith, and reissue April\'s invoice.'),
  t('in8', 'Data deletion', 'test', 'Under GDPR I request deletion of all data tied to my account, jonas.weber@example.org.'),
]

export const prompts: Prompt[] = [
  {
    id: 'pr1',
    projectId: 'p1',
    name: 'summarize',
    model: 'openai/gpt-5-mini',
    outputSchema: '',
    text: 'Summarize the support ticket below for an agent who will handle it.\n\nTicket:\n{{input}}',
  },
  {
    id: 'pr2',
    projectId: 'p1',
    name: 'summarize (haiku)',
    model: 'anthropic/claude-haiku-5-5',
    outputSchema: '',
    text: 'Summarize the support ticket below for an agent who will handle it.\n\nTicket:\n{{input}}',
  },
  {
    id: 'pr3',
    projectId: 'p1',
    name: 'triage',
    model: 'anthropic/claude-sonnet-5-5',
    outputSchema: '{\n  "summary": "string",\n  "priority": "high | normal",\n  "next_step": "string"\n}',
    text: 'Triage this support ticket. Return the summary, a priority, and the next step.\n- Priority is high if the customer is blocked.\n\nTicket:\n{{input}}',
  },
]

export const judges: Judge[] = [
  {
    id: 'j1',
    projectId: 'p1',
    name: 'Summary quality',
    model: 'anthropic/claude-sonnet-5-5',
    mode: 'individual',
    basePrompt:
      'You review ticket summaries written for support agents.\n\nclarity: 1.0 = an agent can act after one read; 0.5 = needs a re-read; 0.0 = confusing.\naccuracy: 1.0 = every claim is in the ticket; 0.0 = invents facts.\ntone: short written feedback on wording.',
    characteristics: [
      { name: 'clarity', type: 'number' },
      { name: 'accuracy', type: 'number' },
      { name: 'tone', type: 'text' },
    ],
  },
  {
    id: 'j2',
    projectId: 'p1',
    name: 'Quick batch check',
    model: 'openai/gpt-5-mini',
    mode: 'batch',
    basePrompt: 'Score every summary for clarity (0 to 1). 1.0 = actionable after one read.',
    characteristics: [{ name: 'clarity', type: 'number' }],
  },
]

const day = 86_400_000
const now = Date.now()

export const experiments: Experiment[] = [
  {
    id: 'e1',
    projectId: 'p1',
    name: 'Summarize baseline',
    promptId: 'pr1',
    judgeId: 'j1',
    inputIds: ['in1', 'in2', 'in3', 'in4', 'in5', 'in6', 'in7', 'in8'],
    createdAt: now - 3 * day,
  },
  {
    id: 'e2',
    projectId: 'p1',
    name: 'Summarize on Haiku',
    promptId: 'pr2',
    judgeId: 'j1',
    inputIds: ['in1', 'in2', 'in3', 'in4', 'in5', 'in6', 'in7', 'in8'],
    createdAt: now - 2 * day,
  },
  {
    id: 'e3',
    projectId: 'p1',
    name: 'Triage preview',
    promptId: 'pr3',
    judgeId: null,
    inputIds: ['in1', 'in2', 'in4'],
    createdAt: now - day,
  },
  {
    id: 'e4',
    projectId: 'p1',
    name: 'Batch judge trial',
    promptId: 'pr1',
    judgeId: 'j2',
    inputIds: ['in1', 'in2', 'in3', 'in4'],
    createdAt: now - 5 * 3_600_000,
  },
]

export const settings: Settings = {
  defaultOptimizerModel: 'anthropic/claude-sonnet-5-5',
  providers: [
    { id: 'anthropic', kind: 'anthropic', name: 'Anthropic', hasKey: true, models: ['claude-sonnet-5-5', 'claude-haiku-5-5'] },
    { id: 'openai', kind: 'openai', name: 'OpenAI', hasKey: true, models: ['gpt-5-mini'] },
    { id: 'ollama', kind: 'ollama', name: 'Ollama', baseUrl: 'http://localhost:11434/v1', hasKey: false, models: ['llama3.1:8b'] },
  ],
}

function finishedRun(id: string, e: Experiment, startedAt: number, judgeError = false): Run {
  const prompt = prompts.find((p) => p.id === e.promptId)!
  const judge = e.judgeId ? judges.find((j) => j.id === e.judgeId)! : null
  const ins = inputs.filter((i) => e.inputIds.includes(i.id))
  return {
    id,
    experimentId: e.id,
    kind: 'run',
    startedAt,
    snapshot: {
      prompt: { ...prompt },
      inputs: ins.map((i) => ({ ...i })),
      judge: judge ? structuredClone(judge) : null,
      providers: snapshotProviders(settings.providers, [prompt.model, ...(judge ? [judge.model] : [])]),
    },
    status: judgeError ? 'judge_error' : 'done',
    error: judgeError ? `Batch judge returned 3 entries for ${ins.length} outputs. Outputs were kept.` : undefined,
    results: ins.map((i) => ({
      inputKey: i.id,
      output: generateOutput(prompt, i),
      status: judgeError ? 'judge_error' : judge ? 'judged' : 'output_done',
      judge: judge && !judgeError ? judgeOutput(judge, prompt, i) : undefined,
    })),
  }
}

export const runs: Run[] = [
  finishedRun('r1', experiments[0], now - 3 * day + 600_000),
  finishedRun('r2', experiments[1], now - 2 * day + 600_000),
  finishedRun('r3', experiments[2], now - day + 300_000),
  finishedRun('r4', experiments[3], now - 4 * 3_600_000, true),
]

