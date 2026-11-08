import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { debounce } from '../lib/util'
import { labeling, labelingStore } from '../store/labeling'
import { errorMessage } from './useAsync'

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error'

/**
 * Saves the current image's annotations ~0.8 s after the last change.
 * Skips while a drag is in progress. Returns a flush() for navigation.
 */
export function useAutosave(onSaved?: (count: number) => void) {
  const [status, setStatus] = useState<SaveStatus>('saved')
  const [error, setError] = useState('')
  const onSavedRef = useRef(onSaved)
  onSavedRef.current = onSaved

  const saverRef = useRef<ReturnType<typeof makeSaver> | null>(null)

  function makeSaver() {
    let inFlight: Promise<void> = Promise.resolve()
    const save = async () => {
      const s = labelingStore.getState()
      if (!s.imageId || s.revision === s.savedRevision || s.gestureStart) return
      const { imageId, revision, annotations } = s
      setStatus('saving')
      try {
        await api.saveAnnotations(imageId, annotations)
        // only mark saved if we are still on the same image
        if (labelingStore.getState().imageId === imageId) {
          labeling.markSaved(revision)
          const now = labelingStore.getState()
          setStatus(now.revision === revision ? 'saved' : 'unsaved')
        }
        setError('')
        onSavedRef.current?.(annotations.filter((a) => a.status === 'accepted').length)
      } catch (e) {
        setStatus('error')
        setError(errorMessage(e))
      }
    }
    const queued = debounce(() => {
      inFlight = inFlight.then(save)
    }, 800)
    return {
      schedule: queued,
      async flush() {
        queued.cancel()
        inFlight = inFlight.then(save)
        await inFlight
      },
    }
  }

  if (!saverRef.current) saverRef.current = makeSaver()

  useEffect(() => {
    let lastRevision = labelingStore.getState().revision
    let lastImage = labelingStore.getState().imageId
    return labelingStore.subscribe(() => {
      const s = labelingStore.getState()
      if (s.imageId !== lastImage) {
        lastImage = s.imageId
        lastRevision = s.revision
        setStatus('saved')
        return
      }
      if (s.revision !== lastRevision) {
        lastRevision = s.revision
        if (s.revision !== s.savedRevision) {
          setStatus('unsaved')
          saverRef.current!.schedule()
        }
      }
      // a drag just ended without a revision change is a no-op
    })
  }, [])

  // Warn before closing the tab with unsaved work
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const s = labelingStore.getState()
      if (s.revision !== s.savedRevision) e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  return { status, error, flush: () => saverRef.current!.flush() }
}
