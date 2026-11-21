import { ArrowClockwise, List } from '@phosphor-icons/react'
import type { LogFile } from '@promptimize/shared'
import { useCallback, useEffect, useState } from 'react'
import { logsApi } from '../api'
import { Button, Empty, PageHeader, Panel } from '../components/ui'
import { errorMessage } from '../components/ui.helpers'

export function Logs() {
  const [file, setFile] = useState<LogFile | null>(null)
  const [error, setError] = useState('')
  const [auto, setAuto] = useState(true)

  const load = useCallback(async () => {
    try {
      setFile(await logsApi.get())
      setError('')
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [])

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0)
    const timer = auto ? window.setInterval(() => void load(), 3000) : undefined
    return () => {
      window.clearTimeout(initial)
      if (timer !== undefined) window.clearInterval(timer)
    }
  }, [auto, load])

  return (
    <>
      <PageHeader title="Logs" sub="Server events in the order they happened." />
      <div className="flex flex-col gap-4">
        {error && <p className="text-sm text-danger">{error}</p>}

        <Panel className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <span className="text-xs text-fg-3">Log file</span>
            <p className="mt-1 break-all font-mono text-xs text-fg-2">{file?.path ?? 'Loading…'}</p>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-fg-2">
              <input
                type="checkbox"
                checked={auto}
                onChange={(e) => setAuto(e.target.checked)}
              />
              Auto-update
            </label>
            <Button onClick={() => void load()}>
              <ArrowClockwise size={15} /> Refresh
            </Button>
          </div>
        </Panel>

        {file?.text ? (
          <Panel className="p-0">
            <pre className="max-h-[65dvh] overflow-auto p-4 font-mono text-xs leading-relaxed text-fg-2">
              {file.text}
            </pre>
          </Panel>
        ) : (
          <Empty
            icon={<List size={28} />}
            title="No log entries yet"
            body="Server events appear here as the app runs."
          />
        )}
      </div>
    </>
  )
}
