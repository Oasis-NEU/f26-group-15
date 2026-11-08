import { beforeEach, describe, expect, it } from 'vitest'
import { labeling, labelingStore } from './labeling'

const box = { type: 'bbox' as const, x: 0, y: 0, width: 10, height: 10 }
const state = () => labelingStore.getState()

describe('labeling store', () => {
  beforeEach(() => labeling.load('img1', []))

  it('adds an annotation and selects it', () => {
    const a = labeling.add(box, 'c1')
    expect(state().annotations).toHaveLength(1)
    expect(state().selectedId).toBe(a.id)
    expect(a.image_id).toBe('img1')
    expect(a.source).toBe('human')
  })

  it('undoes and redoes', () => {
    labeling.add(box, 'c1')
    labeling.add(box, 'c2')
    labeling.undo()
    expect(state().annotations.map((a) => a.class_id)).toEqual(['c1'])
    labeling.redo()
    expect(state().annotations.map((a) => a.class_id)).toEqual(['c1', 'c2'])
  })

  it('records a whole drag as one undo step', () => {
    const a = labeling.add(box, 'c1')
    labeling.beginGesture()
    labeling.replaceLive(a.id, { ...box, x: 5 })
    labeling.replaceLive(a.id, { ...box, x: 9 })
    labeling.endGesture()
    expect(state().annotations[0].geometry).toMatchObject({ x: 9 })
    labeling.undo()
    expect(state().annotations[0].geometry).toMatchObject({ x: 0 })
  })

  it('ignores a gesture that changed nothing', () => {
    labeling.add(box, 'c1')
    const pastBefore = state().past.length
    labeling.beginGesture()
    labeling.endGesture()
    expect(state().past.length).toBe(pastBefore)
  })

  it('accepts and rejects AI suggestions', () => {
    labeling.addMany([
      { id: 'p1', image_id: 'img1', class_id: 'c1', geometry: box, source: 'ai', confidence: 0.9, status: 'pending', created_at: '', updated_at: '' },
      { id: 'p2', image_id: 'img1', class_id: 'c1', geometry: box, source: 'ai', confidence: 0.3, status: 'pending', created_at: '', updated_at: '' },
    ])
    labeling.accept(['p1'])
    expect(state().annotations.find((a) => a.id === 'p1')?.status).toBe('accepted')
    labeling.reject()
    expect(state().annotations.map((a) => a.id)).toEqual(['p1'])
  })

  it('clears redo history after a new change', () => {
    labeling.add(box, 'c1')
    labeling.undo()
    labeling.add(box, 'c2')
    expect(state().future).toHaveLength(0)
  })

  it('bumps the revision on every change so autosave can track it', () => {
    const r0 = state().revision
    labeling.add(box, 'c1')
    labeling.undo()
    expect(state().revision).toBe(r0 + 2)
  })
})
