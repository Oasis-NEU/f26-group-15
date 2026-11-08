import type { BBoxGeometry, Geometry, PolygonGeometry } from '../types/annotation'
import type { Point } from './coords'
import { decodeRle } from './rle'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Box spanned by two corner points, in any drag direction. */
export function rectFromPoints(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  }
}

export function polygonBounds(points: [number, number][]): Rect {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of points) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function maskBounds(geometry: Extract<Geometry, { type: 'mask' }>): Rect {
  const [h, w] = geometry.rle.size
  const bits = decodeRle(geometry.rle)
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (bits[y * w + x]) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, width: 0, height: 0 }
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

export function geometryBounds(g: Geometry): Rect {
  switch (g.type) {
    case 'bbox':
      return { x: g.x, y: g.y, width: g.width, height: g.height }
    case 'polygon':
      return polygonBounds(g.points)
    case 'mask':
      return maskBounds(g)
  }
}

/** Shoelace formula. Always positive. */
export function polygonArea(points: [number, number][]): number {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % points.length]
    sum += x1 * y2 - x2 * y1
  }
  return Math.abs(sum) / 2
}

export function geometryArea(g: Geometry): number {
  switch (g.type) {
    case 'bbox':
      return g.width * g.height
    case 'polygon':
      return polygonArea(g.points)
    case 'mask': {
      let total = 0
      g.rle.counts.forEach((c, i) => {
        if (i % 2 === 1) total += c
      })
      return total
    }
  }
}

/** Ray-casting point-in-polygon test. */
export function pointInPolygon(p: Point, points: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]
    const [xj, yj] = points[j]
    const crosses = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi
    if (crosses) inside = !inside
  }
  return inside
}

export function pointInRect(p: Point, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height
}

/** Distance from point p to segment a-b. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Hit test in image space. `tolerance` is in image pixels (pass screenTol / scale). */
export function hitTest(g: Geometry, p: Point, tolerance: number): boolean {
  switch (g.type) {
    case 'bbox': {
      const r = { x: g.x - tolerance, y: g.y - tolerance, width: g.width + 2 * tolerance, height: g.height + 2 * tolerance }
      return pointInRect(p, r)
    }
    case 'polygon': {
      if (pointInPolygon(p, g.points)) return true
      for (let i = 0; i < g.points.length; i++) {
        const [ax, ay] = g.points[i]
        const [bx, by] = g.points[(i + 1) % g.points.length]
        if (distanceToSegment(p, { x: ax, y: ay }, { x: bx, y: by }) <= tolerance) return true
      }
      return false
    }
    case 'mask': {
      const [h, w] = g.rle.size
      const x = Math.floor(p.x)
      const y = Math.floor(p.y)
      if (x < 0 || y < 0 || x >= w || y >= h) return false
      return decodeRle(g.rle)[y * w + x] === 1
    }
  }
}

export function translateGeometry(g: Geometry, dx: number, dy: number): Geometry {
  switch (g.type) {
    case 'bbox':
      return { ...g, x: g.x + dx, y: g.y + dy }
    case 'polygon':
      return { ...g, points: g.points.map(([x, y]) => [x + dx, y + dy] as [number, number]) }
    case 'mask':
      return g // masks are edited with brush tools, not dragged
  }
}

/** Keep a moved shape fully inside the image by shifting it back. */
export function clampTranslation(g: Geometry, dx: number, dy: number, imgW: number, imgH: number): Point {
  const b = geometryBounds(g)
  const nx = Math.min(imgW - b.width, Math.max(0, b.x + dx))
  const ny = Math.min(imgH - b.height, Math.max(0, b.y + dy))
  return { x: nx - b.x, y: ny - b.y }
}

/** Box resize handles: n, s, e, w and the four corners. */
export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

export function handlePosition(b: BBoxGeometry, h: Handle): Point {
  const cx = b.x + b.width / 2
  const cy = b.y + b.height / 2
  const x = h.includes('w') ? b.x : h.includes('e') ? b.x + b.width : cx
  const y = h.includes('n') ? b.y : h.includes('s') ? b.y + b.height : cy
  return { x, y }
}

/**
 * Move one handle of `start` to point `p`. Dragging past the opposite edge
 * flips the box instead of producing a negative size.
 */
export function resizeBBox(start: BBoxGeometry, h: Handle, p: Point): BBoxGeometry {
  let x1 = start.x
  let y1 = start.y
  let x2 = start.x + start.width
  let y2 = start.y + start.height
  if (h.includes('w')) x1 = p.x
  if (h.includes('e')) x2 = p.x
  if (h.includes('n')) y1 = p.y
  if (h.includes('s')) y2 = p.y
  const r = rectFromPoints({ x: x1, y: y1 }, { x: x2, y: y2 })
  return { type: 'bbox', ...r }
}

/** Ramer–Douglas–Peucker simplification for traced outlines. */
export function simplifyPolygon(points: [number, number][], epsilon: number): [number, number][] {
  if (points.length < 4) return points
  const keep = new Array<boolean>(points.length).fill(false)
  keep[0] = true
  keep[points.length - 1] = true
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length) {
    const [start, end] = stack.pop()!
    const a = { x: points[start][0], y: points[start][1] }
    const b = { x: points[end][0], y: points[end][1] }
    let maxD = -1
    let idx = -1
    for (let i = start + 1; i < end; i++) {
      const d = distanceToSegment({ x: points[i][0], y: points[i][1] }, a, b)
      if (d > maxD) {
        maxD = d
        idx = i
      }
    }
    if (idx >= 0 && maxD > epsilon) {
      keep[idx] = true
      stack.push([start, idx], [idx, end])
    }
  }
  return points.filter((_, i) => keep[i])
}

/** Intersection over union of two rectangles (0 when they do not overlap). */
export function rectIoU(a: Rect, b: Rect): number {
  const ix = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  const iy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  const inter = ix * iy
  const union = a.width * a.height + b.width * b.height - inter
  return union > 0 ? inter / union : 0
}

export function isPolygon(g: Geometry): g is PolygonGeometry {
  return g.type === 'polygon'
}

export function isBBox(g: Geometry): g is BBoxGeometry {
  return g.type === 'bbox'
}
