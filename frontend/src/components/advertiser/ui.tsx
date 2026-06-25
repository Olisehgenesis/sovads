'use client'

/**
 * Calm advertiser UI primitives.
 *
 * Design rules:
 * - Hairline `#E5E5E5` borders by default. Thick black borders only on the
 *   primary CTA / active states / focused inputs.
 * - No uppercase body text. UPPERCASE reserved for short eyebrows and primary
 *   button labels.
 * - One brutalist hard shadow per visual zone — used here on `<Section emphasis="hero">`
 *   and `<Button intent="primary">` only.
 * - Status badges: tinted bg + colored left bar (not full fill) so a long list
 *   of campaigns doesn't read like a traffic-light wall.
 */

import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from 'react'
import AdvertiserIcon from './AdvertiserIcon'
import type { AdvertiserIconName } from './models'

// ── Section ────────────────────────────────────────────────────────────────

export function Section({
  id,
  title,
  description,
  actions,
  emphasis = 'plain',
  children,
}: {
  id?: string
  title?: string
  description?: string
  actions?: ReactNode
  /** `hero` adds the brutalist hard shadow. Use sparingly (1 per page). */
  emphasis?: 'plain' | 'hero'
  children: ReactNode
}) {
  const shell =
    emphasis === 'hero'
      ? 'bg-white border border-[#2D2D2D] shadow-[4px_4px_0_0_#2D2D2D]'
      : 'bg-white border border-[#E5E5E5]'
  return (
    <section id={id} className={`${shell} scroll-mt-24`}>
      {(title || actions) && (
        <header className="flex flex-col gap-2 px-5 pt-4 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-bold tracking-tight text-[#2D2D2D]">{title}</h2>}
            {description && <p className="mt-0.5 text-[12px] text-[#666666]">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>
      )}
      <div className={title ? 'border-t border-[#EFEFEF] p-5' : 'p-5'}>{children}</div>
    </section>
  )
}

// ── Metric ────────────────────────────────────────────────────────────────

export function Metric({
  label,
  value,
  delta,
  hint,
  loading,
  accent,
}: {
  label: string
  value: ReactNode
  delta?: { value: string; tone: 'up' | 'down' | 'neutral' }
  hint?: string
  loading?: boolean
  /** `hero` makes the number bigger and adds a black left bar. */
  accent?: 'plain' | 'hero'
}) {
  const isHero = accent === 'hero'
  return (
    <div
      className={[
        'bg-white p-4 transition-colors',
        isHero ? 'border-l-[3px] border-l-[#2D2D2D] border-y border-r border-y-[#E5E5E5] border-r-[#E5E5E5]' : 'border border-[#E5E5E5]',
      ].join(' ')}
    >
      <p className="text-[11px] font-medium text-[#666666]">{label}</p>
      {loading ? (
        <div className={`${isHero ? 'h-9 w-28' : 'h-7 w-20'} mt-2 animate-pulse bg-[#EFEFEF]`} />
      ) : (
        <p className={`mt-1 font-bold text-[#2D2D2D] ${isHero ? 'text-[28px] leading-none' : 'text-[22px] leading-none'}`}>{value}</p>
      )}
      {(delta || hint) && (
        <div className="mt-2 flex items-center gap-2 text-[11px]">
          {delta && (
            <span
              className={[
                'inline-flex items-center gap-0.5 font-semibold',
                delta.tone === 'up' ? 'text-[#146C2E]' : delta.tone === 'down' ? 'text-[#8A1F1F]' : 'text-[#666666]',
              ].join(' ')}
            >
              {delta.tone === 'up' ? '▲' : delta.tone === 'down' ? '▼' : '•'} {delta.value}
            </span>
          )}
          {hint && <span className="text-[#999999]">{hint}</span>}
        </div>
      )}
    </div>
  )
}

// ── Status badge ──────────────────────────────────────────────────────────

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

export function StatusBadge({ tone = 'neutral', children }: { tone?: StatusTone; children: ReactNode }) {
  const map: Record<StatusTone, { bg: string; fg: string; bar: string }> = {
    neutral: { bg: '#F4F4F2', fg: '#555555', bar: '#8A8A8A' },
    success: { bg: '#F0FBF3', fg: '#146C2E', bar: '#22C55E' },
    warning: { bg: '#FFF8E5', fg: '#7A5A00', bar: '#F59E0B' },
    danger: { bg: '#FDF1F1', fg: '#8A1F1F', bar: '#EF4444' },
    info: { bg: '#EFF6FF', fg: '#1D4ED8', bar: '#3B82F6' },
  }
  const c = map[tone]
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: c.bg, color: c.fg, borderLeft: `3px solid ${c.bar}` }}
    >
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: 9999, backgroundColor: c.bar }} />
      {children}
    </span>
  )
}

// Back-compat: existing imports still pass `tone` directly
export const StatusPill = StatusBadge

// Centralised mapping from a Campaign's (status, active, paused) tuple to the
// label + badge tone shown in the dashboard. Lives here so the table, card,
// and inline rows all stay in lock-step — drafts read as "Draft" everywhere
// instead of leaking through as "Active" (because `active` was true) or
// "Inactive" (because we hadn't surfaced status at all).
export function getCampaignStatusDisplay(c: {
  active: boolean
  paused?: boolean
  status?: string | null
}): { label: string; tone: StatusTone } {
  if (c.status === 'draft') return { label: 'Draft', tone: 'neutral' }
  if (c.status === 'review') return { label: 'In review', tone: 'info' }
  if (c.status === 'rejected') return { label: 'Rejected', tone: 'danger' }
  if (c.paused) return { label: 'Paused', tone: 'warning' }
  if (c.active) return { label: 'Active', tone: 'success' }
  return { label: 'Inactive', tone: 'danger' }
}

// ── Buttons ───────────────────────────────────────────────────────────────

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  intent?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  icon?: AdvertiserIconName
}

export function Button({ intent = 'secondary', size = 'md', icon, className = '', children, ...rest }: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-1.5 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D2D2D] focus-visible:ring-offset-1'
  const sizing = size === 'sm' ? 'px-2.5 py-1 text-[12px]' : 'px-3.5 py-2 text-[13px]'
  const intentCls = {
    primary: 'bg-[#2D2D2D] text-white border border-[#2D2D2D] hover:bg-[#1F1F1F] shadow-[2px_2px_0_0_#2D2D2D]',
    secondary: 'bg-white text-[#2D2D2D] border border-[#2D2D2D] hover:bg-[#F4F4F2]',
    ghost: 'bg-transparent text-[#2D2D2D] border border-transparent hover:bg-[#F4F4F2]',
    danger: 'bg-white text-[#8A1F1F] border border-[#8A1F1F] hover:bg-[#FDF1F1]',
  }[intent]
  return (
    <button {...rest} className={`${base} ${sizing} ${intentCls} ${className}`}>
      {icon && <AdvertiserIcon name={icon} className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />}
      {children}
    </button>
  )
}

// ── Form fields ───────────────────────────────────────────────────────────

const fieldBase =
  'w-full border border-[#D4D4D2] bg-white px-3 py-2 text-[13px] text-[#2D2D2D] placeholder:text-[#9A9A98] focus:outline-none focus:border-[#2D2D2D] focus:ring-1 focus:ring-[#2D2D2D] transition-colors'

export function Field({
  label,
  hint,
  error,
  children,
  required,
}: {
  label?: string
  hint?: ReactNode
  error?: string | null
  children: ReactNode
  required?: boolean
}) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 flex items-center gap-1 text-[12px] font-medium text-[#333333]">
          {label}
          {required && <span className="text-[#8A1F1F]">*</span>}
        </span>
      )}
      {children}
      {error ? (
        <span className="mt-1 block text-[11px] font-medium text-[#8A1F1F]">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[11px] text-[#888888]">{hint}</span>
      ) : null}
    </label>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${fieldBase} ${props.className ?? ''}`} />
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${fieldBase} resize-none ${props.className ?? ''}`} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${fieldBase} pr-8 ${props.className ?? ''}`} />
}

// ── Inline alert ─────────────────────────────────────────────────────────

export function Alert({
  tone,
  children,
  onDismiss,
}: {
  tone: 'success' | 'error' | 'info' | 'warning'
  children: ReactNode
  onDismiss?: () => void
}) {
  const map = {
    success: { bg: '#F0FBF3', border: '#86EFAC', fg: '#146C2E' },
    error: { bg: '#FDF1F1', border: '#FCA5A5', fg: '#8A1F1F' },
    info: { bg: '#EFF6FF', border: '#93C5FD', fg: '#1D4ED8' },
    warning: { bg: '#FFF8E5', border: '#FCD34D', fg: '#7A5A00' },
  }[tone]
  return (
    <div
      className="flex items-start gap-3 border px-3 py-2.5 text-[12px]"
      style={{ backgroundColor: map.bg, borderColor: map.border, color: map.fg }}
    >
      <span className="flex-1 leading-5">{children}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="opacity-60 hover:opacity-100" aria-label="Dismiss">
          ✕
        </button>
      )}
    </div>
  )
}

// ── Empty state ──────────────────────────────────────────────────────────

export function EmptyState({
  icon = 'campaign',
  title,
  description,
  action,
}: {
  icon?: AdvertiserIconName
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center border border-dashed border-[#D4D4D2] bg-[#FAFAF8] p-10 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center bg-[#EFEDE7] text-[#4A4A4A]">
        <AdvertiserIcon name={icon} className="h-5 w-5" />
      </div>
      <p className="text-[14px] font-semibold text-[#2D2D2D]">{title}</p>
      {description && <p className="mt-1 max-w-md text-[12px] text-[#666666]">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// ── Skeleton ─────────────────────────────────────────────────────────────

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-[#EFEFEF] ${className}`} />
}

// ── Util ─────────────────────────────────────────────────────────────────

export function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
  } catch {
    return value
  }
}

export function formatNumber(n: number) {
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('en').format(n)
}

export function formatPct(n: number, digits = 1) {
  if (!Number.isFinite(n)) return '—'
  return `${n.toFixed(digits)}%`
}

// Back-compat for older imports during migration
export const DashboardCard = Section
export const MetricCard = Metric
export const formatDateLabel = formatDate
