import { parseArgs } from 'node:util'
import { serve } from '@hono/node-server'
import { app } from './app.js'

const { values } = parseArgs({ options: { port: { type: 'string', default: '4477' } } })
const port = Number(values.port)

// 127.0.0.1 only: nobody else on the network can reach the app and spend the user's API keys.
serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () => {
  console.log(`Promptimize running at http://127.0.0.1:${port}`)
})
