import { describe, expect, it } from 'vitest'
import { clampToImage, fitView, MAX_SCALE, toImage, toScreen, zoomAt, type View } from './coords'

const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-9)

describe('toImage / toScreen', () => {
  const views: View[] = [
    { scale: 1, panX: 0, panY: 0 },
    { scale: 2.5, panX: 40, panY: -12 },
    { scale: 0.3, panX: -200, panY: 75 },
  ]

  it('are inverses at any zoom and pan', () => {
    for (const v of views) {
      for (const p of [{ x: 0, y: 0 }, { x: 123.4, y: 56.7 }, { x: -10, y: 900 }]) {
        const back = toImage(toScreen(p, v), v)
        close(back.x, p.x)
        close(back.y, p.y)
      }
    }
  })

  it('maps the image origin to the pan offset', () => {
    expect(toScreen({ x: 0, y: 0 }, { scale: 3, panX: 15, panY: 25 })).toEqual({ x: 15, y: 25 })
  })

  it('divides by scale when going to image space', () => {
    expect(toImage({ x: 110, y: 70 }, { scale: 2, panX: 10, panY: 10 })).toEqual({ x: 50, y: 30 })
  })
})

describe('zoomAt', () => {
  it('keeps the image point under the cursor fixed', () => {
    const v: View = { scale: 1.2, panX: 30, panY: 40 }
    const cursor = { x: 300, y: 220 }
    const before = toImage(cursor, v)
    const z = zoomAt(v, 1.7, cursor)
    const after = toImage(cursor, z)
    close(after.x, before.x)
    close(after.y, before.y)
    close(z.scale, 1.2 * 1.7)
  })

  it('clamps to the max scale and still keeps the anchor fixed', () => {
    const v: View = { scale: MAX_SCALE - 1, panX: 0, panY: 0 }
    const cursor = { x: 50, y: 50 }
    const z = zoomAt(v, 10, cursor)
    expect(z.scale).toBe(MAX_SCALE)
    const a = toImage(cursor, v)
    const b = toImage(cursor, z)
    close(a.x, b.x)
    close(a.y, b.y)
  })
})

describe('fitView', () => {
  it('fits a wide image by width and centers it vertically', () => {
    const v = fitView(1000, 500, 548, 600, 24)
    close(v.scale, 0.5)
    close(v.panX, 24)
    close(v.panY, (600 - 250) / 2)
  })

  it('fits a tall image by height', () => {
    const v = fitView(400, 800, 1000, 448, 24)
    close(v.scale, 0.5)
    close(v.panY, 24)
  })
})

describe('clampToImage', () => {
  it('pulls points back inside the image', () => {
    expect(clampToImage({ x: -5, y: 900 }, 768, 576)).toEqual({ x: 0, y: 576 })
  })
})
