'use client'

import { useEffect, useMemo, useState } from 'react'
import AdvertiserIcon from './AdvertiserIcon'
import { toStreamingEmbed, GOOD_DOLLAR_ICON_DATA_URI } from '@/lib/sdk'

/**
 * Campaign preview modal.
 *
 * Renders mock previews of every SDK surface (Banner, Sidebar, BottomBar,
 * Popup, NativeCard, Interstitial, CTA Unit) populated with THIS campaign's
 * creative + copy, so the advertiser can scan how their ad will look across
 * every placement before they publish.
 *
 * We deliberately do NOT route through the live SDK Banner here — that path
 * fetches whatever ad the network decides to serve, which is not what an
 * advertiser wants to see when previewing their own draft. Instead, each
 * surface is a CSS approximation of the runtime SDK styling (border-2 black,
 * tracking, badge palette) so the preview reads as "the actual SDK skin"
 * rather than a generic placeholder. Sizes mirror the IAB presets the SDK
 * ships with.
 */
/** Minimal creative shape consumed by every surface preview. Exported so
 *  other surfaces (e.g. the inline Preview tab in the advertiser shell) can
 *  reuse the same renderers without depending on the modal wrapper. */
export interface PreviewCampaign {
  name: string
  description: string
  bannerUrl: string
  mediaType?: 'image' | 'video'
  targetUrl?: string
  cpc?: number
}

interface CampaignPreviewModalProps {
  campaign: PreviewCampaign | null
  onClose: () => void
}

/** Re-exported so callers can build their own surface tab UI. */
export type PreviewSurfaceId = SurfaceId
export type PreviewDevice = Device

type SurfaceId =
  | 'banner'
  | 'sidebar'
  | 'bottombar'
  | 'popup'
  | 'native'
  | 'interstitial'
  | 'cta'

/** Representative aspect ratio (width / height) per surface, used to size
 *  the bottom thumbnail strip. We deliberately preserve the variance —
 *  banners are long strips, sidebars are tall towers, interstitials are
 *  cinema-frame — so the thumb row doubles as a size legend instead of
 *  flattening every placement into the same rectangle. */
const SURFACES: { id: SurfaceId; label: string; hint: string; aspect: number }[] = [
  { id: 'banner',       label: 'Banner',       hint: 'Leaderboard (728×90) and medium rectangle (300×250).', aspect: 728 / 90 },
  { id: 'sidebar',      label: 'Sidebar',      hint: 'Half-page (300×600) — typical right rail.',           aspect: 300 / 600 },
  { id: 'bottombar',    label: 'Bottom bar',   hint: 'Sticky footer strip — common on mobile.',             aspect: 720 / 64 },
  { id: 'popup',        label: 'Popup',        hint: 'Centered modal opened from a publisher trigger.',     aspect: 480 / 360 },
  { id: 'native',       label: 'Native card',  hint: 'Inline card matching the host site\u2019s feed.',     aspect: 1.0 },
  { id: 'interstitial', label: 'Interstitial', hint: 'Full-screen takeover (skippable after 5s).',          aspect: 960 / 540 },
  { id: 'cta',          label: 'CTA unit',     hint: 'Reward pill that publishers attach to existing ads.', aspect: 320 / 220 },
]

type Device = 'desktop' | 'mobile'

export default function CampaignPreviewModal({ campaign, onClose }: CampaignPreviewModalProps) {
  const [surface, setSurface] = useState<SurfaceId>('banner')
  const [device, setDevice] = useState<Device>('desktop')

  // Lock body scroll while the modal is open; restore on close. Esc also
  // closes so power users don't have to mouse to the X.
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

  if (!campaign) return null

  const current = SURFACES.find((s) => s.id === surface) ?? SURFACES[0]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden border-2 border-black bg-white shadow-[8px_8px_0_0_#000] sm:max-h-[92vh]">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-black bg-white px-3 py-2 sm:gap-3 sm:px-4 sm:py-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[13px] font-black uppercase tracking-tight text-[#2D2D2D] sm:text-[14px]">{campaign.name}</h3>
            <p className="line-clamp-1 text-[11px] text-[#666]">{campaign.description || 'No description'}</p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1">
            <SegToggle
              value={device}
              onChange={setDevice}
              options={[
                { value: 'desktop', label: 'Desktop' },
                { value: 'mobile', label: 'Mobile' },
              ]}
            />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              className="ml-1 inline-flex items-center gap-1 border border-transparent px-2 py-1 text-[10px] font-black uppercase tracking-wider text-[#2D2D2D] hover:bg-[#F5F3F0]"
            >
              <AdvertiserIcon name="delete" className="h-3 w-3" />
              <span className="hidden sm:inline">Close</span>
            </button>
          </div>
        </div>

        {/* Hero — one surface at a time, centered. The old `All` view stacked
         *  7 IAB sizes top-to-bottom which read as visual noise because they
         *  share no rhythm (728×90 → 300×600 → 960×540 is a 30× area swing).
         *  Showing one surface restores focus; the bottom thumbnail strip
         *  promotes the size variance from "layout problem" to "size legend". */}
        <div className="flex-1 overflow-y-auto bg-[#FAFAF8] p-4 sm:p-6">
          <div className="mx-auto max-w-4xl space-y-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#2D2D2D]">{current.label}</p>
              <p className="truncate text-[10px] text-[#888]">{current.hint}</p>
            </div>
            <div className="flex justify-center overflow-x-auto bg-[#F5F3F0] p-4 sm:p-6">
              <SurfacePreview surface={surface} device={device} campaign={campaign} />
            </div>

            {campaign.targetUrl && (
              <div className="border border-[#E5E5E5] bg-white px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#666]">Landing URL</p>
                <p className="mt-1 break-all text-[12px] font-semibold text-[#2D2D2D]">{campaign.targetUrl}</p>
              </div>
            )}

            <p className="border border-dashed border-[#E5E5E5] bg-white px-3 py-2 text-[10px] text-[#888]">
              Visual preview only. Actual rendering may vary by publisher site theme, available reward, and viewer device.
              The reward badge, disclosure label, and CTA buttons are injected by the SDK at runtime — only the creative
              and copy you control are shown above.
            </p>
          </div>
        </div>

        {/* Thumbnail strip — each tile fits the surface's TRUE aspect ratio
         *  inside a uniform 96×48 slot, so banners look long, sidebars look
         *  tall, interstitials look cinematic. That shape variance IS the
         *  signal we want to surface. */}
        <div className="border-t-2 border-black bg-white">
          <div className="overflow-x-auto">
            <div className="flex min-w-max items-end gap-2 px-3 py-3">
              {SURFACES.map((s) => (
                <ThumbButton
                  key={s.id}
                  label={s.label}
                  aspect={s.aspect}
                  campaign={campaign}
                  active={s.id === surface}
                  onClick={() => setSurface(s.id)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ───────── Building blocks ───────── */

/** Thumbnail tile for the bottom surface strip. The outer slot is a fixed
 *  96×48 hit target so the row stays orderly; the INNER rectangle is sized
 *  to the surface's true aspect ratio so the shape itself communicates the
 *  IAB size. The campaign creative fills the inner rectangle. */
function ThumbButton({
  label,
  aspect,
  campaign,
  active,
  onClick,
}: {
  label: string
  aspect: number
  campaign: PreviewCampaign
  active: boolean
  onClick: () => void
}) {
  const slotW = 96
  const slotH = 48
  const slotAspect = slotW / slotH
  // Fit the surface rectangle inside the slot, contain-style. Width-bound
  // when the surface is wider than the slot's ratio, height-bound otherwise.
  const innerW = aspect > slotAspect ? slotW : slotH * aspect
  const innerH = aspect > slotAspect ? slotW / aspect : slotH
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'group flex flex-col items-center gap-1.5 px-1 pb-0.5 pt-1',
        active ? '' : 'opacity-70 hover:opacity-100',
      ].join(' ')}
    >
      <div
        style={{ width: slotW, height: slotH }}
        className={[
          'relative flex items-center justify-center border bg-[#F5F3F0] transition-colors',
          active
            ? 'border-[#2D2D2D] ring-1 ring-[#2D2D2D]'
            : 'border-[#E5E5E5] group-hover:border-[#2D2D2D]',
        ].join(' ')}
      >
        <div
          style={{ width: innerW, height: innerH }}
          className="overflow-hidden border border-[#2D2D2D] bg-white"
        >
          <Creative campaign={campaign} />
        </div>
      </div>
      <span
        className={[
          'whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider',
          active ? 'text-[#2D2D2D]' : 'text-[#888] group-hover:text-[#2D2D2D]',
        ].join(' ')}
      >
        {label}
      </span>
    </button>
  )
}

function SegToggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (next: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="inline-flex border border-[#E5E5E5] bg-white">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={[
            'px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider',
            value === o.value ? 'bg-[#2D2D2D] text-white' : 'bg-white text-[#444] hover:bg-[#F4F4F2]',
          ].join(' ')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ───────── Creative renderer (shared across surfaces) ───────── */

/**
 * Renders the campaign creative (image, video, or streaming-embed iframe)
 * sized to fill its parent. Used by every surface so the same media handling
 * isn't duplicated.
 */
export function Creative({
  campaign,
  className = '',
  cover = true,
}: {
  campaign: PreviewCampaign
  className?: string
  cover?: boolean
}) {
  const streaming = toStreamingEmbed(campaign.bannerUrl)
  const fit = cover ? 'object-cover' : 'object-contain'

  if (streaming) {
    return (
      <iframe
        src={streaming.embedUrl}
        title={campaign.name}
        className={`h-full w-full ${className}`}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    )
  }
  if (campaign.mediaType === 'video') {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video
        src={campaign.bannerUrl}
        className={`h-full w-full ${fit} ${className}`}
        muted
        autoPlay
        loop
        playsInline
      />
    )
  }
  if (!campaign.bannerUrl) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-[#EFEDE7] text-[11px] text-[#888] ${className}`}>
        No creative uploaded
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={campaign.bannerUrl}
      alt={campaign.name}
      className={`h-full w-full ${fit} ${className}`}
    />
  )
}

/* Small reward / disclosure badges the SDK overlays at render time.
   Uses the GoodDollar PNG (inlined as a data URI from the SDK) instead of
   the literal "G$" so the badge reads as the real brand mark. */
function RewardBadge({ amount = '0.5' }: { amount?: string | number } = {}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#2D2D2D] pl-1 pr-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={GOOD_DOLLAR_ICON_DATA_URI}
        alt=""
        width={14}
        height={14}
        className="h-3.5 w-3.5 rounded-full"
      />
      <span>Earn {amount}</span>
    </span>
  )
}
function AdLabel() {
  return (
    <span className="inline-flex items-center bg-white/85 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#666]">
      Ad
    </span>
  )
}

/* ───────── Per-surface previews ───────── */

export function SurfacePreview({
  surface,
  device,
  campaign,
}: {
  surface: PreviewSurfaceId
  device: PreviewDevice
  campaign: PreviewCampaign
}) {
  switch (surface) {
    case 'banner':       return <BannerPreview device={device} campaign={campaign} />
    case 'sidebar':      return <SidebarPreview campaign={campaign} />
    case 'bottombar':    return <BottomBarPreview device={device} campaign={campaign} />
    case 'popup':        return <PopupPreview campaign={campaign} />
    case 'native':       return <NativeCardPreview device={device} campaign={campaign} />
    case 'interstitial': return <InterstitialPreview device={device} campaign={campaign} />
    case 'cta':          return <CtaUnitPreview campaign={campaign} />
  }
}

export function BannerPreview({
  device,
  campaign,
}: { device: PreviewDevice; campaign: PreviewCampaign }) {
  if (device === 'mobile') {
    return (
      <SizeFrame label="320 × 50  (Mobile banner)">
        <div style={{ width: 320, height: 50 }} className="relative overflow-hidden border-2 border-black">
          <Creative campaign={campaign} />
          <div className="absolute right-1 top-1"><AdLabel /></div>
          <div className="absolute bottom-1 left-1"><RewardBadge /></div>
        </div>
      </SizeFrame>
    )
  }
  return (
    <div className="flex flex-wrap items-start gap-6">
      <SizeFrame label="728 × 90  (Leaderboard)">
        <div style={{ width: 728, height: 90 }} className="relative max-w-full overflow-hidden border-2 border-black">
          <Creative campaign={campaign} />
          <div className="absolute right-1 top-1"><AdLabel /></div>
          <div className="absolute bottom-1 left-1"><RewardBadge /></div>
        </div>
      </SizeFrame>
      <SizeFrame label="300 × 250  (Medium rectangle)">
        <div style={{ width: 300, height: 250 }} className="relative overflow-hidden border-2 border-black">
          <Creative campaign={campaign} />
          <div className="absolute right-1 top-1"><AdLabel /></div>
          <div className="absolute bottom-1 left-1"><RewardBadge /></div>
        </div>
      </SizeFrame>
    </div>
  )
}

export function SidebarPreview({ campaign }: { campaign: PreviewCampaign }) {
  return (
    <div className="flex items-start gap-4">
      <div className="hidden flex-1 sm:block">
        <SkeletonRail />
      </div>
      <SizeFrame label="300 × 600  (Half-page)">
        <div style={{ width: 300, height: 600 }} className="relative overflow-hidden border-2 border-black">
          <div className="h-[60%] overflow-hidden">
            <Creative campaign={campaign} />
          </div>
          <div className="flex h-[40%] flex-col justify-between bg-white p-3">
            <div>
              <p className="line-clamp-2 text-[13px] font-bold text-[#2D2D2D]">{campaign.name}</p>
              <p className="mt-1 line-clamp-3 text-[11px] text-[#666]">{campaign.description}</p>
            </div>
            <div className="flex items-center justify-between">
              <RewardBadge />
              <span className="inline-flex items-center bg-[#2D2D2D] px-2 py-1 text-[10px] font-black uppercase tracking-wider text-white">
                Visit →
              </span>
            </div>
          </div>
          <div className="absolute right-1 top-1"><AdLabel /></div>
        </div>
      </SizeFrame>
    </div>
  )
}

export function BottomBarPreview({
  device,
  campaign,
}: { device: PreviewDevice; campaign: PreviewCampaign }) {
  const w = device === 'mobile' ? 360 : 720
  return (
    <SizeFrame label={`${w} × 64  (Sticky footer)`}>
      <div
        style={{ width: w, height: 64 }}
        className="relative flex max-w-full items-center gap-3 overflow-hidden border-2 border-black bg-white px-3"
      >
        <div className="h-12 w-12 flex-shrink-0 overflow-hidden border border-[#E5E5E5] bg-[#EFEDE7]">
          <Creative campaign={campaign} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-bold text-[#2D2D2D]">{campaign.name}</p>
          <p className="truncate text-[10px] text-[#666]">{campaign.description}</p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <RewardBadge />
          <button type="button" className="bg-[#2D2D2D] px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-white">
            Visit
          </button>
          <span className="text-[14px] text-[#999]">×</span>
        </div>
      </div>
    </SizeFrame>
  )
}

export function PopupPreview({ campaign }: { campaign: PreviewCampaign }) {
  const [open, setOpen] = useState(false)

  // Esc closes the launched overlay; locking body scroll isn't needed because
  // the parent modal already locked it.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <SizeFrame label="Centered modal">
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 bg-[#2D2D2D] px-3 py-2 text-[11px] font-black uppercase tracking-wider text-white hover:bg-[#1F1F1F]"
        >
          Launch popup preview
        </button>

        {/* Static inline mock so the layout is visible even without launching. */}
        <div className="relative mx-0 my-2 sm:mx-6 sm:my-6" style={{ width: 480, maxWidth: '100%' }}>
          <div className="absolute -inset-2 bg-black/20 sm:-inset-6 sm:bg-black/40" aria-hidden />
          <div className="relative border-2 border-black bg-white shadow-[6px_6px_0_0_#000]">
            <div className="aspect-video overflow-hidden border-b-2 border-black">
              <Creative campaign={campaign} />
            </div>
            <div className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <h4 className="text-[14px] font-black uppercase tracking-tight text-[#2D2D2D]">{campaign.name}</h4>
                <RewardBadge />
              </div>
              <p className="text-[12px] text-[#666]">{campaign.description}</p>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button" className="border border-[#E5E5E5] px-3 py-1.5 text-[11px] font-semibold text-[#444]">
                  Not now
                </button>
                <button type="button" className="bg-[#2D2D2D] px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-white">
                  Visit &amp; earn
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Real popup overlay — fixed to the viewport, sits above the parent
       *  modal (z-[60] > the modal's z-50). Click backdrop or press Esc to
       *  dismiss. No SDK frequency cap; closes only on user input. */}
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close popup preview"
            className="absolute inset-0 cursor-default bg-black/60"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-[480px] border-2 border-black bg-white shadow-[8px_8px_0_0_#000]"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center border border-[#2D2D2D] bg-white text-[14px] font-bold text-[#2D2D2D] hover:bg-[#F4F4F2]"
            >
              ×
            </button>
            <div className="aspect-video overflow-hidden border-b-2 border-black">
              <Creative campaign={campaign} />
            </div>
            <div className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <h4 className="pr-8 text-[14px] font-black uppercase tracking-tight text-[#2D2D2D]">{campaign.name}</h4>
                <RewardBadge />
              </div>
              <p className="text-[12px] text-[#666]">{campaign.description}</p>
              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="border border-[#E5E5E5] px-3 py-1.5 text-[11px] font-semibold text-[#444] hover:bg-[#F4F4F2]"
                >
                  Not now
                </button>
                <button
                  type="button"
                  className="bg-[#2D2D2D] px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-white"
                >
                  Visit &amp; earn
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </SizeFrame>
  )
}

export function NativeCardPreview({
  device,
  campaign,
}: { device: PreviewDevice; campaign: PreviewCampaign }) {
  const w = device === 'mobile' ? 320 : 480
  return (
    <SizeFrame label="Inline feed card">
      <div style={{ width: w }} className="max-w-full overflow-hidden border border-[#E5E5E5] bg-white">
        <div className="aspect-[16/9] overflow-hidden">
          <Creative campaign={campaign} />
        </div>
        <div className="space-y-2 p-3">
          <div className="flex items-center justify-between">
            <AdLabel />
            <RewardBadge />
          </div>
          <p className="text-[14px] font-semibold text-[#2D2D2D]">{campaign.name}</p>
          <p className="text-[12px] text-[#666]">{campaign.description}</p>
          <button type="button" className="mt-1 w-full bg-[#2D2D2D] px-3 py-2 text-[11px] font-black uppercase tracking-wider text-white">
            Visit →
          </button>
        </div>
      </div>
    </SizeFrame>
  )
}

export function InterstitialPreview({
  device,
  campaign,
}: { device: PreviewDevice; campaign: PreviewCampaign }) {
  const isMobile = device === 'mobile'
  return (
    <SizeFrame label={isMobile ? 'Mobile takeover (390 × 720)' : 'Desktop takeover (960 × 540)'}>
      <div
        style={isMobile ? { width: 390, height: 720 } : { width: 960, height: 540 }}
        className="relative max-w-full overflow-hidden border-2 border-black bg-black"
      >
        <Creative campaign={campaign} cover />
        <div className="absolute right-3 top-3 flex items-center gap-2">
          <AdLabel />
          <span className="rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-semibold text-[#444]">
            Skip in 5s
          </span>
        </div>
        <div className="absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-black/80 to-transparent p-4 text-white">
          <p className="text-[16px] font-black uppercase tracking-tight">{campaign.name}</p>
          <p className="line-clamp-2 text-[12px] text-white/85">{campaign.description}</p>
          <div className="flex items-center gap-2 pt-1">
            <RewardBadge />
            <button type="button" className="bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-black">
              Visit & earn
            </button>
          </div>
        </div>
      </div>
    </SizeFrame>
  )
}

export function CtaUnitPreview({ campaign }: { campaign: PreviewCampaign }) {
  return (
    <SizeFrame label="CTA pill (attaches to any creative)">
      <div className="space-y-1.5">
        <div style={{ width: 320, height: 180 }} className="relative overflow-hidden border-2 border-black">
          <Creative campaign={campaign} />
          <div className="absolute right-1 top-1"><AdLabel /></div>
        </div>
        <div
          className="flex items-center justify-between border-2 border-black bg-white px-2.5 py-1.5"
          style={{ width: 320 }}
        >
          <p className="flex items-center gap-1 truncate text-[11px] font-semibold text-[#2D2D2D]">
            <span>Visit & earn</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={GOOD_DOLLAR_ICON_DATA_URI} alt="" width={12} height={12} className="h-3 w-3 rounded-full" />
          </p>
          <RewardBadge />
        </div>
      </div>
    </SizeFrame>
  )
}

/* ───────── Helpers ───────── */

function SizeFrame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <figure className="inline-block">
      {children}
      <figcaption className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[#888]">{label}</figcaption>
    </figure>
  )
}

function SkeletonRail() {
  // Suggests the publisher article column next to the sidebar ad.
  const rows = useMemo(() => [60, 90, 75, 55, 80, 70, 95, 65, 80, 50], [])
  return (
    <div className="space-y-2 pr-2 opacity-60">
      <div className="h-5 w-3/5 bg-[#E5E5E5]" />
      <div className="h-32 w-full bg-[#E5E5E5]" />
      {rows.map((w, i) => (
        <div key={i} className="h-2 bg-[#E5E5E5]" style={{ width: `${w}%` }} />
      ))}
    </div>
  )
}