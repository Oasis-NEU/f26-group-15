/**
 * Stand-in for the ML service while /predict does not exist yet.
 *
 * Classical image processing, not a neural network: grayscale -> Otsu
 * threshold -> connected components -> boundary trace -> simplified polygon.
 * Works well on high-contrast images like fluorescence nuclei, which is
 * enough to build and demo the review UI. Delete once ML is wired up.
 */
import type { BBoxGeometry, PolygonGeometry } from '../types/annotation'
import { simplifyPolygon } from './geometry'

export interface Detection {
  geometry: PolygonGeometry
  confidence: number
}

export interface GrayImage {
  data: Uint8Array // row-major luminance 0–255
  width: number
  height: number
}

export function otsuThreshold(data: Uint8Array): number {
  const hist = new Array<number>(256).fill(0)
  for (const v of data) hist[v]++
  const total = data.length
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]
  let sumB = 0
  let wB = 0
  let best = 0
  let threshold = 127
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) ** 2
    if (between > best) {
      best = between
      threshold = t
    }
  }
  return threshold
}

const DX = [1, 1, 0, -1, -1, -1, 0, 1]
const DY = [0, 1, 1, 1, 0, -1, -1, -1]

/** Moore-neighbor boundary trace starting at the top-left pixel of a component. */
export function traceBoundary(
  labels: Int32Array,
  label: number,
  width: number,
  height: number,
  startX: number,
  startY: number,
  maxSteps: number,
): [number, number][] {
  const inside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && labels[y * width + x] === label
  const points: [number, number][] = [[startX, startY]]
  let cx = startX
  let cy = startY
  let back = 4 // we entered the start pixel from the west
  for (let step = 0; step < maxSteps; step++) {
    let moved = false
    for (let k = 1; k <= 8; k++) {
      const d = (back + k) % 8
      const nx = cx + DX[d]
      const ny = cy + DY[d]
      if (inside(nx, ny)) {
        const p = (back + k - 1) % 8
        const px = cx + DX[p]
        const py = cy + DY[p]
        cx = nx
        cy = ny
        // new backtrack direction: from the new pixel toward the last background pixel checked
        for (let j = 0; j < 8; j++) {
          if (cx + DX[j] === px && cy + DY[j] === py) {
            back = j
            break
          }
        }
        moved = true
        break
      }
    }
    if (!moved || (cx === startX && cy === startY)) break
    points.push([cx, cy])
  }
  return points
}

interface Component {
  label: number
  area: number
  minX: number
  minY: number
  maxX: number
  maxY: number
  startX: number
  startY: number
  meanIntensity: number
}

export function detectObjects(img: GrayImage, exemplars: BBoxGeometry[] = []): Detection[] {
  const { data, width, height } = img
  const total = width * height
  let t = otsuThreshold(data)
  let fgCount = 0
  for (const v of data) if (v > t) fgCount++
  // Objects are usually the minority; if "bright" covers most of the image, objects are dark.
  const invert = fgCount > total / 2
  // Otsu's class 0 is "<= t". Inverted, objects are values <= t, i.e. (255 - v) >= 255 - t,
  // so the strict "> t" test below needs 254 - t.
  if (invert) t = 254 - t
  const fg = (i: number) => (invert ? 255 - data[i] : data[i]) > t

  const labels = new Int32Array(total)
  const components: Component[] = []
  const stack: number[] = []
  let next = 1
  for (let i = 0; i < total; i++) {
    if (labels[i] !== 0 || !fg(i)) continue
    const label = next++
    const c: Component = {
      label,
      area: 0,
      minX: width,
      minY: height,
      maxX: 0,
      maxY: 0,
      startX: i % width,
      startY: Math.floor(i / width),
      meanIntensity: 0,
    }
    labels[i] = label
    stack.push(i)
    let intensity = 0
    while (stack.length) {
      const p = stack.pop()!
      const x = p % width
      const y = (p - x) / width
      c.area++
      intensity += invert ? 255 - data[p] : data[p]
      if (x < c.minX) c.minX = x
      if (x > c.maxX) c.maxX = x
      if (y < c.minY) c.minY = y
      if (y > c.maxY) c.maxY = y
      const neighbors = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1]
      for (const q of neighbors) {
        if (q >= 0 && labels[q] === 0 && fg(q)) {
          labels[q] = label
          stack.push(q)
        }
      }
    }
    c.meanIntensity = intensity / c.area
    components.push(c)
  }

  let minArea = total * 0.0002
  let maxArea = total * 0.25
  if (exemplars.length) {
    const areas = exemplars.map((e) => e.width * e.height * 0.78) // ellipse inside its box
    const mean = areas.reduce((a, b) => a + b, 0) / areas.length
    minArea = Math.max(minArea * 0.5, mean * 0.35)
    maxArea = mean * 2.8
  }

  const detections: Detection[] = []
  for (const c of components) {
    if (c.area < minArea || c.area > maxArea) continue
    const boxArea = (c.maxX - c.minX + 1) * (c.maxY - c.minY + 1)
    const fill = c.area / boxArea // compact blobs score higher
    const contrast = Math.min(1, (c.meanIntensity - t) / 120)
    const confidence = Math.max(0.3, Math.min(0.99, 0.35 + 0.35 * fill + 0.3 * contrast))
    const raw = traceBoundary(labels, c.label, width, height, c.startX, c.startY, c.area * 4 + 64)
    if (raw.length < 3) continue
    const outline = simplifyPolygon(
      raw.map(([x, y]) => [x + 0.5, y + 0.5] as [number, number]),
      0.9,
    )
    if (outline.length < 3) continue
    detections.push({ geometry: { type: 'polygon', points: outline }, confidence: Math.round(confidence * 100) / 100 })
  }
  return detections
}

/** Browser helper: load an image URL into a (possibly downscaled) grayscale buffer. */
export async function loadGray(url: string, maxSide = 900): Promise<{ img: GrayImage; scale: number }> {
  const el = new Image()
  el.crossOrigin = 'anonymous'
  el.src = url
  await el.decode()
  const scale = Math.min(1, maxSide / Math.max(el.naturalWidth, el.naturalHeight))
  const w = Math.max(1, Math.round(el.naturalWidth * scale))
  const h = Math.max(1, Math.round(el.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(el, 0, 0, w, h)
  const rgba = ctx.getImageData(0, 0, w, h).data
  const data = new Uint8Array(w * h)
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.round(0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2])
  }
  return { img: { data, width: w, height: h }, scale }
}
