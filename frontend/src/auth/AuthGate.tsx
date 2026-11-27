import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { Spinner } from '../components/ui'

/**
 * Shows the sign-in screen until there is a Supabase session.
 * When Supabase env vars are not set, renders the app directly (dev mode).
 */
export function AuthGate({ children }: { children: (session: Session | null) => ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!supabase)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!ready) {
    return (
      <div className="page-state full">
        <Spinner />
      </div>
    )
  }
  if (supabase && !session) return <AuthPage />
  return <>{children(session)}</>
}

function AuthPage() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setMessage(null)
    const { error } =
      mode === 'sign-in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })
    setBusy(false)
    if (error) setMessage({ kind: 'error', text: error.message })
    else if (mode === 'sign-up') setMessage({ kind: 'info', text: 'Check your email to confirm your account, then sign in.' })
  }

  return (
    <main className="auth">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand brand-lg">
          <BrandMark />
          LabelAI
        </div>
        <h1>{mode === 'sign-in' ? 'Sign in' : 'Create an account'}</h1>
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {message && <p className={message.kind === 'error' ? 'error-text' : 'info-text'}>{message.text}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? <Spinner /> : mode === 'sign-in' ? 'Sign in' : 'Create account'}
        </button>
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')
            setMessage(null)
          }}
        >
          {mode === 'sign-in' ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </button>
      </form>
    </main>
  )
}

/** Crosshair in a rounded square: an annotation reticle. */
export function BrandMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 6.5v4M12 13.5v4M6.5 12h4M13.5 12h4" stroke="var(--ai)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
