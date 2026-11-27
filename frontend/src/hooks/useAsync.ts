import { useCallback, useEffect, useRef, useState } from 'react'

export interface AsyncState<T> {
  data: T | undefined
  error: Error | undefined
  loading: boolean
  reload: () => void
  /** Replace data locally (optimistic updates) without refetching. */
  setData: (updater: (prev: T | undefined) => T | undefined) => void
}

/** Load data for a page. Re-runs when deps change; ignores stale responses. */
export function useAsync<T>(fn: () => Promise<T>, deps: readonly unknown[]): AsyncState<T> {
  const [data, setDataState] = useState<T | undefined>(undefined)
  const [error, setError] = useState<Error | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    let live = true
    setLoading(true)
    setError(undefined)
    fnRef
      .current()
      .then((d) => {
        if (live) setDataState(d)
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e : new Error(String(e)))
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [...deps, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  const setData = useCallback((u: (prev: T | undefined) => T | undefined) => setDataState(u), [])
  return { data, error, loading, reload, setData }
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
