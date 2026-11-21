import { Books, Columns, Desktop, Flask, GearSix, List, Moon, SquaresFour, Sun, type Icon } from '@phosphor-icons/react'
import { useEffect, useState, type ReactNode } from 'react'
import { useStore } from '../store'

type Theme = 'system' | 'light' | 'dark'

function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const t = localStorage.getItem('promptimize-theme')
      return t === 'light' || t === 'dark' ? t : 'system'
    } catch {
      return 'system'
    }
  })
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') delete root.dataset.theme
    else root.dataset.theme = theme
    try {
      if (theme === 'system') localStorage.removeItem('promptimize-theme')
      else localStorage.setItem('promptimize-theme', theme)
    } catch {
      /* storage unavailable */
    }
  }, [theme])
  return [theme, setTheme]
}

const nav = [
  { key: 'experiments', label: 'Experiments', icon: Flask },
  { key: 'library', label: 'Library', icon: Books },
  { key: 'compare', label: 'Compare', icon: Columns },
]

export function Shell({ section, children }: { section: string; children: ReactNode }) {
  const [theme, setTheme] = useTheme()
  const current = useStore((s) => s.projects.find((p) => String(p.id) === s.projectId))

  const link = (key: string, label: string, Icon: Icon) => {
    const active = section === key
    return (
      <a
        key={key}
        href={`#/${key}`}
        aria-current={active ? 'page' : undefined}
        className={`flex h-8 shrink-0 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors ${
          active ? 'bg-surface-2 font-medium text-fg' : 'text-fg-2 hover:bg-surface-2 hover:text-fg'
        }`}
      >
        <Icon size={16} weight={active ? 'fill' : 'regular'} className={active ? 'text-accent' : ''} />
        {label}
      </a>
    )
  }

  const themeSwitch = (
    <div className="flex rounded-md border border-line p-0.5" role="radiogroup" aria-label="Theme">
      {(
        [
          ['light', Sun],
          ['system', Desktop],
          ['dark', Moon],
        ] as const
      ).map(([t, Icon]) => (
        <button
          key={t}
          role="radio"
          aria-checked={theme === t}
          aria-label={`${t} theme`}
          onClick={() => setTheme(t)}
          className={`flex h-6 flex-1 items-center justify-center rounded px-2 transition-colors ${theme === t ? 'bg-surface-2 text-fg' : 'text-fg-3 hover:text-fg'}`}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  )

  return (
    <div className="md:grid md:grid-cols-[232px_1fr]">
      <aside className="sticky top-0 z-20 flex flex-col gap-4 border-b border-line bg-bg px-4 py-3 md:h-[100dvh] md:border-r md:border-b-0 md:py-5">
        <div className="flex items-center justify-between gap-3">
          <a href="#/projects" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid size-6 place-items-center rounded-md bg-accent font-mono text-[13px] text-on-accent">P</span>
            Promptimize
          </a>
          <div className="md:hidden">{themeSwitch}</div>
        </div>

        <nav className="-mx-1 flex gap-0.5 overflow-x-auto [scrollbar-width:none] md:flex-col">
          {link('projects', 'All projects', SquaresFour)}
          {current && (
            <>
              <a
                href="#/projects"
                title="Switch project"
                className="mt-0 flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-fg md:mt-4 md:mb-1 md:h-auto md:flex-col md:items-start md:gap-0.5 md:px-2.5"
              >
                <span className="hidden text-xs font-normal text-fg-3 md:block">Project</span>
                <span className="max-w-[180px] truncate">{current.name}</span>
              </a>
              {nav.map(({ key, label, icon }) => link(key, label, icon))}
            </>
          )}
          {link('logs', 'Logs', List)}
          <span className="md:hidden">{link('settings', 'Settings', GearSix)}</span>
        </nav>

        <div className="mt-auto hidden flex-col gap-3 md:flex">
          <div className="-mx-1">{link('settings', 'Settings', GearSix)}</div>
          <p className="text-xs leading-snug text-fg-3">Prototype. Model calls are simulated in the browser.</p>
          {themeSwitch}
        </div>
      </aside>
      <main className="mx-auto w-full max-w-[1180px] px-4 py-8 md:px-10 md:py-10">{children}</main>
    </div>
  )
}
