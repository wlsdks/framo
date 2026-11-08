import { useEffect, useState } from 'react'

type Route =
  | { name: 'home' }
  | { name: 'new' }
  | { name: 'edit'; id: string }
  | { name: 'presenter'; id: string }
  | { name: 'system' }
  | { name: 'gallery' }

function parse(hash: string): Route {
  const path = hash.replace(/^#/, '')
  const edit = /^\/edit\/([\w-]+)/.exec(path)
  if (edit) return { name: 'edit', id: edit[1] }
  const presenter = /^\/presenter\/([\w-]+)/.exec(path)
  if (presenter) return { name: 'presenter', id: presenter[1] }
  if (path.startsWith('/new')) return { name: 'new' }
  if (path.startsWith('/system')) return { name: 'system' }
  if (import.meta.env.DEV && path.startsWith('/gallery')) return { name: 'gallery' }
  return { name: 'home' }
}

export function go(route: Route) {
  location.hash = hashOf(route)
}

export function hashOf(route: Route): string {
  if (route.name === 'edit') return `#/edit/${route.id}`
  if (route.name === 'presenter') return `#/presenter/${route.id}`
  if (route.name === 'new' || route.name === 'system' || route.name === 'gallery') return `#/${route.name}`
  return '#/'
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parse(location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return '방금'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}분 전`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}시간 전`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}일 전`
  return new Intl.DateTimeFormat('ko-KR').format(ts)
}
