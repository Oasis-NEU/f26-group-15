import { useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { api } from '../api'
import { AppShell } from '../components/AppShell'
import { Icon } from '../components/Icon'
import { PageState } from '../components/ui'
import { errorMessage, useAsync } from '../hooks/useAsync'
import { formatRelative, nextClassColor } from '../lib/util'
import { Link, navigate, paths } from '../router'
import type { LabelClass } from '../types/annotation'

export function ProjectPage({ session, id }: { session: Session | null; id: string }) {
  const data = useAsync(
    async () => {
      const [project, datasets, classes] = await Promise.all([api.getProject(id), api.listDatasets(id), api.listClasses(id)])
      return { project, datasets, classes }
    },
    [id],
  )
  const [newDataset, setNewDataset] = useState('')
  const [error, setError] = useState('')

  async function createDataset(e: FormEvent) {
    e.preventDefault()
    try {
      const d = await api.createDataset(id, { name: newDataset.trim() })
      navigate(paths.dataset(d.id))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function deleteProject() {
    if (!data.data) return
    if (!window.confirm(`Delete "${data.data.project.name}" with all its datasets, images and annotations?`)) return
    await api.deleteProject(id)
    navigate(paths.dashboard())
  }

  const p = data.data?.project
  return (
    <AppShell session={session} crumbs={[{ label: 'Projects', to: paths.dashboard() }, { label: p?.name ?? '…' }]}>
      <PageState loading={data.loading && !data.data} error={data.error} onRetry={data.reload}>
        {data.data && p && (
          <>
            <div className="page-head">
              <div>
                <h1>{p.name}</h1>
                {p.description && <p className="lede">{p.description}</p>}
              </div>
              <button className="btn btn-quiet" onClick={deleteProject}>
                <Icon name="trash" size={16} />
                Delete project
              </button>
            </div>

            <div className="two-col">
              <section>
                <h2>Datasets</h2>
                {data.data.datasets.length === 0 ? (
                  <p className="muted">No datasets yet. Name one below, then upload images into it.</p>
                ) : (
                  <ul className="rows">
                    {data.data.datasets.map((d) => (
                      <li key={d.id}>
                        <Link to={paths.dataset(d.id)} className="row">
                          <span className="row-main">
                            <span className="row-title">{d.name}</span>
                          </span>
                          <span className="row-meta">Created {formatRelative(d.created_at)}</span>
                          <Icon name="right" size={16} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                <form className="inline-form" onSubmit={createDataset}>
                  <input
                    aria-label="New dataset name"
                    placeholder="New dataset name"
                    value={newDataset}
                    onChange={(e) => setNewDataset(e.target.value)}
                  />
                  <button className="btn" disabled={!newDataset.trim()}>
                    Create dataset
                  </button>
                </form>
                {error && <p className="error-text">{error}</p>}
              </section>

              <section>
                <h2>Label classes</h2>
                <ClassEditor
                  projectId={id}
                  classes={data.data.classes}
                  onChange={(classes) => data.setData((prev) => prev && { ...prev, classes })}
                />
              </section>
            </div>
          </>
        )}
      </PageState>
    </AppShell>
  )
}

export function ClassEditor({
  projectId,
  classes,
  onChange,
}: {
  projectId: string
  classes: LabelClass[]
  onChange: (classes: LabelClass[]) => void
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  async function add(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    if (classes.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      setError(`A class named "${trimmed}" already exists.`)
      return
    }
    try {
      const c = await api.createClass(projectId, { name: trimmed, color: nextClassColor(classes.map((x) => x.color)) })
      onChange([...classes, c])
      setName('')
      setError('')
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function recolor(c: LabelClass, color: string) {
    onChange(classes.map((x) => (x.id === c.id ? { ...x, color } : x)))
    await api.updateClass(c.id, { color })
  }

  async function remove(c: LabelClass) {
    try {
      await api.deleteClass(c.id)
      onChange(classes.filter((x) => x.id !== c.id))
      setError('')
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <div>
      {classes.length === 0 ? (
        <p className="muted">Add at least one class before labeling, for example "Nucleus" or "Lesion".</p>
      ) : (
        <ul className="class-list">
          {classes.map((c, i) => (
            <li key={c.id}>
              <label className="swatch" style={{ background: c.color }} title="Change color">
                <input type="color" value={c.color} onChange={(e) => recolor(c, e.target.value)} aria-label={`Color for ${c.name}`} />
              </label>
              <span className="class-name">{c.name}</span>
              {i < 9 && <span className="muted small">key {i + 1}</span>}
              <button className="icon-btn" aria-label={`Delete ${c.name}`} title="Delete class" onClick={() => remove(c)}>
                <Icon name="trash" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="inline-form" onSubmit={add}>
        <input aria-label="New class name" placeholder="New class name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn" disabled={!name.trim()}>
          Add class
        </button>
      </form>
      {error && <p className="error-text">{error}</p>}
    </div>
  )
}
