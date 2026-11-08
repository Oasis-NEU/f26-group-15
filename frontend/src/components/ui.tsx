import type { ReactNode } from 'react'
import type { ImageStatus } from '../types/annotation'
import { Icon, type IconName } from './Icon'

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <span className="spinner" role="status" aria-label={label} />
}

export function PageState({
  loading,
  error,
  onRetry,
  children,
}: {
  loading: boolean
  error?: Error
  onRetry?: () => void
  children: ReactNode
}) {
  if (error) {
    return (
      <div className="page-state">
        <p className="error-text">{error.message}</p>
        {onRetry && (
          <button className="btn" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    )
  }
  if (loading) {
    return (
      <div className="page-state">
        <Spinner />
      </div>
    )
  }
  return <>{children}</>
}

const STATUS_LABEL: Record<ImageStatus, string> = {
  unlabeled: 'Unlabeled',
  in_progress: 'In progress',
  reviewed: 'Reviewed',
}

export function StatusPill({ status }: { status: ImageStatus }) {
  return <span className={`pill pill-${status}`}>{STATUS_LABEL[status]}</span>
}

export function IconButton({
  icon,
  label,
  onClick,
  active,
  disabled,
  shortcut,
  variant,
}: {
  icon: IconName
  label: string
  onClick?: () => void
  active?: boolean
  disabled?: boolean
  shortcut?: string
  variant?: 'danger' | 'ai'
}) {
  return (
    <button
      type="button"
      className={`icon-btn${active ? ' is-active' : ''}${variant ? ` icon-btn-${variant}` : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={shortcut ? `${label} (${shortcut})` : label}
    >
      <Icon name={icon} />
    </button>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>
}
