'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  renderAttachedCtas,
  toStreamingEmbed,
  type AttachedTask,
  type AttachedTaskKind,
} from '@/lib/sdk'

/**
 * Back-office Popup preview.
 *
 * Renders a single, faithful copy of what the SDK `Popup` surface looks like
 * for THIS campaign — no tabs, no other surfaces. We deliberately don't go
 * through the live SDK `Popup.show()` flow because that fetches whatever ad
 * the network decides to serve for the current site, which isn't what an
 * admin clicking "Preview" on a specific row wants to see.
 *
 * Styling mirrors `Popup.renderPopup()` in `sdk/index.ts` (card shape,
 * shadow, logo badge, disclosure label, click-through button) so this
 * preview reads as the actual SDK skin rather than a generic placeholder.
 *
 * Attached CTAs: when `id` is provided we fetch the campaign's CampaignTask
 * rows and mount the SDK's own `renderAttachedCtas({ preview: true })` panel
 * under the media — same component publishers see, with click handlers
 * disabled. That way admins reviewing a campaign see the full surface
 * (banner + CTAs) before they approve, not just the creative.
 *
 * Clicking the media (or the "Learn more" button for videos / streaming
 * embeds) opens `targetUrl` in a new tab. No impressions or clicks are
 * tracked — this is a preview-only path.
 */
interface AdminPopupPreviewProps {
  campaign: {
    id?: string
    name: string
    description: string
    bannerUrl: string
    mediaType?: 'image' | 'video'
    targetUrl?: string
  } | null
  onClose: () => void
}

// SDK's attached-CTA panel only renders these kinds inline (mirrors the
// ATTACHED_TASK_KINDS allowlist used by /api/ads).
const SDK_PANEL_KINDS = new Set<AttachedTaskKind>(['VISIT_URL', 'SIGN_MESSAGE', 'POLL'])
const MAX_ATTACHED_TASKS = 2

interface RawTask {
  id: string
  kind: string
  label: string
  description?: string | null
  config?: unknown
  rewardPoints: number
  rewardGs?: number | null
  active?: boolean
  surface?: string
}

function buildAttachedTask(campaignId: string, t: RawTask): AttachedTask | null {
  if (!SDK_PANEL_KINDS.has(t.kind as AttachedTaskKind)) return null
  const cfg = (t.config ?? {}) as {
    buttonLabel?: string
    url?: string
    minDwellMs?: number
    signMessage?: string
    options?: Array<{ id: string; label: string }>
  }
  const base: AttachedTask = {
    id: t.id,
    campaignId,
    kind: t.kind as AttachedTaskKind,
    label: t.label || '(unlabeled CTA)',
    buttonLabel:
      typeof cfg.buttonLabel === 'string' && cfg.buttonLabel.trim() ? cfg.buttonLabel.trim() : null,
    description: t.description ?? null,
    rewardPoints: t.rewardPoints ?? 0,
    rewardGs: t.rewardGs ?? 0,
  }
  if (t.kind === 'POLL') return { ...base, options: cfg.options ?? [] }
  if (t.kind === 'VISIT_URL') {
    return {
      ...base,
      url: typeof cfg.url === 'string' ? cfg.url : undefined,
      minDwellMs:
        typeof cfg.minDwellMs === 'number' && cfg.minDwellMs > 0 ? cfg.minDwellMs : 3000,
    }
  }
  if (t.kind === 'SIGN_MESSAGE') {
    return { ...base, signMessage: typeof cfg.signMessage === 'string' ? cfg.signMessage : undefined }
  }
  return base
}

export default function AdminPopupPreview({ campaign, onClose }: AdminPopupPreviewProps) {
  // Lock body scroll while open, Escape to dismiss — matches the rest of
  // the admin modal patterns.
  useEffect(() => {
    if (!campaign) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [campaign, onClose])

  const streamingEmbed = useMemo(
    () => (campaign ? toStreamingEmbed(campaign.bannerUrl) : null),
    [campaign],
  )

  // Fetch the campaign's attached CTAs so admins see the same combined
  // surface (banner + CTAs) that real viewers would. We use the existing
  // `/api/campaigns/detail?include=tasks` endpoint which returns full task
  // config (including POLL options, VISIT_URL.url, SIGN_MESSAGE.signMessage).
  const [attachedTasks, setAttachedTasks] = useState<AttachedTask[]>([])
  const campaignId = campaign?.id
  useEffect(() => {
    if (!campaignId) {
      setAttachedTasks([])
      return
    }
    let cancelled = false
    fetch(`/api/campaigns/detail?id=${encodeURIComponent(campaignId)}&include=tasks`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.campaign?.tasks) return
        const raw = (data.campaign.tasks as RawTask[])
          .filter((t) => t.active !== false)
          .filter((t) => (t.surface ?? 'attached') === 'attached')
          .map((t) => buildAttachedTask(campaignId, t))
          .filter((t): t is AttachedTask => t !== null)
          .slice(0, MAX_ATTACHED_TASKS)
        setAttachedTasks(raw)
      })
      .catch(() => {
        if (!cancelled) setAttachedTasks([])
      })
    return () => {
      cancelled = true
    }
  }, [campaignId])

  // Mount the SDK's own attached-CTA panel in preview mode. Same DOM the
  // publisher sees, but with submission disabled. We layer on top of the
  // SDK's preview-mode (which kills all click handlers) so admins can still
  // click VISIT_URL buttons and see where they go — no tracking, no submit,
  // just window.open() to the campaign's target URL in a new tab.
  const ctaHostRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const host = ctaHostRef.current
    if (!host) return
    host.innerHTML = ''
    if (!attachedTasks.length || !campaignId) return
    try {
      renderAttachedCtas({
        container: host,
        tasks: attachedTasks,
        campaignId,
        bannerClickActive: true,
        preview: true,
        layout: 'auto',
      })

      // SDK preview mode strips click handlers; wire admin-only "open target"
      // handlers so the rendered CTA buttons actually navigate. We match
      // rows to tasks by DOM order (renderAttachedCtas appends one row per
      // task in the same order we passed them).
      const panel = host.querySelector('.sovads-cta-panel')
      if (panel) {
        const rows = Array.from(panel.children) as HTMLElement[]
        attachedTasks.forEach((task, i) => {
          const row = rows[i]
          if (!row) return
          if (task.kind !== 'VISIT_URL') return
          const url = task.url
          if (!url) return
          const btn = row.querySelector('button')
          if (!btn) return
          btn.style.cursor = 'pointer'
          btn.removeAttribute('aria-disabled')
          btn.addEventListener('click', (e) => {
            e.preventDefault()
            e.stopPropagation()
            window.open(url, '_blank', 'noopener,noreferrer')
          })
        })
      }
    } catch {
      // Defensive: a malformed task config shouldn't break the admin preview.
    }
    return () => {
      host.innerHTML = ''
    }
  }, [attachedTasks, campaignId])

  if (!campaign) return null

  const isVideo = campaign.mediaType === 'video'
  const useButtonCta = isVideo || !!streamingEmbed
  const target = campaign.targetUrl || '#'

  const openTarget = () => {
    if (target && target !== '#') {
      window.open(target, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />

      {/* Popup card — pinned bottom-right, matching the SDK Popup surface. */}
      <div
        role="dialog"
        aria-modal="false"
        aria-label="Campaign popup preview"
        className="absolute bottom-4 right-4 w-[min(360px,calc(100vw-24px))]"
      >
        <div className="relative rounded-[12px] bg-white p-[14px] shadow-[0_10px_25px_rgba(0,0,0,0.3)]">
          {/* Disclosure label */}
          <div className="absolute left-3 top-3 text-[9px] font-medium uppercase tracking-[0.5px] text-[#999]">
            Sponsored
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="absolute right-[15px] top-[10px] cursor-pointer border-0 bg-transparent text-[24px] leading-none text-[#666]"
          >
            ×
          </button>

          {/* Media */}
          <div className="pt-7">
            {streamingEmbed ? (
              <iframe
                src={streamingEmbed.embedUrl}
                title={campaign.description || campaign.name}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                className="block w-full rounded-[8px]"
                style={{ aspectRatio: '16 / 9', border: 0 }}
              />
            ) : isVideo ? (
              <video
                src={campaign.bannerUrl}
                muted
                autoPlay
                loop
                playsInline
                controls
                className="block h-auto w-full rounded-[8px]"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={campaign.bannerUrl}
                alt={campaign.description || campaign.name}
                onClick={useButtonCta ? undefined : openTarget}
                className={`block h-auto w-full rounded-[8px] ${
                  useButtonCta ? 'cursor-default' : 'cursor-pointer'
                }`}
              />
            )}
          </div>

          {useButtonCta ? (
            <button
              type="button"
              onClick={openTarget}
              className="mt-[10px] w-full cursor-pointer rounded-[6px] border-0 bg-[#111] px-3 py-[10px] text-[12px] font-semibold text-white"
            >
              Learn more
            </button>
          ) : null}

          {/* Attached CTAs — mounted by the SDK in preview mode so this
              matches what publishers see byte-for-byte. */}
          <div ref={ctaHostRef} className="mt-2" />

          {/* Footer caption — admin-only hint so it's obvious this is not a live ad. */}
          <p className="mt-3 text-center text-[10px] font-medium uppercase tracking-[0.18em] text-[#8E8E93]">
            Preview · no tracking
          </p>
        </div>
      </div>
    </div>
  )
}

