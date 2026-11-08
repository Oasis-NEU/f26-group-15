/**
 * Uncompressed COCO run-length encoding.
 *
 * Masks are flattened in column-major order (down each column, then the next
 * column) to match pycocotools. Counts alternate 0-runs and 1-runs and always
 * start with a 0-run (which may be 0 long).
 *
 * In memory the frontend uses a row-major Uint8Array (index = y * width + x),
 * which is what canvas ImageData expects.
 */

export interface Rle {
  size: [number, number] // [height, width]
  counts: number[]
}

const cache = new WeakMap<Rle, Uint8Array>()

/** Decode to a row-major 0/1 array. Cached per RLE object, so treat RLEs as immutable. */
export function decodeRle(rle: Rle): Uint8Array {
  const hit = cache.get(rle)
  if (hit) return hit
  const [h, w] = rle.size
  const out = new Uint8Array(h * w)
  let pos = 0 // column-major position
  let value = 0
  for (const run of rle.counts) {
    if (value === 1) {
      for (let k = 0; k < run; k++) {
        const p = pos + k
        const x = Math.floor(p / h)
        const y = p % h
        out[y * w + x] = 1
      }
    }
    pos += run
    value = 1 - value
  }
  cache.set(rle, out)
  return out
}

/** Encode a row-major 0/1 array of the given size. */
export function encodeRle(bits: Uint8Array, height: number, width: number): Rle {
  const counts: number[] = []
  let current = 0
  let run = 0
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const v = bits[y * width + x] ? 1 : 0
      if (v === current) {
        run++
      } else {
        counts.push(run)
        run = 1
        current = v
      }
    }
  }
  counts.push(run)
  return { size: [height, width], counts }
}
