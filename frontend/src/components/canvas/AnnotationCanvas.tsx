/**
 * The annotation canvas.
 *
 * Layers, bottom to top, all sharing one transform from the view store:
 *   1. <img>  the medical image, positioned with a CSS transform
 *   2. <svg>  masks and shape bodies inside a <g> with the view transform
 *             (so their geometry is written in image pixels)
 *   3. <svg>  screen-space overlay in the same element: handles, labels, drafts
 *
 * Every pointer position is converted with toImage() at the edge, and every
 * annotation stores image pixels. See lib/coords.ts.
 */
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import type { Annotation, BBoxGeometry, Geometry, ImageRecord, LabelClass, PolygonGeometry } from '../../types/annotation'
import { clampToImage, toImage, toScreen, zoomAt, type Point, type View } from '../../lib/coords'
import {
  clampTranslation,
  distanceToSegment,
  geometryArea,
  geometryBounds,
  HANDLES,
  handlePosition,
  hitTest,
  rectFromPoints,
  resizeBBox,
  translateGeometry,
  type Handle,
} from '../../lib/geometry'
import { useStore } from '../../store/createStore'
import { labeling, labelingStore } from '../../store/labeling'
import { viewActions, viewStore } from '../../store/view'
import { maskDataUrl } from './maskImage'

const HANDLE_RADIUS = 7 // screen px
const CLOSE_RADIUS = 9 // screen px, click near the first vertex to close a polygon
const MIN_BOX = 4 // screen px

type Drag =
  | { kind: 'pan'; start: Point; startView: View }
  | { kind: 'box'; start: Point }
  | { kind: 'move'; id: string; start: Point; startGeom: Geometry }
  | { kind: 'resize'; id: string; handle: Handle; startGeom: BBoxGeometry }
  | { kind: 'vertex'; id: string; index: number; startGeom: PolygonGeometry }

type Draft = { kind: 'box'; a: Point; b: Point } | { kind: 'polygon'; points: Point[]; hover: Point | null }

const HANDLE_CURSOR: Record<Handle, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
}

export interface AnnotationCanvasProps {
  image: ImageRecord
  classes: LabelClass[]
  /** Called with a user-drawn example box when the "find similar" tool is active. */
  onExemplar: (box: BBoxGeometry) => void
  /** Called when the user tries to draw without choosing a class. */
  onNeedClass: () => void
}

export function AnnotationCanvas({ image, classes, onExemplar, onNeedClass }: AnnotationCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragRef = useRef<Drag | null>(null)

  const annotations = useStore(labelingStore, (s) => s.annotations)
  const selectedId = useStore(labelingStore, (s) => s.selectedId)
  const tool = useStore(labelingStore, (s) => s.tool)
  const activeClassId = useStore(labelingStore, (s) => s.activeClassId)
  const hiddenClassIds = useStore(labelingStore, (s) => s.hiddenClassIds)
  const view = useStore(viewStore, (s) => s.view)
  const container = useStore(viewStore, (s) => s.container)
  const brightness = useStore(viewStore, (s) => s.brightness)
  const contrast = useStore(viewStore, (s) => s.contrast)

  const [draft, setDraft] = useState<Draft | null>(null)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [dragKind, setDragKind] = useState<Drag['kind'] | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [hoverCursor, setHoverCursor] = useState<string | null>(null)
  // Natural size of the loaded file, tagged with the image it belongs to. Deriving
  // "loaded" from the id avoids a race where a cached image fires onLoad before
  // a reset effect would run.
  const [natural, setNatural] = useState<{ id: string; width: number; height: number } | null>(null)
  const loaded = natural?.id === image.id
  const dims = loaded ? { width: natural.width, height: natural.height } : { width: image.width, height: image.height }
  const imgRef = useRef<HTMLImageElement | null>(null)

  const classById = new Map(classes.map((c) => [c.id, c]))
  const visible = annotations.filter((a) => !hiddenClassIds.includes(a.class_id))
  const selected = annotations.find((a) => a.id === selectedId) ?? null

  // ---- sizing and fitting ---------------------------------------------------

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      viewStore.setState({ container: { width, height } })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // New image: drop any half-finished drawing.
  useEffect(() => {
    setDraft(null)
    dragRef.current = null
  }, [image.id])

  // Safety net for images that finished loading before React attached onLoad.
  useLayoutEffect(() => {
    const el = imgRef.current
    if (el?.complete && el.naturalWidth > 0) setNatural({ id: image.id, width: el.naturalWidth, height: el.naturalHeight })
  }, [image.id])

  useEffect(() => {
    viewStore.setState({ image: { width: dims.width, height: dims.height } })
  }, [dims.width, dims.height])

  // Fit once per image, as soon as both the container and the file size are known.
  const fittedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!loaded || container.width === 0) return
    if (fittedFor.current === image.id) return
    fittedFor.current = image.id
    viewActions.fit()
  }, [loaded, container.width, image.id])

  // Wheel zoom toward the cursor. Native listener so preventDefault works (React's is passive).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      const factor = Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0015))
      viewStore.setState({ view: zoomAt(viewStore.getState().view, factor, anchor) })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // ---- drafts and keyboard ---------------------------------------------------

  const finishPolygon = (points: Point[]) => {
    if (points.length >= 3 && activeClassId) {
      labeling.add(
        { type: 'polygon', points: points.map((p) => [round1(p.x), round1(p.y)] as [number, number]) },
        activeClassId,
      )
    }
    setDraft(null)
  }

  // Cancel drafts when switching tools
  useEffect(() => {
    setDraft(null)
  }, [tool])

  useEffect(() => {
    const isTyping = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      if (e.code === 'Space' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault()
        setSpaceHeld(true)
        return
      }
      if (!draft) return
      // While drawing, these keys belong to the draft, not the page shortcuts.
      if (e.key === 'Escape') {
        setDraft(null)
      } else if (e.key === 'Enter' && draft.kind === 'polygon') {
        finishPolygon(draft.points)
      } else if ((e.key === 'Backspace' || e.key === 'Delete') && draft.kind === 'polygon') {
        const points = draft.points.slice(0, -1)
        setDraft(points.length ? { ...draft, points } : null)
      } else {
        return
      }
      e.preventDefault()
      e.stopImmediatePropagation()
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceHeld(false)
    }
    const blur = () => setSpaceHeld(false)
    // Capture phase: runs before the page's shortcut listener regardless of registration order.
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
    // finishPolygon closes over activeClassId; re-subscribe when it or the draft changes
  }, [draft, activeClassId])

  // ---- pointer handling -------------------------------------------------------

  const screenPoint = (e: { clientX: number; clientY: number }): Point => {
    const rect = svgRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
  const clamp = (p: Point) => clampToImage(p, dims.width, dims.height)
  const tolerance = 5 / view.scale

  /** Topmost hit: the selected shape wins, then the smallest shape under the cursor. */
  function pick(p: Point): Annotation | null {
    if (selected && !hiddenClassIds.includes(selected.class_id) && hitTest(selected.geometry, p, tolerance)) return selected
    let best: Annotation | null = null
    let bestArea = Infinity
    for (const a of visible) {
      if (!hitTest(a.geometry, p, tolerance)) continue
      const area = geometryArea(a.geometry)
      if (area < bestArea) {
        best = a
        bestArea = area
      }
    }
    return best
  }

  function handleAt(sp: Point): { handle: Handle } | { vertex: number } | null {
    if (!selected) return null
    const g = selected.geometry
    if (g.type === 'bbox') {
      for (const h of HANDLES) {
        const hp = toScreen(handlePosition(g, h), view)
        if (Math.hypot(hp.x - sp.x, hp.y - sp.y) <= HANDLE_RADIUS) return { handle: h }
      }
    } else if (g.type === 'polygon') {
      for (let i = 0; i < g.points.length; i++) {
        const vp = toScreen({ x: g.points[i][0], y: g.points[i][1] }, view)
        if (Math.hypot(vp.x - sp.x, vp.y - sp.y) <= HANDLE_RADIUS) return { vertex: i }
      }
    }
    return null
  }

  function startDrag(e: PointerEvent<SVGSVGElement>, drag: Drag) {
    dragRef.current = drag
    setDragKind(drag.kind)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerDown(e: PointerEvent<SVGSVGElement>) {
    const sp = screenPoint(e)
    const ip = toImage(sp, view)

    if (e.button === 1 || (e.button === 0 && (spaceHeld || tool === 'pan'))) {
      e.preventDefault()
      startDrag(e, { kind: 'pan', start: sp, startView: view })
      return
    }
    if (e.button !== 0) return

    if (tool === 'bbox' || tool === 'exemplar') {
      if (tool === 'bbox' && !activeClassId) return onNeedClass()
      const a = clamp(ip)
      setDraft({ kind: 'box', a, b: a })
      startDrag(e, { kind: 'box', start: a })
      return
    }

    if (tool === 'polygon') {
      if (!activeClassId) return onNeedClass()
      const p = clamp(ip)
      const points = draft?.kind === 'polygon' ? draft.points : []
      if (points.length >= 3) {
        const first = toScreen(points[0], view)
        if (Math.hypot(first.x - sp.x, first.y - sp.y) <= CLOSE_RADIUS) return finishPolygon(points)
      }
      const last = points[points.length - 1]
      if (last) {
        const ls = toScreen(last, view)
        if (Math.hypot(ls.x - sp.x, ls.y - sp.y) < 3) return // second click of a double-click
      }
      setDraft({ kind: 'polygon', points: [...points, p], hover: p })
      return
    }

    // select tool
    const h = handleAt(sp)
    if (h && selected) {
      if ('vertex' in h && selected.geometry.type === 'polygon') {
        if (e.altKey) {
          if (selected.geometry.points.length > 3) {
            labeling.update(selected.id, {
              geometry: { type: 'polygon', points: selected.geometry.points.filter((_, i) => i !== h.vertex) },
            })
          }
          return
        }
        labeling.beginGesture()
        startDrag(e, { kind: 'vertex', id: selected.id, index: h.vertex, startGeom: selected.geometry })
        return
      }
      if ('handle' in h && selected.geometry.type === 'bbox') {
        labeling.beginGesture()
        startDrag(e, { kind: 'resize', id: selected.id, handle: h.handle, startGeom: selected.geometry })
        return
      }
    }
    const hit = pick(ip)
    if (hit) {
      labeling.select(hit.id)
      if (hit.geometry.type !== 'mask') {
        labeling.beginGesture()
        startDrag(e, { kind: 'move', id: hit.id, start: ip, startGeom: hit.geometry })
      }
      return
    }
    labeling.select(null)
    startDrag(e, { kind: 'pan', start: sp, startView: view })
  }

  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    const sp = screenPoint(e)
    const ip = toImage(sp, view)
    const inside = ip.x >= 0 && ip.y >= 0 && ip.x <= dims.width && ip.y <= dims.height
    viewStore.setState({ cursor: inside ? ip : null })

    const drag = dragRef.current
    if (drag) {
      switch (drag.kind) {
        case 'pan':
          viewActions.set({
            scale: drag.startView.scale,
            panX: drag.startView.panX + sp.x - drag.start.x,
            panY: drag.startView.panY + sp.y - drag.start.y,
          })
          break
        case 'box':
          setDraft({ kind: 'box', a: drag.start, b: clamp(ip) })
          break
        case 'move': {
          const d = clampTranslation(drag.startGeom, ip.x - drag.start.x, ip.y - drag.start.y, dims.width, dims.height)
          labeling.replaceLive(drag.id, translateGeometry(drag.startGeom, d.x, d.y))
          break
        }
        case 'resize':
          labeling.replaceLive(drag.id, resizeBBox(drag.startGeom, drag.handle, clamp(ip)))
          break
        case 'vertex': {
          const p = clamp(ip)
          const points = drag.startGeom.points.map((pt, i) => (i === drag.index ? ([round1(p.x), round1(p.y)] as [number, number]) : pt))
          labeling.replaceLive(drag.id, { type: 'polygon', points })
          break
        }
      }
      return
    }

    if (draft?.kind === 'polygon') {
      setDraft({ ...draft, hover: clamp(ip) })
      return
    }

    if (tool === 'select') {
      const h = handleAt(sp)
      if (h) {
        setHoverCursor('handle' in h ? HANDLE_CURSOR[h.handle] : 'pointer')
        return
      }
      const hit = pick(ip)
      setHoverId(hit?.id ?? null)
      setHoverCursor(hit ? (hit.geometry.type === 'mask' ? 'pointer' : 'move') : null)
    }
  }

  function onPointerUp(e: PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current
    dragRef.current = null
    setDragKind(null)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    if (!drag) return
    if (drag.kind === 'box') {
      const r = rectFromPoints(drag.start, clamp(toImage(screenPoint(e), view)))
      setDraft(null)
      if (r.width * view.scale < MIN_BOX || r.height * view.scale < MIN_BOX) return
      const box: BBoxGeometry = { type: 'bbox', x: round1(r.x), y: round1(r.y), width: round1(r.width), height: round1(r.height) }
      if (tool === 'exemplar') onExemplar(box)
      else if (activeClassId) labeling.add(box, activeClassId)
      return
    }
    if (drag.kind === 'move' || drag.kind === 'resize' || drag.kind === 'vertex') labeling.endGesture()
  }

  function onDoubleClick(e: MouseEvent<SVGSVGElement>) {
    if (draft?.kind === 'polygon') {
      finishPolygon(draft.points)
      return
    }
    // Double-click a selected polygon's edge to insert a vertex there.
    if (tool !== 'select' || !selected || selected.geometry.type !== 'polygon') return
    const ip = toImage(screenPoint(e), view)
    const pts = selected.geometry.points
    for (let i = 0; i < pts.length; i++) {
      const a = { x: pts[i][0], y: pts[i][1] }
      const b = { x: pts[(i + 1) % pts.length][0], y: pts[(i + 1) % pts.length][1] }
      if (distanceToSegment(ip, a, b) <= tolerance * 1.5) {
        const next = [...pts]
        next.splice(i + 1, 0, [round1(ip.x), round1(ip.y)])
        labeling.update(selected.id, { geometry: { type: 'polygon', points: next } })
        return
      }
    }
  }

  // ---- rendering ----------------------------------------------------------------

  const cursor =
    dragKind === 'pan' || (spaceHeld && dragKind === null)
      ? dragKind === 'pan'
        ? 'grabbing'
        : 'grab'
      : tool === 'pan'
        ? 'grab'
        : tool === 'select'
          ? (dragKind === 'move' ? 'move' : hoverCursor) ?? 'default'
          : 'crosshair'

  const transform = `matrix(${view.scale} 0 0 ${view.scale} ${view.panX} ${view.panY})`
  const labelFor = (a: Annotation | null) => {
    if (!a) return null
    const c = classById.get(a.class_id)
    const b = geometryBounds(a.geometry)
    const tl = toScreen({ x: b.x, y: b.y }, view)
    const text = `${c?.name ?? 'Unknown class'}${a.source === 'ai' && a.confidence != null ? `  ${Math.round(a.confidence * 100)}%` : ''}${a.status === 'pending' ? '  suggestion' : ''}`
    return { x: tl.x, y: tl.y, text, color: c?.color ?? '#9aa4b2' }
  }
  const tags = [labelFor(selected), hoverId !== selectedId ? labelFor(visible.find((a) => a.id === hoverId) ?? null) : null].filter(
    (t): t is NonNullable<typeof t> => t !== null,
  )

  return (
    <div className="canvas" ref={containerRef} style={{ cursor }}>
      <img
        key={image.id}
        ref={imgRef}
        src={image.url}
        alt={image.file_name}
        draggable={false}
        className="canvas-image"
        onLoad={(e) => {
          const el = e.currentTarget
          setNatural({ id: image.id, width: el.naturalWidth, height: el.naturalHeight })
        }}
        onError={() => setNatural(null)}
        style={{
          width: dims.width,
          height: dims.height,
          transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.scale})`,
          imageRendering: view.scale >= 3 ? 'pixelated' : 'auto',
          filter: brightness !== 1 || contrast !== 1 ? `brightness(${brightness}) contrast(${contrast})` : undefined,
          opacity: loaded ? 1 : 0,
        }}
      />
      <svg
        ref={svgRef}
        className="canvas-overlay"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => viewStore.setState({ cursor: null })}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
      >
        <g transform={transform}>
          <rect className="image-frame" x={0} y={0} width={dims.width} height={dims.height} />
          {visible.map((a) => {
            if (a.geometry.type !== 'mask') return null
            const color = classById.get(a.class_id)?.color ?? '#9aa4b2'
            return (
              <image
                key={a.id}
                href={maskDataUrl(a.geometry.rle, color, a.id === selectedId ? 0.6 : 0.42)}
                x={0}
                y={0}
                width={a.geometry.rle.size[1]}
                height={a.geometry.rle.size[0]}
                style={{ imageRendering: 'pixelated' }}
              />
            )
          })}
          {visible.map((a) => (
            <Shape
              key={a.id}
              ann={a}
              color={classById.get(a.class_id)?.color ?? '#9aa4b2'}
              selected={a.id === selectedId}
              hovered={a.id === hoverId}
            />
          ))}
        </g>

        {selected && !hiddenClassIds.includes(selected.class_id) && <Handles geometry={selected.geometry} view={view} />}

        {draft?.kind === 'box' && <DraftBox draft={draft} view={view} exemplar={tool === 'exemplar'} />}
        {draft?.kind === 'polygon' && (
          <DraftPolygon draft={draft} view={view} color={classById.get(activeClassId ?? '')?.color ?? '#9aa4b2'} />
        )}

        {tags.map((t, i) => (
          <g key={i} className="tag" transform={`translate(${Math.round(t.x)} ${Math.round(t.y) - 6})`}>
            <rect x={0} y={-17} width={t.text.length * 6.1 + 12} height={18} rx={3} fill="rgba(13,16,20,0.82)" stroke={t.color} />
            <text x={6} y={-4}>
              {t.text}
            </text>
          </g>
        ))}
      </svg>
      {!loaded && <div className="canvas-loading">{image.url ? 'Loading image…' : 'Image file is missing.'}</div>}
    </div>
  )
}

function round1(n: number) {
  return Math.round(n * 10) / 10
}

function Shape({ ann, color, selected, hovered }: { ann: Annotation; color: string; selected: boolean; hovered: boolean }) {
  const pending = ann.status === 'pending'
  const common = {
    className: `shape${pending ? ' is-pending' : ''}${selected ? ' is-selected' : ''}${hovered ? ' is-hovered' : ''}`,
    stroke: color,
    fill: color,
    vectorEffect: 'non-scaling-stroke',
  }
  const g = ann.geometry
  if (g.type === 'bbox') return <rect {...common} x={g.x} y={g.y} width={g.width} height={g.height} />
  if (g.type === 'polygon') return <polygon {...common} points={g.points.map((p) => p.join(',')).join(' ')} />
  return null
}

function Handles({ geometry, view }: { geometry: Geometry; view: View }) {
  if (geometry.type === 'bbox') {
    return (
      <g className="handles">
        {HANDLES.map((h) => {
          const p = toScreen(handlePosition(geometry, h), view)
          return <rect key={h} x={p.x - 4} y={p.y - 4} width={8} height={8} />
        })}
      </g>
    )
  }
  if (geometry.type === 'polygon') {
    return (
      <g className="handles">
        {geometry.points.map(([x, y], i) => {
          const p = toScreen({ x, y }, view)
          return <circle key={i} cx={p.x} cy={p.y} r={4} />
        })}
      </g>
    )
  }
  return null
}

function DraftBox({ draft, view, exemplar }: { draft: { a: Point; b: Point }; view: View; exemplar: boolean }) {
  const a = toScreen(draft.a, view)
  const b = toScreen(draft.b, view)
  const r = rectFromPoints(a, b)
  return <rect className={`draft${exemplar ? ' draft-exemplar' : ''}`} x={r.x} y={r.y} width={r.width} height={r.height} />
}

function DraftPolygon({ draft, view, color }: { draft: { points: Point[]; hover: Point | null }; view: View; color: string }) {
  const pts = draft.points.map((p) => toScreen(p, view))
  const hover = draft.hover ? toScreen(draft.hover, view) : null
  const line = [...pts, ...(hover ? [hover] : [])].map((p) => `${p.x},${p.y}`).join(' ')
  const canClose = pts.length >= 3 && hover && Math.hypot(hover.x - pts[0].x, hover.y - pts[0].y) <= CLOSE_RADIUS
  return (
    <g className="draft-polygon">
      <polyline points={line} stroke={color} />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={i === 0 ? (canClose ? 7 : 5) : 3.5} className={i === 0 ? 'first' : ''} stroke={color} />
      ))}
    </g>
  )
}
