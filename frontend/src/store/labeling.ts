/**
 * State for the labeling workspace.
 *
 * Kept in separate concerns:
 *  - annotations + undo/redo history (what gets saved)
 *  - selection, active tool, active class (UI only)
 *  - view (zoom/pan) lives in the canvas component, since nothing else needs it
 *
 * History model: every committed change pushes the previous annotation list
 * onto `past`. Drags call beginGesture() on pointer down, update live with
 * replaceLive(), and endGesture() on pointer up, so one drag = one undo step.
 */
import type { Annotation, Geometry, Id } from '../types/annotation'
import { newId, nowIso } from '../lib/util'
import { createStore } from './createStore'

export type ToolId = 'select' | 'pan' | 'bbox' | 'polygon' | 'exemplar'

const HISTORY_LIMIT = 100

export interface LabelingState {
  imageId: Id | null
  annotations: Annotation[]
  past: Annotation[][]
  future: Annotation[][]
  /** Snapshot taken at the start of a drag; null when no gesture is active. */
  gestureStart: Annotation[] | null
  /** Bumped on every change to annotations; autosave watches it. */
  revision: number
  savedRevision: number
  selectedId: Id | null
  tool: ToolId
  activeClassId: Id | null
  hiddenClassIds: Id[]
}

const initial: LabelingState = {
  imageId: null,
  annotations: [],
  past: [],
  future: [],
  gestureStart: null,
  revision: 0,
  savedRevision: 0,
  selectedId: null,
  tool: 'select',
  activeClassId: null,
  hiddenClassIds: [],
}

export const labelingStore = createStore<LabelingState>(initial)
const { getState, setState } = labelingStore

function commit(next: Annotation[]) {
  const s = getState()
  setState({
    annotations: next,
    past: [...s.past, s.annotations].slice(-HISTORY_LIMIT),
    future: [],
    revision: s.revision + 1,
  })
}

export const labeling = {
  /** Load a new image's annotations. Clears history. */
  load(imageId: Id, annotations: Annotation[]) {
    setState({
      imageId,
      annotations,
      past: [],
      future: [],
      gestureStart: null,
      revision: 0,
      savedRevision: 0,
      selectedId: null,
    })
  },

  setTool(tool: ToolId) {
    setState({ tool })
  },

  setActiveClass(id: Id | null) {
    setState({ activeClassId: id })
  },

  toggleClassVisibility(id: Id) {
    const hidden = getState().hiddenClassIds
    setState({ hiddenClassIds: hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id] })
  },

  select(id: Id | null) {
    setState({ selectedId: id })
  },

  add(geometry: Geometry, classId: Id, extra: Partial<Annotation> = {}): Annotation {
    const s = getState()
    const t = nowIso()
    const ann: Annotation = {
      id: newId(),
      image_id: s.imageId ?? '',
      class_id: classId,
      geometry,
      source: 'human',
      confidence: null,
      status: 'accepted',
      created_at: t,
      updated_at: t,
      ...extra,
    }
    commit([...s.annotations, ann])
    setState({ selectedId: ann.id })
    return ann
  },

  /** Add several at once (AI suggestions) as a single undo step. */
  addMany(anns: Annotation[]) {
    if (anns.length === 0) return
    commit([...getState().annotations, ...anns])
  },

  update(id: Id, patch: Partial<Annotation>) {
    const s = getState()
    commit(s.annotations.map((a) => (a.id === id ? { ...a, ...patch, updated_at: nowIso() } : a)))
  },

  remove(id: Id) {
    const s = getState()
    commit(s.annotations.filter((a) => a.id !== id))
    if (s.selectedId === id) setState({ selectedId: null })
  },

  /** Accept AI suggestions. With no ids, accepts every pending one. */
  accept(ids?: Id[]) {
    const s = getState()
    const target = (a: Annotation) => a.status === 'pending' && (!ids || ids.includes(a.id))
    if (!s.annotations.some(target)) return
    commit(s.annotations.map((a) => (target(a) ? { ...a, status: 'accepted', updated_at: nowIso() } : a)))
  },

  /** Reject (delete) AI suggestions. With no ids, rejects every pending one. */
  reject(ids?: Id[]) {
    const s = getState()
    const target = (a: Annotation) => a.status === 'pending' && (!ids || ids.includes(a.id))
    if (!s.annotations.some(target)) return
    commit(s.annotations.filter((a) => !target(a)))
    if (s.selectedId && !getState().annotations.some((a) => a.id === s.selectedId)) setState({ selectedId: null })
  },

  beginGesture() {
    setState({ gestureStart: getState().annotations })
  },

  /** Live update during a drag. Not recorded in history until endGesture(). */
  replaceLive(id: Id, geometry: Geometry) {
    const s = getState()
    setState({ annotations: s.annotations.map((a) => (a.id === id ? { ...a, geometry } : a)) })
  },

  endGesture() {
    const s = getState()
    const start = s.gestureStart
    if (!start) return
    if (start === s.annotations) {
      setState({ gestureStart: null })
      return
    }
    const t = nowIso()
    const startById = new Map(start.map((a) => [a.id, a]))
    const stamped = s.annotations.map((a) => (startById.get(a.id) === a ? a : { ...a, updated_at: t }))
    setState({
      annotations: stamped,
      past: [...s.past, start].slice(-HISTORY_LIMIT),
      future: [],
      gestureStart: null,
      revision: s.revision + 1,
    })
  },

  undo() {
    const s = getState()
    if (s.gestureStart || s.past.length === 0) return
    const prev = s.past[s.past.length - 1]
    setState({
      annotations: prev,
      past: s.past.slice(0, -1),
      future: [s.annotations, ...s.future],
      revision: s.revision + 1,
      selectedId: prev.some((a) => a.id === s.selectedId) ? s.selectedId : null,
    })
  },

  redo() {
    const s = getState()
    if (s.gestureStart || s.future.length === 0) return
    const next = s.future[0]
    setState({
      annotations: next,
      past: [...s.past, s.annotations],
      future: s.future.slice(1),
      revision: s.revision + 1,
      selectedId: next.some((a) => a.id === s.selectedId) ? s.selectedId : null,
    })
  },

  markSaved(revision: number) {
    setState({ savedRevision: revision })
  },
}
