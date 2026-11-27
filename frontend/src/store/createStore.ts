import { useSyncExternalStore } from 'react'

/**
 * A ~30-line store in the style of Zustand: plain state object, setState with
 * a partial or updater, and a hook that re-renders only when the selected
 * slice changes. Selectors must return existing values (not new objects or
 * arrays), or the component will re-render on every change.
 */
export interface Store<S> {
  getState(): S
  setState(partial: Partial<S> | ((s: S) => Partial<S>)): void
  subscribe(listener: () => void): () => void
}

export function createStore<S extends object>(initial: S): Store<S> {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    getState: () => state,
    setState(partial) {
      const next = typeof partial === 'function' ? partial(state) : partial
      state = { ...state, ...next }
      listeners.forEach((l) => l())
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export function useStore<S, T>(store: Store<S>, selector: (s: S) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()))
}
