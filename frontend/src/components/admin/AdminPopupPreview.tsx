'use client'

import { useEffect, useMemo } from 'react'
import { toStreamingEmbed } from '@/lib/sdk'

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
 * Clicking the media (or the "Learn more" button for videos / streaming
 * embeds) opens `targetUrl` in a new tab. No impressions or clicks are
 * tracked — this is a preview-only path.
 */
interface AdminPopupPreviewProps {
  campaign: {
    name: string
    description: string
    bannerUrl: string
    mediaType?: 'image' | 'video'
    targetUrl?: string
  } | null
  onClose: () => void
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
          {/* SovAds logo badge */}
          <div
            className="absolute left-3 top-2 flex h-6 w-6 items-center justify-center rounded-[4px] text-[10px] font-bold text-white shadow-[0_2px_4px_rgba(0,0,0,0.1)]"
            style={{
              background:
                'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            }}
            title="SovAds"
          >
            SA
          </div>

          {/* Disclosure label */}
          <div className="absolute left-3 top-9 text-[9px] font-medium uppercase tracking-[0.5px] text-[#999]">
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

          {/* Footer caption — admin-only hint so it's obvious this is not a live ad. */}
          <p className="mt-3 text-center text-[10px] font-medium uppercase tracking-[0.18em] text-[#8E8E93]">
            Preview · no tracking
          </p>
        </div>
      </div>
    </div>
  )
}
