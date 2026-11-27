import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { AnnotationCanvas } from '../components/canvas/AnnotationCanvas'
import { Icon } from '../components/Icon'
import { Inspector, type AiState } from '../components/labeling/Inspector'
import { ShortcutsDialog } from '../components/labeling/ShortcutsDialog'
import { StatusBar } from '../components/labeling/StatusBar'
import { ToolRail } from '../components/labeling/ToolRail'
import { PageState, StatusPill } from '../components/ui'
import { errorMessage, useAsync } from '../hooks/useAsync'
import { useAutosave, type SaveStatus } from '../hooks/useAutosave'
import { geometryBounds, rectIoU } from '../lib/geometry'
import { nextClassColor } from '../lib/util'
import { Link, navigate, paths } from '../router'
import { useStore } from '../store/createStore'
import { labeling, labelingStore, type ToolId } from '../store/labeling'
import { viewActions } from '../store/view'
import type { BBoxGeometry, ImageStatus, LabelClass } from '../types/annotation'

const TOOL_KEYS: Record<string, ToolId> = { v: 'select', h: 'pan', b: 'bbox', p: 'polygon', e: 'exemplar' }

export function LabelPage({ imageId }: { imageId: string }) {
  const data = useAsync(
    async () => {
      const image = await api.getImage(imageId)
      const dataset = await api.getDataset(image.dataset_id)
      const [images, classes, annotations] = await Promise.all([
        api.listImages(dataset.id),
        api.listClasses(dataset.project_id),
        api.listAnnotations(image.id),
      ])
      return { image, dataset, images, classes, annotations }
    },
    [imageId],
  )
  const [classes, setClasses] = useState<LabelClass[]>([])
  const [status, setStatus] = useState<ImageStatus>('unlabeled')
  const [ai, setAi] = useState<AiState>({ phase: 'idle' })
  const [notice, setNotice] = useState('')
  const [showShortcuts, setShowShortcuts] = useState(false)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const autosave = useAutosave((count) => {
    // first save with labels moves an untouched image to "in progress"
    if (count > 0) setStatus((s) => (s === 'unlabeled' ? 'in_progress' : s))
  })

  const d = data.data
  const image = d?.image

  // Load annotations into the store whenever a new image arrives
  useEffect(() => {
    if (!d) return
    labeling.load(d.image.id, d.annotations)
    setClasses(d.classes)
    setStatus(d.image.status)
    setAi({ phase: 'idle' })
    const active = labelingStore.getState().activeClassId
    if (!d.classes.some((c) => c.id === active)) labeling.setActiveClass(d.classes[0]?.id ?? null)
  }, [d])

  const flash = useCallback((text: string) => {
    setNotice(text)
    clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(''), 3000)
  }, [])

  const index = d ? d.images.findIndex((i) => i.id === d.image.id) : -1
  const prev = d && index > 0 ? d.images[index - 1] : null
  const next = d && index >= 0 && index < d.images.length - 1 ? d.images[index + 1] : null

  async function go(to: string) {
    await autosave.flush()
    navigate(to)
  }

  async function setImageStatus(s: ImageStatus) {
    if (!image) return
    await autosave.flush()
    setStatus(s)
    await api.updateImageStatus(image.id, s)
  }

  async function markReviewedAndNext() {
    if (labelingStore.getState().annotations.some((a) => a.status === 'pending')) {
      flash('Accept or reject the remaining AI suggestions first.')
      return
    }
    await setImageStatus('reviewed')
    if (next) navigate(paths.label(next.id))
    else if (d) {
      flash('That was the last image in this dataset.')
    }
  }

  async function runAi(req: { prompt?: string; exemplars?: BBoxGeometry[] }) {
    const classId = labelingStore.getState().activeClassId
    if (!image || !classId) return flash('Choose a class first. Press 1–9 or click one on the right.')
    setAi({ phase: 'running' })
    try {
      const suggestions = await api.predict(image.id, { ...req, class_id: classId })
      // Stale result: the user moved to another image while the model ran
      if (labelingStore.getState().imageId !== image.id) return
      labeling.reject() // replace any earlier, unreviewed suggestions
      const existing = labelingStore.getState().annotations.map((a) => geometryBounds(a.geometry))
      const fresh = suggestions.filter((s) => {
        const b = geometryBounds(s.geometry)
        return !existing.some((e) => rectIoU(e, b) > 0.5)
      })
      labeling.addMany(fresh)
      labeling.setTool('select')
      setAi({ phase: 'done', found: suggestions.length, added: fresh.length })
    } catch (e) {
      setAi({ phase: 'error', message: errorMessage(e) })
    }
  }

  async function addClass(name: string): Promise<string | null> {
    if (!d) return 'Still loading.'
    if (!name) return null
    if (classes.some((c) => c.name.toLowerCase() === name.toLowerCase())) return `"${name}" already exists.`
    try {
      const c = await api.createClass(d.dataset.project_id, { name, color: nextClassColor(classes.map((x) => x.color)) })
      setClasses((cs) => [...cs, c])
      labeling.setActiveClass(c.id)
      return null
    } catch (e) {
      return errorMessage(e)
    }
  }

  // Page-level keyboard shortcuts. The canvas handles drawing keys first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target
      if (t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return
      if (e.defaultPrevented || showShortcuts) return
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      const s = labelingStore.getState()
      const sel = s.annotations.find((a) => a.id === s.selectedId)

      if (mod && key === 'z') {
        if (e.shiftKey) labeling.redo()
        else labeling.undo()
      } else if (mod && key === 'y') {
        labeling.redo()
      } else if (mod) {
        return
      } else if (TOOL_KEYS[key] && !e.altKey) {
        labeling.setTool(TOOL_KEYS[key])
      } else if (/^[1-9]$/.test(e.key)) {
        const c = classes[Number(e.key) - 1]
        if (!c) return
        if (sel) labeling.update(sel.id, { class_id: c.id })
        labeling.setActiveClass(c.id)
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (sel) labeling.remove(sel.id)
      } else if (e.key === 'Escape') {
        if (s.selectedId) labeling.select(null)
        else labeling.setTool('select')
      } else if (e.key === 'Enter') {
        if (e.shiftKey) labeling.accept()
        else if (sel?.status === 'pending') labeling.accept([sel.id])
      } else if (e.key === 'ArrowLeft' && prev) {
        go(paths.label(prev.id))
      } else if (e.key === 'ArrowRight' && next) {
        go(paths.label(next.id))
      } else if (key === 'f') {
        viewActions.fit()
      } else if (e.key === '0') {
        viewActions.actualSize()
      } else if (e.key === '+' || e.key === '=') {
        viewActions.zoomBy(1.25)
      } else if (e.key === '-') {
        viewActions.zoomBy(1 / 1.25)
      } else if (key === 'r') {
        markReviewedAndNext()
      } else if (e.key === '?') {
        setShowShortcuts(true)
      } else {
        return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="label-page">
      <header className="label-top">
        <Link to={d ? paths.dataset(d.dataset.id) : paths.dashboard()} className="back">
          <Icon name="left" size={16} />
          {d?.dataset.name ?? 'Back'}
        </Link>
        {image && (
          <>
            <span className="file-name" title={image.file_name}>
              {image.file_name}
            </span>
            <span className="muted small">
              {index + 1} of {d!.images.length}
            </span>
            <StatusPill status={status} />
          </>
        )}
        <span className="label-top-fill" />
        <SaveIndicator status={autosave.status} error={autosave.error} />
        <button className="icon-btn" aria-label="Previous image" title="Previous image (←)" disabled={!prev} onClick={() => prev && go(paths.label(prev.id))}>
          <Icon name="left" />
        </button>
        <button className="icon-btn" aria-label="Next image" title="Next image (→)" disabled={!next} onClick={() => next && go(paths.label(next.id))}>
          <Icon name="right" />
        </button>
        {status === 'reviewed' ? (
          <button className="btn btn-small" onClick={() => setImageStatus('in_progress')} title="Move back to in progress">
            <Icon name="check" size={14} />
            Reviewed
          </button>
        ) : (
          <button className="btn btn-small btn-primary" onClick={markReviewedAndNext} title="Mark reviewed and go to next (R)">
            Mark reviewed
          </button>
        )}
      </header>

      <ToolRail onShowShortcuts={() => setShowShortcuts(true)} />

      <div className="workspace">
        <PageState loading={data.loading && !d} error={data.error} onRetry={data.reload}>
          {image && (
            <AnnotationCanvas
              image={image}
              classes={classes}
              onExemplar={(box) => runAi({ exemplars: [box] })}
              onNeedClass={() => flash('Choose a class first. Press 1–9 or click one on the right.')}
            />
          )}
        </PageState>
        {notice && (
          <div className="toast" role="status">
            {notice}
          </div>
        )}
        <StatusBar />
      </div>

      <Inspector classes={classes} ai={ai} onRunAi={(prompt) => runAi({ prompt })} onAddClass={addClass} />

      {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}
    </div>
  )
}

function SaveIndicator({ status, error }: { status: SaveStatus; error: string }) {
  const pendingCount = useStore(labelingStore, (s) => s.annotations.filter((a) => a.status === 'pending').length)
  const text = {
    saved: 'All changes saved',
    unsaved: 'Unsaved changes',
    saving: 'Saving…',
    error: `Not saved: ${error}`,
  }[status]
  return (
    <span className={`save save-${status}`} role="status" title={pendingCount ? `${pendingCount} AI suggestions are saved as pending` : undefined}>
      {text}
    </span>
  )
}
