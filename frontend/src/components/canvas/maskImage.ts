import { decodeRle, type Rle } from '../../lib/rle'

const cache = new WeakMap<Rle, Map<string, string>>()

/** Render a mask to a tinted, semi-transparent PNG data URL (cached per mask + color). */
export function maskDataUrl(rle: Rle, color: string, alpha = 0.45): string {
  let byColor = cache.get(rle)
  if (!byColor) {
    byColor = new Map()
    cache.set(rle, byColor)
  }
  const key = `${color}/${alpha}`
  const hit = byColor.get(key)
  if (hit) return hit

  const [h, w] = rle.size
  const bits = decodeRle(rle)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(w, h)
  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)
  const a = Math.round(alpha * 255)
  for (let i = 0; i < bits.length; i++) {
    if (!bits[i]) continue
    img.data[i * 4] = r
    img.data[i * 4 + 1] = g
    img.data[i * 4 + 2] = b
    img.data[i * 4 + 3] = a
  }
  ctx.putImageData(img, 0, 0)
  const url = canvas.toDataURL()
  byColor.set(key, url)
  return url
}
