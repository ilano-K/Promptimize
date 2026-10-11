import { useEffect, useState } from 'react'

// Tiny hash router: "#/experiments/e1" -> ['experiments', 'e1'].
// Query params after "?" are returned separately.

function parse() {
  const raw = window.location.hash.replace(/^#\/?/, '')
  const [path, query = ''] = raw.split('?')
  return { parts: path.split('/').filter(Boolean), query: new URLSearchParams(query) }
}

export function useRoute() {
  const [route, setRoute] = useState(parse)
  useEffect(() => {
    const on = () => {
      setRoute(parse())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export function go(path: string) {
  window.location.hash = '#/' + path.replace(/^\//, '')
}
