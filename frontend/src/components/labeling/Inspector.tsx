import { useState, type FormEvent } from 'react'
import type { Annotation, LabelClass } from '../../types/annotation'
import { geometryBounds } from '../../lib/geometry'
import { useStore } from '../../store/createStore'
import { labeling, labelingStore } from '../../store/labeling'
import { Icon } from '../Icon'
import { Spinner } from '../ui'

export type AiState = { phase: 'idle' } | { phase: 'running' } | { phase: 'done'; found: number; added: number } | { phase: 'error'; message: string }

interface Props {
  classes: LabelClass[]
  ai: AiState
  onRunAi: (prompt: string) => void
  onAddClass: (name: string) => Promise<string | null>
}

export function Inspector({ classes, ai, onRunAi, onAddClass }: Props) {
  const annotations = useStore(labelingStore, (s) => s.annotations)
  const selectedId = useStore(labelingStore, (s) => s.selectedId)
  const activeClassId = useStore(labelingStore, (s) => s.activeClassId)
  const hidden = useStore(labelingStore, (s) => s.hiddenClassIds)
  const tool = useStore(labelingStore, (s) => s.tool)
  const [prompt, setPrompt] = useState('')
  const [threshold, setThreshold] = useState(0.7)
  const [newClass, setNewClass] = useState('')
  const [classError, setClassError] = useState('')

  const selected = annotations.find((a) => a.id === selectedId) ?? null
  const pending = annotations.filter((a) => a.status === 'pending')
  const aboveThreshold = pending.filter((a) => (a.confidence ?? 0) >= threshold)
  const accepted = annotations.filter((a) => a.status === 'accepted')
  const classById = new Map(classes.map((c) => [c.id, c]))
  const activeClass = classById.get(activeClassId ?? '')

  async function addClass(e: FormEvent) {
    e.preventDefault()
    const err = await onAddClass(newClass.trim())
    if (err) setClassError(err)
    else {
      setNewClass('')
      setClassError('')
    }
  }

  return (
    <aside className="inspector" aria-label="Labels and AI">
      <section className="insp-section">
        <h2>Label as</h2>
        <ul className="insp-classes">
          {classes.map((c, i) => {
            const count = accepted.filter((a) => a.class_id === c.id).length
            const isHidden = hidden.includes(c.id)
            return (
              <li key={c.id} className={c.id === activeClassId ? 'is-active' : ''}>
                <button className="insp-class" onClick={() => labeling.setActiveClass(c.id)} aria-pressed={c.id === activeClassId}>
                  <span className="dot" style={{ background: c.color }} />
                  <span className="insp-class-name">{c.name}</span>
                  <span className="muted small">{count}</span>
                  {i < 9 && <kbd className="kbd">{i + 1}</kbd>}
                </button>
                <button
                  className="icon-btn icon-btn-sm"
                  aria-label={isHidden ? `Show ${c.name}` : `Hide ${c.name}`}
                  title={isHidden ? 'Show' : 'Hide'}
                  onClick={() => labeling.toggleClassVisibility(c.id)}
                >
                  <Icon name={isHidden ? 'eyeOff' : 'eye'} size={15} />
                </button>
              </li>
            )
          })}
        </ul>
        <form className="inline-form compact" onSubmit={addClass}>
          <input aria-label="New class name" placeholder="Add a class" value={newClass} onChange={(e) => setNewClass(e.target.value)} />
          <button className="btn btn-small" disabled={!newClass.trim()}>
            Add
          </button>
        </form>
        {classError && <p className="error-text small">{classError}</p>}
      </section>

      <section className="insp-section insp-ai">
        <h2>
          <Icon name="sparkle" size={15} /> AI assist
        </h2>
        <form
          className="ai-form"
          onSubmit={(e) => {
            e.preventDefault()
            onRunAi(prompt.trim())
          }}
        >
          <input
            aria-label="What should the AI look for?"
            placeholder={activeClass ? `Look for: ${activeClass.name.toLowerCase()}` : 'What to look for'}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <button className="btn btn-ai" disabled={ai.phase === 'running' || !activeClass}>
            {ai.phase === 'running' ? <Spinner label="Running" /> : 'Find'}
          </button>
        </form>
        <button
          className={`btn btn-small btn-block${tool === 'exemplar' ? ' is-active' : ''}`}
          onClick={() => labeling.setTool(tool === 'exemplar' ? 'select' : 'exemplar')}
          disabled={!activeClass}
        >
          <Icon name="target" size={14} />
          {tool === 'exemplar' ? 'Draw a box around one example…' : 'Find more like an example'}
        </button>
        {ai.phase === 'running' && <p className="muted small">Running the model on this image…</p>}
        {ai.phase === 'error' && <p className="error-text small">{ai.message}</p>}
        {ai.phase === 'done' && pending.length === 0 && (
          <p className="muted small">
            {ai.found === 0
              ? 'No objects found. Try a different prompt or draw an example.'
              : ai.added === 0
                ? 'Everything found is already labeled.'
                : 'All suggestions reviewed.'}
          </p>
        )}

        {pending.length > 0 && (
          <div className="review">
            <p className="review-count">
              <strong>{pending.length}</strong> {pending.length === 1 ? 'suggestion' : 'suggestions'} to review
            </p>
            <label className="slider">
              <span>
                Accept at or above <strong>{Math.round(threshold * 100)}%</strong> confidence
              </span>
              <input type="range" min={0} max={1} step={0.05} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
            </label>
            <div className="review-actions">
              <button className="btn btn-small btn-primary" disabled={aboveThreshold.length === 0} onClick={() => labeling.accept(aboveThreshold.map((a) => a.id))}>
                <Icon name="check" size={14} />
                Accept {aboveThreshold.length}
              </button>
              <button className="btn btn-small" onClick={() => labeling.reject()}>
                <Icon name="x" size={14} />
                Reject all
              </button>
            </div>
            <p className="muted small">Click a dashed outline to check it, then Enter to accept or Delete to reject.</p>
          </div>
        )}
      </section>

      {selected && <SelectedPanel ann={selected} classes={classes} />}

      <section className="insp-section insp-list">
        <h2>
          On this image <span className="muted">{annotations.length}</span>
        </h2>
        {annotations.length === 0 ? (
          <p className="muted small">Nothing labeled yet. Pick a tool on the left, or let the AI make a first pass.</p>
        ) : (
          <ul className="ann-list">
            {annotations.map((a) => (
              <AnnotationRow key={a.id} ann={a} cls={classById.get(a.class_id)} selected={a.id === selectedId} />
            ))}
          </ul>
        )}
      </section>
    </aside>
  )
}

function shapeName(a: Annotation) {
  return a.geometry.type === 'bbox' ? 'Box' : a.geometry.type === 'polygon' ? 'Polygon' : 'Mask'
}

function AnnotationRow({ ann, cls, selected }: { ann: Annotation; cls?: LabelClass; selected: boolean }) {
  return (
    <li className={`${selected ? 'is-selected' : ''}${ann.status === 'pending' ? ' is-pending' : ''}`}>
      <button className="ann-row" onClick={() => labeling.select(ann.id)}>
        <span className={`dot${ann.status === 'pending' ? ' dot-ring' : ''}`} style={{ background: cls?.color, borderColor: cls?.color }} />
        <span className="ann-row-name">{cls?.name ?? 'Unknown class'}</span>
        <span className="muted small">{shapeName(ann)}</span>
        {ann.source === 'ai' && ann.confidence != null && <span className="conf">{Math.round(ann.confidence * 100)}%</span>}
      </button>
      {ann.status === 'pending' ? (
        <>
          <button className="icon-btn icon-btn-sm" aria-label="Accept suggestion" title="Accept" onClick={() => labeling.accept([ann.id])}>
            <Icon name="check" size={15} />
          </button>
          <button className="icon-btn icon-btn-sm" aria-label="Reject suggestion" title="Reject" onClick={() => labeling.reject([ann.id])}>
            <Icon name="x" size={15} />
          </button>
        </>
      ) : (
        <button className="icon-btn icon-btn-sm" aria-label="Delete annotation" title="Delete" onClick={() => labeling.remove(ann.id)}>
          <Icon name="trash" size={15} />
        </button>
      )}
    </li>
  )
}

function SelectedPanel({ ann, classes }: { ann: Annotation; classes: LabelClass[] }) {
  const b = geometryBounds(ann.geometry)
  return (
    <section className="insp-section insp-selected">
      <h2>Selected {shapeName(ann).toLowerCase()}</h2>
      <label className="field field-row">
        <span>Class</span>
        <select value={ann.class_id} onChange={(e) => labeling.update(ann.id, { class_id: e.target.value })}>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <dl className="facts">
        <dt>Source</dt>
        <dd>{ann.source === 'ai' ? `AI, ${Math.round((ann.confidence ?? 0) * 100)}% confident` : 'Drawn by hand'}</dd>
        <dt>Size</dt>
        <dd>
          {Math.round(b.width)} × {Math.round(b.height)} px
        </dd>
        {ann.geometry.type === 'polygon' && (
          <>
            <dt>Vertices</dt>
            <dd>{ann.geometry.points.length}</dd>
          </>
        )}
      </dl>
      {ann.geometry.type === 'polygon' && (
        <p className="muted small">Drag a vertex to move it. Double-click an edge to add one, Alt-click to remove one.</p>
      )}
      <div className="review-actions">
        {ann.status === 'pending' && (
          <button className="btn btn-small btn-primary" onClick={() => labeling.accept([ann.id])}>
            <Icon name="check" size={14} />
            Accept
          </button>
        )}
        <button className="btn btn-small btn-danger" onClick={() => labeling.remove(ann.id)}>
          <Icon name="trash" size={14} />
          {ann.status === 'pending' ? 'Reject' : 'Delete'}
        </button>
      </div>
    </section>
  )
}
