/**
 * Shared annotation schema for LabelAI.
 *
 * This file is the frontend's copy of the team contract in docs/schema.md.
 * Backend (Pydantic models) and ML (output converter) must produce exactly
 * these shapes. Change it only through a PR all three members review.
 *
 * Coordinate rule: every coordinate is in ORIGINAL IMAGE PIXELS,
 * origin at the top-left corner, x to the right, y down.
 * Screen coordinates never leave the canvas code.
 */

export type Id = string

/** Axis-aligned box. (x, y) is the top-left corner. */
export interface BBoxGeometry {
  type: 'bbox'
  x: number
  y: number
  width: number
  height: number
}

/** Closed polygon. The last point connects back to the first; do not repeat it. */
export interface PolygonGeometry {
  type: 'polygon'
  points: [number, number][]
}

/**
 * Binary mask stored as uncompressed COCO RLE.
 * size is [height, width]; counts alternate background/foreground run
 * lengths, starting with background, in column-major (Fortran) order,
 * which is what pycocotools produces.
 */
export interface MaskGeometry {
  type: 'mask'
  rle: { size: [number, number]; counts: number[] }
}

export type Geometry = BBoxGeometry | PolygonGeometry | MaskGeometry
export type GeometryType = Geometry['type']

/** Who created the annotation. AI annotations render dashed until accepted. */
export type AnnotationSource = 'human' | 'ai'

/**
 * pending  = AI suggestion the user has not reviewed yet
 * accepted = part of the dataset (all human annotations are accepted)
 */
export type AnnotationStatus = 'pending' | 'accepted'

export interface Annotation {
  id: Id
  image_id: Id
  class_id: Id
  geometry: Geometry
  source: AnnotationSource
  /** Model confidence 0–1 for AI annotations, null for human ones. */
  confidence: number | null
  status: AnnotationStatus
  created_at: string
  updated_at: string
}

export interface LabelClass {
  id: Id
  project_id: Id
  name: string
  /** Hex color, e.g. "#4FC3F7". */
  color: string
}

export interface Project {
  id: Id
  name: string
  description: string
  created_at: string
}

export interface Dataset {
  id: Id
  project_id: Id
  name: string
  created_at: string
}

export type ImageStatus = 'unlabeled' | 'in_progress' | 'reviewed'

export interface ImageRecord {
  id: Id
  dataset_id: Id
  file_name: string
  width: number
  height: number
  /** URL the browser can load directly (signed URL from storage in production). */
  url: string
  status: ImageStatus
  annotation_count: number
  created_at: string
}

/** Input for POST /images/{id}/predict. */
export interface PredictRequest {
  /** Free-text concept, e.g. "nucleus". */
  prompt?: string
  /** Example boxes drawn by the user ("find more like this"). */
  exemplars?: BBoxGeometry[]
  /** Class assigned to the returned suggestions. */
  class_id: Id
}

export type ExportFormat = 'coco' | 'yolo' | 'json'
