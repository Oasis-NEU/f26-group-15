/**
 * Screen <-> image coordinate math.
 *
 * The canvas draws the image at `scale`, offset by (panX, panY) from the
 * top-left of the canvas element. Screen points are relative to that element
 * (use event.clientX - rect.left), not to the page.
 */

export interface Point {
  x: number
  y: number
}

export interface View {
  scale: number
  panX: number
  panY: number
}

export const MIN_SCALE = 0.05
export const MAX_SCALE = 40

export function toImage(screen: Point, view: View): Point {
  return {
    x: (screen.x - view.panX) / view.scale,
    y: (screen.y - view.panY) / view.scale,
  }
}

export function toScreen(image: Point, view: View): Point {
  return {
    x: image.x * view.scale + view.panX,
    y: image.y * view.scale + view.panY,
  }
}

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

/**
 * Zoom by `factor`, keeping the image point under `anchor` (screen) fixed.
 * This is what makes wheel zoom feel natural.
 */
export function zoomAt(view: View, factor: number, anchor: Point): View {
  const scale = clampScale(view.scale * factor)
  const real = scale / view.scale
  return {
    scale,
    panX: anchor.x - (anchor.x - view.panX) * real,
    panY: anchor.y - (anchor.y - view.panY) * real,
  }
}

/** Scale and center the image inside the container with some padding. */
export function fitView(
  imageWidth: number,
  imageHeight: number,
  containerWidth: number,
  containerHeight: number,
  padding = 24,
): View {
  const availW = Math.max(1, containerWidth - padding * 2)
  const availH = Math.max(1, containerHeight - padding * 2)
  const scale = clampScale(Math.min(availW / imageWidth, availH / imageHeight))
  return {
    scale,
    panX: (containerWidth - imageWidth * scale) / 2,
    panY: (containerHeight - imageHeight * scale) / 2,
  }
}

/** Keep an image point inside the image bounds. */
export function clampToImage(p: Point, width: number, height: number): Point {
  return {
    x: Math.min(width, Math.max(0, p.x)),
    y: Math.min(height, Math.max(0, p.y)),
  }
}
