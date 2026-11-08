/**
 * Dataset export formats. The mock API uses these directly; once the backend
 * owns export (Week 6), these double as the reference for what it should emit.
 *
 * Only accepted annotations are exported; pending AI suggestions are skipped.
 */
import type { Annotation, ImageRecord, LabelClass } from '../types/annotation'
import { geometryArea, geometryBounds } from './geometry'

export interface ExportInput {
  images: ImageRecord[]
  classes: LabelClass[]
  annotations: Annotation[]
}

const accepted = (a: Annotation) => a.status === 'accepted'

const round = (n: number, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits

/** COCO detection/segmentation JSON. Category ids are 1-based, in class order. */
export function toCoco({ images, classes, annotations }: ExportInput) {
  const catId = new Map(classes.map((c, i) => [c.id, i + 1]))
  const imgId = new Map(images.map((im, i) => [im.id, i + 1]))
  const cocoAnns = annotations
    .filter(accepted)
    .filter((a) => imgId.has(a.image_id) && catId.has(a.class_id))
    .map((a, i) => {
      const b = geometryBounds(a.geometry)
      const g = a.geometry
      const segmentation =
        g.type === 'polygon'
          ? [g.points.flat().map((v) => round(v))]
          : g.type === 'mask'
            ? { size: g.rle.size, counts: g.rle.counts }
            : []
      return {
        id: i + 1,
        image_id: imgId.get(a.image_id)!,
        category_id: catId.get(a.class_id)!,
        bbox: [round(b.x), round(b.y), round(b.width), round(b.height)],
        area: round(geometryArea(g)),
        segmentation,
        iscrowd: g.type === 'mask' ? 1 : 0,
        ...(a.source === 'ai' ? { score: a.confidence } : {}),
      }
    })
  return {
    info: { description: 'Exported from LabelAI', date_created: new Date().toISOString() },
    images: images.map((im, i) => ({ id: i + 1, file_name: im.file_name, width: im.width, height: im.height })),
    categories: classes.map((c, i) => ({ id: i + 1, name: c.name, supercategory: 'none' })),
    annotations: cocoAnns,
  }
}

/**
 * YOLO text labels, one file per image. Boxes become
 * "class cx cy w h"; polygons become YOLO-seg "class x1 y1 x2 y2 ...".
 * All values normalized to 0–1. Class index is 0-based, in class order.
 */
export function toYolo({ images, classes, annotations }: ExportInput): Record<string, string> {
  const clsIdx = new Map(classes.map((c, i) => [c.id, i]))
  const files: Record<string, string> = {}
  files['classes.txt'] = classes.map((c) => c.name).join('\n') + '\n'
  for (const im of images) {
    const lines: string[] = []
    for (const a of annotations) {
      if (a.image_id !== im.id || !accepted(a) || !clsIdx.has(a.class_id)) continue
      const c = clsIdx.get(a.class_id)!
      const g = a.geometry
      const nx = (v: number) => (v / im.width).toFixed(6)
      const ny = (v: number) => (v / im.height).toFixed(6)
      if (g.type === 'polygon') {
        lines.push([c, ...g.points.flatMap(([x, y]) => [nx(x), ny(y)])].join(' '))
      } else {
        const b = geometryBounds(g)
        lines.push([c, nx(b.x + b.width / 2), ny(b.y + b.height / 2), nx(b.width), ny(b.height)].join(' '))
      }
    }
    const stem = im.file_name.replace(/\.[^.]+$/, '')
    files[`labels/${stem}.txt`] = lines.join('\n') + (lines.length ? '\n' : '')
  }
  return files
}

/** LabelAI native JSON: the schema as-is, grouped by image. */
export function toNativeJson({ images, classes, annotations }: ExportInput) {
  return {
    format: 'labelai/v1',
    classes,
    images: images.map((im) => ({
      ...im,
      annotations: annotations.filter((a) => a.image_id === im.id && accepted(a)),
    })),
  }
}

/** Bundle YOLO files into one text blob a human can read, since zipping needs a dependency. */
export function yoloToText(files: Record<string, string>): string {
  return Object.entries(files)
    .map(([name, body]) => `### ${name}\n${body}`)
    .join('\n')
}
