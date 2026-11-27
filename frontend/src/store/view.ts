/** Zoom/pan state, shared by the canvas and the zoom controls in the status bar. */
import { fitView, zoomAt, type Point, type View } from '../lib/coords'
import { createStore } from './createStore'

interface ViewState {
  view: View
  container: { width: number; height: number }
  image: { width: number; height: number } | null
  /** Image-space position under the mouse, null when outside the image. */
  cursor: Point | null
  /** Display adjustments (CSS filters on the image only, never saved). */
  brightness: number
  contrast: number
}

export const viewStore = createStore<ViewState>({
  view: { scale: 1, panX: 0, panY: 0 },
  container: { width: 0, height: 0 },
  image: null,
  cursor: null,
  brightness: 1,
  contrast: 1,
})

export const viewActions = {
  set(view: View) {
    viewStore.setState({ view })
  },
  fit() {
    const { image, container } = viewStore.getState()
    if (!image || container.width === 0) return
    viewStore.setState({ view: fitView(image.width, image.height, container.width, container.height) })
  },
  /** Zoom around the center of the canvas (for buttons and keyboard). */
  zoomBy(factor: number) {
    const { view, container } = viewStore.getState()
    viewStore.setState({ view: zoomAt(view, factor, { x: container.width / 2, y: container.height / 2 }) })
  },
  /** 100% = one image pixel per screen pixel, centered on the current view center. */
  actualSize() {
    const { view } = viewStore.getState()
    viewActions.zoomBy(1 / view.scale)
  },
}
