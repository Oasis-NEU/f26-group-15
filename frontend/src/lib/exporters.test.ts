import { describe, expect, it } from 'vitest'
import type { Annotation, ImageRecord, LabelClass } from '../types/annotation'
import { toCoco, toYolo } from './exporters'

const image: ImageRecord = {
  id: 'img1',
  dataset_id: 'd1',
  file_name: 'cells.png',
  width: 200,
  height: 100,
  url: '',
  status: 'in_progress',
  annotation_count: 0,
  created_at: '',
}
const classes: LabelClass[] = [
  { id: 'c-a', project_id: 'p', name: 'Nucleus', color: '#fff' },
  { id: 'c-b', project_id: 'p', name: 'Vessel', color: '#000' },
]
const base = { image_id: 'img1', source: 'human' as const, confidence: null, created_at: '', updated_at: '' }
const annotations: Annotation[] = [
  { ...base, id: '1', class_id: 'c-b', status: 'accepted', geometry: { type: 'bbox', x: 50, y: 25, width: 100, height: 50 } },
  { ...base, id: '2', class_id: 'c-a', status: 'accepted', geometry: { type: 'polygon', points: [[0, 0], [20, 0], [20, 10]] } },
  { ...base, id: '3', class_id: 'c-a', status: 'pending', source: 'ai', confidence: 0.4, geometry: { type: 'bbox', x: 0, y: 0, width: 1, height: 1 } },
]

describe('toYolo', () => {
  const files = toYolo({ images: [image], classes, annotations })

  it('writes normalized center boxes with 0-based class ids', () => {
    const lines = files['labels/cells.txt'].trim().split('\n')
    expect(lines[0]).toBe('1 0.500000 0.500000 0.500000 0.500000')
  })

  it('writes polygons in YOLO-seg format', () => {
    const lines = files['labels/cells.txt'].trim().split('\n')
    expect(lines[1]).toBe('0 0.000000 0.000000 0.100000 0.000000 0.100000 0.100000')
  })

  it('skips pending AI suggestions', () => {
    expect(files['labels/cells.txt'].trim().split('\n')).toHaveLength(2)
  })

  it('lists class names in order', () => {
    expect(files['classes.txt']).toBe('Nucleus\nVessel\n')
  })
})

describe('toCoco', () => {
  const coco = toCoco({ images: [image], classes, annotations })

  it('uses 1-based category ids and xywh boxes', () => {
    expect(coco.categories.map((c) => c.id)).toEqual([1, 2])
    expect(coco.annotations[0]).toMatchObject({ category_id: 2, bbox: [50, 25, 100, 50], area: 5000 })
  })

  it('flattens polygon segmentation', () => {
    expect(coco.annotations[1].segmentation).toEqual([[0, 0, 20, 0, 20, 10]])
    expect(coco.annotations[1].area).toBe(100)
  })
})
