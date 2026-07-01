'use client'

/**
 * <CtaPreview>
 *
 * Pixel-exact preview of the SDK's attached-CTA panel.
 *
 * Implementation: imports the SDK's own `renderAttachedCtas()` and mounts it
 * into a div ref in `preview` mode (no click handlers, no submission). This
 * guarantees the create-campaign rail and the advertiser review queue render
 * identically to what real viewers see — any future styling change in
 * sdk/index.ts automatically propagates here with no extra work.
 */

import { useEffect, useRef } from 'react'
import { renderAttachedCtas, type AttachedTask, type AttachedTaskKind } from '@/lib/sdk'

export interface CtaPreviewProps {
  kind: string
  label: string
  /** Optional override for the primary-button text. Falls back to a kind default. */
  buttonLabel?: string | null
  description?: string | null
  rewardPoints: number
  rewardGs?: number | null
  /** Required for POLL / QUIZ — rendered as a Kahoot-style colored tile grid. */
  options?: Array<{ id: string; label: string }> | null
  /** Replaces "+N G$" with "+N pts*" — used when campaign budget is exhausted. */
  bannerClickActive?: boolean
  /** Render in overlay mode (absolute, on top of a banner). The host element
   *  fills its parent so the panel positions over the banner image. The
   *  parent must be `position:relative`. POLL / QUIZ kinds use this. */
  overlay?: boolean
}

// The SDK panel knows how to render these kinds inline. Anything else
// (FEEDBACK / SURVEY / STAKE_GS / CONTRACT_CALL / SOCIAL_FOLLOW) is shown
// via a small fallback chip — those flows run via mountUnit() in production,
// not the attached-CTA panel.
const SUPPORTED: Record<string, AttachedTaskKind> = {
  VISIT_URL: 'VISIT_URL',
  SIGN_MESSAGE: 'SIGN_MESSAGE',
  POLL: 'POLL',
  QUIZ: 'QUIZ',
}

export function CtaPreview(props: CtaPreviewProps) {
  const {
    kind,
    label,
    buttonLabel,
    description,
    rewardPoints,
    rewardGs,
    options,
    bannerClickActive = true,
    overlay = false,
  } = props

  const containerRef = useRef<HTMLDivElement | null>(null)
  const sdkKind = SUPPORTED[kind]

  useEffect(() => {
    if (!sdkKind || !containerRef.current) return
    const host = containerRef.current
    host.innerHTML = '' // clear previous render before re-mounting

    const task: AttachedTask = {
      id: 'preview-task',
      campaignId: 'preview-campaign',
      kind: sdkKind,
      label: label || '(unlabeled CTA)',
      buttonLabel: buttonLabel?.trim() || null,
      description: description?.trim() || null,
      rewardPoints,
      rewardGs: rewardGs ?? 0,
      url: sdkKind === 'VISIT_URL' ? 'https://example.com' : undefined,
      minDwellMs: 3000,
      signMessage: sdkKind === 'SIGN_MESSAGE' ? 'Preview message' : undefined,
      options: sdkKind === 'POLL' || sdkKind === 'QUIZ' ? (options ?? []) : undefined,
    }

    try {
      renderAttachedCtas({
        container: host,
        tasks: [task],
        campaignId: 'preview-campaign',
        bannerClickActive,
        preview: true,
        overlay,
      })
    } catch {
      // Defensive: a malformed task config shouldn't break the create page.
    }

    return () => {
      host.innerHTML = ''
    }
  }, [sdkKind, label, buttonLabel, description, rewardPoints, rewardGs, options, bannerClickActive, overlay])

  // Unsupported kinds: show a small explanatory chip instead of the panel.
  if (!sdkKind) {
    const totalReward = rewardPoints + (rewardGs ?? 0)
    return (
      <div className="border border-dashed border-[#E5E5E5] bg-[#FAFAF8] p-2.5 text-[11px] text-[#666]">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-semibold text-[#2D2D2D]">{label || '(unlabeled CTA)'}</span>
          <span className="flex flex-shrink-0 items-center gap-1 rounded-full border border-[#2D2D2D] bg-[#F5F3F0] px-2 py-[2px] text-[10px] font-bold text-[#2D2D2D]">
            +{totalReward}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/6961.png" alt="G$" className="h-3 w-3 object-contain" />
          </span>
        </div>
        <p className="mt-1 text-[10px] text-[#888]">
          {kind} runs in a dedicated unit, not attached to the banner.
        </p>
      </div>
    )
  }

  // Overlay mode: host element fills its (position:relative) parent so the
  // renderAttachedCtas panel’s `position:absolute; bottom:0` lines up with
  // the banner image. Default (inline) mode lets the host size itself.
  if (overlay) {
    return (
      <div
        ref={containerRef}
        data-cta-preview-kind={kind}
        data-cta-preview-overlay="1"
        className="pointer-events-none absolute inset-0"
      />
    )
  }
  return <div ref={containerRef} data-cta-preview-kind={kind} />
}

export default CtaPreview
