import { describe, expect, it } from 'vitest'
import { detectObjects, otsuThreshold, type GrayImage } from './mockVision'
import { polygonArea, polygonBounds } from './geometry'

function syntheticImage(): GrayImage {
  const width = 120
  const height = 80
  const data = new Uint8Array(width * height).fill(20)
  const disc = (cx: number, cy: number, r: number) => {
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) data[y * width + x] = 220
  }
  disc(30, 40, 22)
  disc(85, 30, 9)
  return { data, width, height }
}

describe('mock detector', () => {
  it('finds a threshold between background and foreground', () => {
    const t = otsuThreshold(syntheticImage().data)
    expect(t).toBeGreaterThanOrEqual(20)
    expect(t).toBeLessThan(220)
  })

  it('outlines each bright blob with a polygon', () => {
    const found = detectObjects(syntheticImage())
    expect(found).toHaveLength(2)
    const big = found.find((d) => polygonBounds(d.geometry.points).x < 60)!
    const b = polygonBounds(big.geometry.points)
    expect(Math.abs(b.x + b.width / 2 - 30.5)).toBeLessThan(1.5)
    expect(Math.abs(b.width - 44)).toBeLessThan(3)
    // traced outline should be close to the disc's area (pi * 22^2 ≈ 1521)
    expect(Math.abs(polygonArea(big.geometry.points) - 1521)).toBeLessThan(150)
  })

  it('finds dark objects on a light background', () => {
    const img = syntheticImage()
    for (let i = 0; i < img.data.length; i++) img.data[i] = 255 - img.data[i]
    expect(detectObjects(img)).toHaveLength(2)
  })

  it('keeps only objects similar in size to the exemplar', () => {
    const found = detectObjects(syntheticImage(), [{ type: 'bbox', x: 76, y: 21, width: 18, height: 18 }])
    expect(found).toHaveLength(1)
  })
})
