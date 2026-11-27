import { describe, expect, it } from 'vitest'
import type { BBoxGeometry, PolygonGeometry } from '../types/annotation'
import {
  clampTranslation,
  geometryBounds,
  hitTest,
  pointInPolygon,
  polygonArea,
  rectFromPoints,
  rectIoU,
  resizeBBox,
  simplifyPolygon,
  translateGeometry,
} from './geometry'

const square: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
]

describe('rectFromPoints', () => {
  it('normalizes drags in any direction', () => {
    expect(rectFromPoints({ x: 50, y: 40 }, { x: 10, y: 60 })).toEqual({ x: 10, y: 40, width: 40, height: 20 })
  })
})

describe('polygons', () => {
  it('computes area with the shoelace formula', () => {
    expect(polygonArea(square)).toBe(100)
    expect(polygonArea([...square].reverse())).toBe(100)
  })

  it('tests point containment', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true)
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false)
  })

  it('hit-tests near an edge within tolerance', () => {
    const g: PolygonGeometry = { type: 'polygon', points: square }
    expect(hitTest(g, { x: 11.5, y: 5 }, 2)).toBe(true)
    expect(hitTest(g, { x: 13, y: 5 }, 2)).toBe(false)
  })

  it('reports bounds', () => {
    expect(geometryBounds({ type: 'polygon', points: [[3, 4], [9, 1], [6, 8]] })).toEqual({ x: 3, y: 1, width: 6, height: 7 })
  })
})

describe('resizeBBox', () => {
  const box: BBoxGeometry = { type: 'bbox', x: 10, y: 10, width: 20, height: 20 }

  it('moves only the dragged edge', () => {
    expect(resizeBBox(box, 'e', { x: 50, y: 999 })).toEqual({ type: 'bbox', x: 10, y: 10, width: 40, height: 20 })
  })

  it('moves a corner', () => {
    expect(resizeBBox(box, 'nw', { x: 0, y: 5 })).toEqual({ type: 'bbox', x: 0, y: 5, width: 30, height: 25 })
  })

  it('flips instead of going negative', () => {
    expect(resizeBBox(box, 'w', { x: 40, y: 0 })).toEqual({ type: 'bbox', x: 30, y: 10, width: 10, height: 20 })
  })
})

describe('moving shapes', () => {
  it('translates polygons', () => {
    const moved = translateGeometry({ type: 'polygon', points: [[1, 1], [2, 2], [3, 1]] }, 5, -1)
    expect(moved).toEqual({ type: 'polygon', points: [[6, 0], [7, 1], [8, 0]] })
  })

  it('stops a box at the image edge', () => {
    const box: BBoxGeometry = { type: 'bbox', x: 90, y: 10, width: 20, height: 20 }
    expect(clampTranslation(box, 50, -50, 120, 100)).toEqual({ x: 10, y: -10 })
  })
})

describe('rectIoU', () => {
  it('is 1 for identical boxes and 0 for disjoint ones', () => {
    const r = { x: 0, y: 0, width: 10, height: 10 }
    expect(rectIoU(r, r)).toBe(1)
    expect(rectIoU(r, { x: 20, y: 0, width: 5, height: 5 })).toBe(0)
  })

  it('handles partial overlap', () => {
    // overlap 5x10 = 50, union 100 + 100 - 50 = 150
    expect(rectIoU({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 0, width: 10, height: 10 })).toBe(50 / 150)
  })
})

describe('simplifyPolygon', () => {
  it('drops collinear points and keeps corners', () => {
    const pts: [number, number][] = [
      [0, 0],
      [5, 0],
      [10, 0],
      [10, 5],
      [10, 10],
      [5, 10],
      [0, 10],
    ]
    expect(simplifyPolygon(pts, 0.5)).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ])
  })
})
