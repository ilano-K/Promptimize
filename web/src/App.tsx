import { useEffect } from 'react'
import { Shell } from './components/Shell'
import { Compare } from './pages/Compare'
import { Experiment } from './pages/Experiment'
import { Experiments } from './pages/Experiments'
import { Library } from './pages/Library'
import { Projects } from './pages/Projects'
import { Settings } from './pages/Settings'
import { useRoute } from './router'
import { useStore } from './store'

export default function App() {
  const { parts, query } = useRoute()
  const hasProject = useStore((s) => s.projects.some((p) => String(p.id) === s.projectId))
  const loadProjects = useStore((s) => s.loadProjects)
  const loadSettings = useStore((s) => s.loadSettings)
  useEffect(() => {
    void loadProjects()
    void loadSettings()
  }, [loadProjects, loadSettings])
  let section = parts[0] ?? 'projects'
  // Project pages need an open project; without one, show the project list.
  if (!hasProject && section !== 'settings') section = 'projects'

  let page
  if (section === 'projects') {
    page = <Projects />
  } else if (section === 'library') {
    const tab = parts[1] === 'prompts' || parts[1] === 'judges' ? parts[1] : 'inputs'
    page = <Library tab={tab} />
  } else if (section === 'compare') {
    page = <Compare a={query.get('a') ?? undefined} b={query.get('b') ?? undefined} />
  } else if (section === 'settings') {
    page = <Settings />
  } else if (parts[1]) {
    page = <Experiment id={parts[1]} runParam={query.get('run') ?? undefined} />
  } else {
    page = <Experiments />
  }

  return <Shell section={section}>{page}</Shell>
}
