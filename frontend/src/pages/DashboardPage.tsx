import { useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { api, resetMockData } from '../api'
import { AppShell } from '../components/AppShell'
import { Icon } from '../components/Icon'
import { PageState } from '../components/ui'
import { errorMessage, useAsync } from '../hooks/useAsync'
import { formatRelative } from '../lib/util'
import { Link, navigate, paths } from '../router'

export function DashboardPage({ session }: { session: Session | null }) {
  const projects = useAsync(() => api.listProjects(), [])
  const [creating, setCreating] = useState(false)

  return (
    <AppShell session={session} crumbs={[{ label: 'Projects' }]}>
      <div className="page-head">
        <div>
          <h1>Projects</h1>
          <p className="lede">Each project has its own label classes and one or more image datasets.</p>
        </div>
        {!creating && (
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={16} />
            New project
          </button>
        )}
      </div>

      {creating && (
        <NewProjectForm
          onCancel={() => setCreating(false)}
          onCreated={(id) => navigate(paths.project(id))}
        />
      )}

      <PageState loading={projects.loading && !projects.data} error={projects.error} onRetry={projects.reload}>
        {projects.data && projects.data.length === 0 ? (
          <div className="empty">
            <p>No projects yet. Create one to start uploading images.</p>
          </div>
        ) : (
          <ul className="rows">
            {projects.data?.map((p) => (
              <li key={p.id}>
                <Link to={paths.project(p.id)} className="row">
                  <span className="row-main">
                    <span className="row-title">{p.name}</span>
                    {p.description && <span className="row-sub">{p.description}</span>}
                  </span>
                  <span className="row-meta">Created {formatRelative(p.created_at)}</span>
                  <Icon name="right" size={16} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PageState>

      {resetMockData && (
        <footer className="page-foot">
          <button
            className="link-btn"
            onClick={async () => {
              if (!confirmReset()) return
              await resetMockData!()
              projects.reload()
            }}
          >
            Reset demo data
          </button>
          <span>Deletes everything stored in this browser and restores the sample project.</span>
        </footer>
      )}
    </AppShell>
  )
}

function confirmReset() {
  return window.confirm('Delete all local projects, images and annotations and restore the sample project?')
}

function NewProjectForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const p = await api.createProject({ name: name.trim(), description: description.trim() })
      onCreated(p.id)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <form className="panel form-panel" onSubmit={submit}>
      <label className="field">
        <span>Project name</span>
        <input autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="Retinal vessel segmentation" />
      </label>
      <label className="field">
        <span>
          Description <em>optional</em>
        </span>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is being labeled, and from which dataset" />
      </label>
      {error && <p className="error-text">{error}</p>}
      <div className="form-actions">
        <button className="btn btn-primary" disabled={busy || !name.trim()}>
          Create project
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
