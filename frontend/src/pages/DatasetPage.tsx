import { useRef, useState, type DragEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { api } from '../api'
import { AppShell } from '../components/AppShell'
import { Icon } from '../components/Icon'
import { PageState, Spinner, StatusPill } from '../components/ui'
import { errorMessage, useAsync } from '../hooks/useAsync'
import { downloadBlob } from '../lib/util'
import { Link, navigate, paths } from '../router'
import type { ExportFormat, ImageStatus } from '../types/annotation'

type Filter = 'all' | ImageStatus

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unlabeled', label: 'Unlabeled' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'reviewed', label: 'Reviewed' },
]

const EXPORTS: { format: ExportFormat; label: string; ext: string; hint: string }[] = [
  { format: 'coco', label: 'COCO JSON', ext: 'json', hint: 'Boxes and polygons for most detection and segmentation trainers' },
  { format: 'yolo', label: 'YOLO', ext: 'txt', hint: 'Normalized boxes and polygons for Ultralytics YOLO' },
  { format: 'json', label: 'LabelAI JSON', ext: 'json', hint: 'Everything, in the team schema' },
]

export function DatasetPage({ session, id }: { session: Session | null; id: string }) {
  const data = useAsync(
    async () => {
      const dataset = await api.getDataset(id)
      const [project, images, classes] = await Promise.all([
        api.getProject(dataset.project_id),
        api.listImages(id),
        api.listClasses(dataset.project_id),
      ])
      return { dataset, project, images, classes }
    },
    [id],
  )
  const [filter, setFilter] = useState<Filter>('all')
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)

  async function upload(files: File[]) {
    if (files.length === 0) return
    setUploading(true)
    setMessage(null)
    try {
      const created = await api.uploadImages(id, files)
      data.setData((prev) => prev && { ...prev, images: [...prev.images, ...created] })
      setMessage({ kind: 'info', text: `Uploaded ${created.length} image${created.length === 1 ? '' : 's'}.` })
    } catch (err) {
      setMessage({ kind: 'error', text: errorMessage(err) })
      data.reload()
    } finally {
      setUploading(false)
    }
  }

  function onDrop(e: DragEvent<HTMLElement>) {
    e.preventDefault()
    setDragOver(false)
    upload(Array.from(e.dataTransfer.files))
  }

  async function exportAs(format: ExportFormat, ext: string) {
    if (!data.data) return
    try {
      const blob = await api.exportDataset(id, format)
      const safe = data.data.dataset.name.replace(/[^\w-]+/g, '_')
      downloadBlob(blob, `${safe}_${format}.${ext}`)
    } catch (err) {
      setMessage({ kind: 'error', text: errorMessage(err) })
    }
  }

  const d = data.data
  const images = d?.images ?? []
  const counts = {
    all: images.length,
    unlabeled: images.filter((i) => i.status === 'unlabeled').length,
    in_progress: images.filter((i) => i.status === 'in_progress').length,
    reviewed: images.filter((i) => i.status === 'reviewed').length,
  }
  const totalAnnotations = images.reduce((s, i) => s + i.annotation_count, 0)
  const shown = filter === 'all' ? images : images.filter((i) => i.status === filter)
  const firstToLabel = images.find((i) => i.status !== 'reviewed') ?? images[0]

  return (
    <AppShell
      session={session}
      crumbs={[
        { label: 'Projects', to: paths.dashboard() },
        { label: d?.project.name ?? '…', to: d ? paths.project(d.project.id) : undefined },
        { label: d?.dataset.name ?? '…' },
      ]}
    >
      <PageState loading={data.loading && !d} error={data.error} onRetry={data.reload}>
        {d && (
          <div
            className={`dropzone-page${dragOver ? ' is-dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={(e) => {
              if (e.currentTarget === e.target) setDragOver(false)
            }}
            onDrop={onDrop}
          >
            <div className="page-head">
              <div>
                <h1>{d.dataset.name}</h1>
                <p className="lede">
                  {counts.reviewed} of {counts.all} images reviewed, {totalAnnotations} annotations so far
                </p>
              </div>
              <div className="head-actions">
                <button className="btn" onClick={() => fileInput.current?.click()} disabled={uploading}>
                  {uploading ? <Spinner label="Uploading" /> : <Icon name="upload" size={16} />}
                  Upload images
                </button>
                {firstToLabel && (
                  <button className="btn btn-primary" onClick={() => navigate(paths.label(firstToLabel.id))}>
                    Start labeling
                  </button>
                )}
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                hidden
                onChange={(e) => {
                  upload(Array.from(e.target.files ?? []))
                  e.target.value = ''
                }}
              />
            </div>

            {counts.all > 0 && (
              <div className="progress" aria-label="Labeling progress">
                <span className="progress-reviewed" style={{ flexGrow: counts.reviewed }} />
                <span className="progress-in_progress" style={{ flexGrow: counts.in_progress }} />
                <span className="progress-unlabeled" style={{ flexGrow: counts.unlabeled }} />
              </div>
            )}

            {d.classes.length === 0 && (
              <p className="notice">
                This project has no label classes yet. <Link to={paths.project(d.project.id)}>Add classes</Link> before labeling.
              </p>
            )}
            {message && <p className={message.kind === 'error' ? 'error-text' : 'info-text'}>{message.text}</p>}

            {counts.all === 0 ? (
              <button className="dropzone" onClick={() => fileInput.current?.click()}>
                <Icon name="image" size={28} />
                <strong>Drop PNG or JPEG images here, or click to choose files</strong>
                <span className="muted">Use de-identified images only. Convert DICOM to PNG before uploading.</span>
              </button>
            ) : (
              <>
                <div className="toolbar-row">
                  <div className="segmented" role="tablist" aria-label="Filter images by status">
                    {FILTERS.map((f) => (
                      <button key={f.id} role="tab" aria-selected={filter === f.id} className={filter === f.id ? 'is-active' : ''} onClick={() => setFilter(f.id)}>
                        {f.label} <span className="count">{counts[f.id]}</span>
                      </button>
                    ))}
                  </div>
                  <div className="export-group">
                    <span className="muted small">Export</span>
                    {EXPORTS.map((x) => (
                      <button key={x.format} className="btn btn-small" title={x.hint} onClick={() => exportAs(x.format, x.ext)}>
                        <Icon name="download" size={14} />
                        {x.label}
                      </button>
                    ))}
                  </div>
                </div>

                <ul className="thumb-grid">
                  {shown.map((img) => (
                    <li key={img.id}>
                      <Link to={paths.label(img.id)} className="thumb">
                        <span className="thumb-img">
                          <img src={img.url} alt="" loading="lazy" />
                        </span>
                        <span className="thumb-name" title={img.file_name}>
                          {img.file_name}
                        </span>
                        <span className="thumb-meta">
                          <StatusPill status={img.status} />
                          <span className="muted small">{img.annotation_count} labels</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {shown.length === 0 && <p className="muted">No images with this status.</p>}
                <p className="muted small drop-hint">Drop more images anywhere on this page to upload them.</p>
              </>
            )}
          </div>
        )}
      </PageState>
    </AppShell>
  )
}
