/**
 * Tiny hash router. Hash URLs (#/datasets/abc) work on any static host
 * without server rewrite rules, which keeps deployment simple.
 * Swap for React Router later if routing needs grow.
 */
import { useSyncExternalStore, type MouseEvent, type ReactNode } from 'react'

export type Route =
  | { name: 'dashboard' }
  | { name: 'project'; id: string }
  | { name: 'dataset'; id: string }
  | { name: 'label'; imageId: string }
  | { name: 'not-found' }

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/'
  const parts = path.split('/').filter(Boolean)
  if (parts.length === 0) return { name: 'dashboard' }
  if (parts[0] === 'projects' && parts[1]) return { name: 'project', id: parts[1] }
  if (parts[0] === 'datasets' && parts[1]) return { name: 'dataset', id: parts[1] }
  if (parts[0] === 'label' && parts[1]) return { name: 'label', imageId: parts[1] }
  return { name: 'not-found' }
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash)
  return parseRoute(hash)
}

export const paths = {
  dashboard: () => '/',
  project: (id: string) => `/projects/${id}`,
  dataset: (id: string) => `/datasets/${id}`,
  label: (imageId: string) => `/label/${imageId}`,
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const hash = '#' + to
  if (opts.replace) window.location.replace(hash)
  else window.location.hash = to
}

export function Link({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    navigate(to)
  }
  return (
    <a href={'#' + to} onClick={onClick} className={className}>
      {children}
    </a>
  )
}
