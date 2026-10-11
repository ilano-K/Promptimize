import { Hono } from 'hono'
import type { Health } from '@promptimize/shared'

export const app = new Hono()

app.get('/api/health', (c) => c.json<Health>({ ok: true }))
