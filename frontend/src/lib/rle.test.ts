import { describe, expect, it } from 'vitest'
import { decodeRle, encodeRle } from './rle'

describe('COCO RLE', () => {
  it('round-trips a mask', () => {
    const h = 4
    const w = 5
    const bits = new Uint8Array(h * w)
    // a 2x3 block at x=1..3, y=1..2
    for (let y = 1; y <= 2; y++) for (let x = 1; x <= 3; x++) bits[y * w + x] = 1
    const rle = encodeRle(bits, h, w)
    expect(Array.from(decodeRle(rle))).toEqual(Array.from(bits))
  })

  it('uses column-major order like pycocotools', () => {
    // 2x2 mask with only the top-right pixel set: column 0 = [0,0], column 1 = [1,0]
    const bits = new Uint8Array([0, 1, 0, 0])
    expect(encodeRle(bits, 2, 2)).toEqual({ size: [2, 2], counts: [2, 1, 1] })
  })

  it('starts with a zero-length run when the first pixel is set', () => {
    expect(encodeRle(new Uint8Array([1, 1, 1, 1]), 2, 2).counts).toEqual([0, 4])
  })
})
