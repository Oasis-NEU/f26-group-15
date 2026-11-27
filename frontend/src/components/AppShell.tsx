import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { apiMode } from '../api'
import { BrandMark } from '../auth/AuthGate'
import { supabase } from '../lib/supabase'
import { Link, paths } from '../router'
import { Icon } from './Icon'

export interface Crumb {
  label: string
  to?: string
}

export function AppShell({ session, crumbs, children }: { session: Session | null; crumbs: Crumb[]; children: ReactNode }) {
  return (
    <div className="shell">
      <header className="topbar">
        <Link to={paths.dashboard()} className="brand">
          <BrandMark />
          LabelAI
        </Link>
        <nav className="crumbs" aria-label="Breadcrumb">
          {crumbs.map((c, i) => (
            <span key={i} className="crumb">
              <span className="crumb-sep" aria-hidden="true">
                /
              </span>
              {c.to ? <Link to={c.to}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
            </span>
          ))}
        </nav>
        <div className="topbar-end">
          {apiMode === 'mock' && (
            <span className="mode-badge" title="Data lives in this browser only. Set VITE_API_MODE=http to use the backend.">
              Local demo data
            </span>
          )}
          {session && supabase && (
            <>
              <span className="user-email">{session.user.email}</span>
              <button className="icon-btn" aria-label="Sign out" title="Sign out" onClick={() => supabase?.auth.signOut()}>
                <Icon name="logout" />
              </button>
            </>
          )}
        </div>
      </header>
      <main className="page">{children}</main>
    </div>
  )
}
