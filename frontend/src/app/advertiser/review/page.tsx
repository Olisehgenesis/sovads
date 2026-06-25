'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'

import WalletButton from '@/components/WalletButton'
import {
  Alert,
  Button,
  EmptyState,
  Section,
  Skeleton,
  StatusBadge,
  type StatusTone,
} from '@/components/advertiser/ui'
import { CtaPreview } from '@/components/advertiser/CtaPreview'

/* ────────────────────────────────────────────────────────────────────────── */
/* Types                                                                      */
/* ────────────────────────────────────────────────────────────────────────── */

type ReviewStatus = 'awaiting_review' | 'verified' | 'paid' | 'pending' | 'rejected'

interface ReviewItem {
  id: string
  wallet: string | null
  fingerprint: string
  proof: unknown
  status: ReviewStatus
  createdAt: string
  verifiedAt: string | null
  error: string | null
  task: {
    id: string
    label: string
    kind: string
    verifier: string
    rewardPoints: number
    rewardGs: number | null
    config: Record<string, unknown> | null
    campaignId: string
    campaignName: string | null
  }
}

interface ReviewResponse {
  items: ReviewItem[]
  total: number
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Helpers                                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

const STATUS_TABS: { key: ReviewStatus; label: string }[] = [
  { key: 'awaiting_review', label: 'Awaiting' },
  { key: 'verified', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
]

function statusTone(s: ReviewStatus): StatusTone {
  if (s === 'awaiting_review') return 'warning'
  if (s === 'rejected') return 'danger'
  if (s === 'verified' || s === 'paid' || s === 'pending') return 'success'
  return 'neutral'
}

function shortWallet(w: string | null) {
  if (!w) return '—'
  return `${w.slice(0, 6)}…${w.slice(-4)}`
}

function relTime(iso: string) {
  const d = new Date(iso).getTime()
  const diff = Date.now() - d
  const m = Math.round(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.round(h / 24)
  return `${days}d ago`
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Page                                                                       */
/* ────────────────────────────────────────────────────────────────────────── */

export default function AdvertiserReviewPage() {
  const { address, isConnected } = useAccount()

  const [statusTab, setStatusTab] = useState<ReviewStatus>('awaiting_review')
  const [items, setItems] = useState<ReviewItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [rejectNote, setRejectNote] = useState<Record<string, string>>({})

  const refresh = useCallback(async () => {
    if (!address) return
    setIsLoading(true)
    setLoadError(null)
    try {
      const url = `/api/advertiser/review?wallet=${address}&status=${statusTab}&limit=100`
      const res = await fetch(url, { cache: 'no-store' })
      const data = (await res.json()) as ReviewResponse | { error: string }
      if (!res.ok) {
        throw new Error(('error' in data && data.error) || 'failed to load review queue')
      }
      setItems((data as ReviewResponse).items)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'failed to load review queue')
      setItems([])
    } finally {
      setIsLoading(false)
    }
  }, [address, statusTab])

  useEffect(() => {
    refresh()
  }, [refresh])

  const onAction = useCallback(
    async (item: ReviewItem, action: 'approve' | 'reject') => {
      if (!address) return
      setActingId(item.id)
      setFeedback(null)
      try {
        const res = await fetch('/api/advertiser/review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet: address,
            completionId: item.id,
            action,
            note: action === 'reject' ? rejectNote[item.id] || '' : undefined,
          }),
        })
        const data = await res.json().catch(() => ({} as Record<string, unknown>))
        if (!res.ok) {
          throw new Error((data && (data.error as string)) || `${action} failed`)
        }
        if (action === 'approve') {
          const awarded = (data?.awarded ?? {}) as {
            points?: number
            gs?: number
            bonusPointsInLieuOfGs?: number
          }
          const points = awarded.points ?? 0
          const gs = awarded.gs ?? 0
          const bonus = awarded.bonusPointsInLieuOfGs ?? 0
          const signErr = typeof data?.signError === 'string' ? (data.signError as string) : ''
          const gsTxt = gs > 0 ? ` + ${gs} G$ signed claim` : ''
          const bonusTxt =
            bonus > 0
              ? signErr
                ? ` · G$ payout failed (${signErr}) — credited ${bonus} bonus pts instead`
                : ` · G$ unavailable — credited ${bonus} bonus pts instead`
              : ''
          setFeedback({
            tone: 'success',
            text: `Approved · awarded ${points} pts${gsTxt}${bonusTxt}.`,
          })
        } else {
          setFeedback({ tone: 'success', text: 'Rejected. Viewer is notified the next time they refresh.' })
        }
        // Optimistically drop from current list (it no longer matches the filter)
        setItems((prev) => prev.filter((i) => i.id !== item.id))
      } catch (err) {
        setFeedback({
          tone: 'error',
          text: err instanceof Error ? err.message : `${action} failed`,
        })
      } finally {
        setActingId(null)
      }
    },
    [address, rejectNote]
  )

  /* ────────────────────────────────────────────────────────────────────── */

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[#F5F3F0] flex items-center justify-center p-6">
        <div className="w-full max-w-md border border-[#2D2D2D] bg-white p-8 shadow-[6px_6px_0_0_#2D2D2D] text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#888]">Review</p>
          <h1 className="mt-1 text-[20px] font-bold tracking-tight text-[#2D2D2D]">Connect to review CTAs</h1>
          <p className="mt-2 text-[12px] text-[#666]">
            Manual CTA submissions land here. Approve to pay, reject with a reason.
          </p>
          <div className="mt-4">
            <WalletButton />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F5F3F0]">
      <div className="mx-auto max-w-screen-lg px-4 py-6 lg:py-10">
        {/* Header */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#888]">Workspace</p>
            <h1 className="mt-0.5 text-[22px] font-bold tracking-tight text-[#2D2D2D]">CTA review</h1>
            <p className="mt-1 text-[12px] text-[#666] max-w-prose">
              Submissions with the MANUAL verifier wait here for your call. Approving awards points
              immediately, and if the CTA pays G$ a single-use claim is signed for the viewer.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/advertiser"
              className="inline-flex items-center gap-1.5 border border-[#E5E5E5] bg-white px-3 py-2 text-[12px] font-medium text-[#444] hover:bg-[#F4F4F2]"
            >
              ← Back to dashboard
            </Link>
            <Button intent="secondary" size="sm" onClick={refresh} icon="rotate">
              Refresh
            </Button>
          </div>
        </div>

        {feedback && (
          <div className="mb-4">
            <Alert tone={feedback.tone} onDismiss={() => setFeedback(null)}>
              {feedback.text}
            </Alert>
          </div>
        )}

        {/* Status tabs */}
        <div className="mb-4 flex gap-1 overflow-x-auto pb-1">
          {STATUS_TABS.map((tab) => {
            const isActive = tab.key === statusTab
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusTab(tab.key)}
                className={[
                  'inline-flex items-center gap-1.5 whitespace-nowrap border px-3 py-1.5 text-[12px] font-medium transition-colors',
                  isActive
                    ? 'border-[#2D2D2D] bg-[#2D2D2D] text-white'
                    : 'border-[#E5E5E5] bg-white text-[#444] hover:bg-[#F4F4F2]',
                ].join(' ')}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* List */}
        <Section
          title={`${STATUS_TABS.find((t) => t.key === statusTab)?.label ?? ''} (${items.length})`}
          description={
            statusTab === 'awaiting_review'
              ? 'Decide each one. Rewards are paid out only after approval.'
              : statusTab === 'verified'
                ? 'Recent approvals. Points already awarded.'
                : 'Recent rejections.'
          }
        >
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : loadError ? (
            <Alert tone="error">{loadError}</Alert>
          ) : items.length === 0 ? (
            <EmptyState
              title="Nothing here"
              description={
                statusTab === 'awaiting_review'
                  ? 'When a viewer completes a MANUAL CTA, it shows up here for review.'
                  : 'No items in this status yet.'
              }
            />
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <ReviewRow
                  key={item.id}
                  item={item}
                  isActing={actingId === item.id}
                  rejectNote={rejectNote[item.id] || ''}
                  onRejectNoteChange={(v) => setRejectNote((prev) => ({ ...prev, [item.id]: v }))}
                  onApprove={() => onAction(item, 'approve')}
                  onReject={() => onAction(item, 'reject')}
                />
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Row                                                                        */
/* ────────────────────────────────────────────────────────────────────────── */

function ReviewRow({
  item,
  isActing,
  rejectNote,
  onRejectNoteChange,
  onApprove,
  onReject,
}: {
  item: ReviewItem
  isActing: boolean
  rejectNote: string
  onRejectNoteChange: (v: string) => void
  onApprove: () => void
  onReject: () => void
}) {
  const isPending = item.status === 'awaiting_review'
  const proof = item.proof as Record<string, unknown> | null

  const proofSummary = useMemo(() => {
    if (!proof || typeof proof !== 'object') return null
    const parts: { label: string; value: string }[] = []
    const candidates: [string, string][] = [
      ['answer', 'Answer'],
      ['message', 'Message'],
      ['signature', 'Signature'],
      ['txHash', 'Tx hash'],
      ['externalRef', 'External ref'],
      ['dwellMs', 'Dwell (ms)'],
    ]
    for (const [k, label] of candidates) {
      const v = (proof as Record<string, unknown>)[k]
      if (v != null && v !== '') {
        const s = typeof v === 'string' ? v : String(v)
        parts.push({ label, value: s.length > 80 ? `${s.slice(0, 80)}…` : s })
      }
    }
    return parts.length ? parts : null
  }, [proof])

  const cfg = (item.task.config || {}) as Record<string, unknown>
  const taskUrl = typeof cfg.url === 'string' ? cfg.url : null
  const buttonLabel = typeof cfg.buttonLabel === 'string' ? cfg.buttonLabel : null
  const pollOptions = useMemo(() => {
    const raw = (cfg as { options?: unknown }).options
    if (!Array.isArray(raw)) return null
    return raw
      .map((o): { id: string; label: string } | null => {
        if (!o || typeof o !== 'object') return null
        const obj = o as Record<string, unknown>
        const id = typeof obj.id === 'string' ? obj.id : null
        const label = typeof obj.label === 'string' ? obj.label : null
        if (!id || !label) return null
        return { id, label }
      })
      .filter((o): o is { id: string; label: string } => o !== null)
  }, [cfg])

  return (
    <li className="border border-[#E5E5E5] bg-white">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={statusTone(item.status)}>{item.status.replace('_', ' ')}</StatusBadge>
            <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#888]">{item.task.kind}</span>
            <span className="text-[11px] text-[#888]">· {relTime(item.createdAt)}</span>
          </div>

          <h3 className="mt-1.5 text-[14px] font-semibold tracking-tight text-[#2D2D2D]">
            {item.task.label || '(unlabeled CTA)'}
          </h3>
          <p className="text-[11px] text-[#888]">
            in{' '}
            <Link
              href={`/advertiser/ctas?campaignId=${item.task.campaignId}`}
              className="font-medium text-[#2D2D2D] hover:underline"
            >
              {item.task.campaignName || item.task.campaignId.slice(0, 8)}
            </Link>
            {' · '}reward {item.task.rewardPoints} pts
            {item.task.rewardGs ? ` + ${item.task.rewardGs} G$` : ''}
          </p>

          {/* What the viewer actually saw on the banner. */}
          <div className="mt-3 max-w-xs">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.1em] text-[#888]">
              What the viewer saw
            </p>
            <CtaPreview
              kind={item.task.kind}
              label={item.task.label}
              buttonLabel={buttonLabel}
              rewardPoints={item.task.rewardPoints}
              rewardGs={item.task.rewardGs}
              options={pollOptions}
            />
          </div>

          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-[12px] text-[#444] sm:grid-cols-2">
            <div className="flex gap-2">
              <dt className="font-medium text-[#666]">Wallet</dt>
              <dd className="font-mono text-[#2D2D2D]">{shortWallet(item.wallet)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-medium text-[#666]">Fingerprint</dt>
              <dd className="font-mono text-[#2D2D2D] truncate">{item.fingerprint.slice(0, 16)}…</dd>
            </div>
            {buttonLabel && (
              <div className="flex gap-2">
                <dt className="font-medium text-[#666]">Button</dt>
                <dd className="text-[#2D2D2D]">{buttonLabel}</dd>
              </div>
            )}
            {taskUrl && (
              <div className="flex gap-2 sm:col-span-2 min-w-0">
                <dt className="font-medium text-[#666]">Target</dt>
                <dd className="min-w-0 truncate">
                  <a
                    href={taskUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-[#2D2D2D] underline hover:text-[#1F1F1F]"
                  >
                    {taskUrl}
                  </a>
                </dd>
              </div>
            )}
          </dl>

          {proofSummary && (
            <div className="mt-3 border border-[#EFEFEF] bg-[#FAFAF8] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#888]">Submitted proof</p>
              <dl className="mt-1.5 space-y-1 text-[12px] text-[#333]">
                {proofSummary.map((p) => (
                  <div key={p.label} className="flex gap-2">
                    <dt className="w-28 flex-shrink-0 font-medium text-[#666]">{p.label}</dt>
                    <dd className="min-w-0 break-words text-[#2D2D2D]">{p.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {item.error && (
            <p className="mt-2 text-[11px] text-[#8A1F1F]">Last error: {item.error}</p>
          )}
        </div>

        {/* Actions */}
        {isPending ? (
          <div className="flex w-full flex-col gap-2 sm:w-[220px] sm:flex-shrink-0">
            <Button intent="primary" size="sm" onClick={onApprove} disabled={isActing}>
              {isActing ? 'Working…' : 'Approve & pay'}
            </Button>
            <textarea
              value={rejectNote}
              onChange={(e) => onRejectNoteChange(e.target.value)}
              placeholder="Reason (optional)"
              rows={2}
              className="w-full border border-[#E5E5E5] bg-white px-2 py-1.5 text-[12px] text-[#2D2D2D] placeholder:text-[#999] focus:border-[#2D2D2D] focus:outline-none"
            />
            <Button intent="danger" size="sm" onClick={onReject} disabled={isActing}>
              Reject
            </Button>
          </div>
        ) : (
          <div className="text-[11px] text-[#888] sm:w-[180px] sm:flex-shrink-0 sm:text-right">
            {item.verifiedAt ? `Decided ${relTime(item.verifiedAt)}` : null}
          </div>
        )}
      </div>
    </li>
  )
}
