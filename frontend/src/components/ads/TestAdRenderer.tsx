'use client'

/**
 * TestAdRenderer
 *
 * Pure visual mock of how an ad will appear to publishers. Takes campaign
 * data + tasks as props (NOT from the live SDK / /api/ads endpoint), so it
 * works for drafts that aren't on-chain yet.
 *
 * Renders the three placements at canonical sizes:
 *   banner  → 728x90  (also 320x50 mobile, 970x250 wide)
 *   sidebar → 300x250 (also 300x600 tall)
 *   popup   → 360x120 (also 320x100 mobile)
 *
 * A small "TEST" badge is overlaid in the top-right so it can't be confused
 * with a live render.
 */

export type TestPlacement = 'banner' | 'sidebar' | 'popup'

export interface TestAdData {
  name: string
  description?: string
  bannerUrl: string
  targetUrl?: string
  mediaType?: 'image' | 'video'
}

export interface TestTask {
  id?: string
  kind: string
  label: string
  verifier: string
  rewardPoints?: number | null
  rewardGs?: number | null
}

interface TestAdRendererProps {
  ad: TestAdData
  tasks?: TestTask[]
  placement?: TestPlacement
  /** Override the default size for the placement (e.g. '970x250'). */
  size?: string
  /** Hide the "TEST" badge — only useful for screenshots. Default false. */
  hideTestBadge?: boolean
  className?: string
}

const DEFAULT_SIZE: Record<TestPlacement, string> = {
  banner: '728x90',
  sidebar: '300x250',
  popup: '360x120',
}

const parseSize = (size: string): { w: number; h: number } => {
  const [w, h] = size.split('x').map((n) => Number(n) || 0)
  return { w: w > 0 ? w : 728, h: h > 0 ? h : 90 }
}

function TestBadge() {
  return (
    <div
      className="absolute top-1 right-1 z-10 text-[8px] font-black uppercase tracking-widest text-white bg-black px-1.5 py-0.5"
      style={{ letterSpacing: '0.15em' }}
    >
      Test
    </div>
  )
}

function CtaStrip({ tasks }: { tasks: TestTask[] }) {
  if (!tasks || tasks.length === 0) return null
  return (
    <div className="absolute bottom-1 left-1 right-1 flex gap-1 overflow-x-auto z-10">
      {tasks.slice(0, 3).map((t, i) => (
        <span
          key={t.id || i}
          className="inline-flex items-center gap-1 bg-white/95 border border-black px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider whitespace-nowrap"
        >
          {t.label} <span aria-hidden>↗</span>
        </span>
      ))}
    </div>
  )
}

// ─── Banner ──────────────────────────────────────────────────────────────────
function BannerMock({ ad, tasks, size, hideTestBadge }: { ad: TestAdData; tasks: TestTask[]; size: string; hideTestBadge?: boolean }) {
  const { w, h } = parseSize(size)
  const isMedia = !!ad.bannerUrl
  return (
    <div
      className="relative border-2 border-black bg-black overflow-hidden"
      style={{ width: w, height: h, maxWidth: '100%' }}
    >
      {!hideTestBadge && <TestBadge />}
      {isMedia ? (
        ad.mediaType === 'video' ? (
          <video src={ad.bannerUrl} className="w-full h-full object-cover" autoPlay muted loop playsInline />
        ) : (
          <img src={ad.bannerUrl} alt={ad.name} className="w-full h-full object-cover" />
        )
      ) : (
        <div className="w-full h-full flex items-center justify-center text-white text-[12px] font-black uppercase tracking-widest">
          {ad.name || 'No creative'}
        </div>
      )}
      <CtaStrip tasks={tasks} />
    </div>
  )
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────
function SidebarMock({ ad, tasks, size, hideTestBadge }: { ad: TestAdData; tasks: TestTask[]; size: string; hideTestBadge?: boolean }) {
  const { w, h } = parseSize(size)
  const hasMedia = !!ad.bannerUrl
  // When the advertiser supplied a banner image, the image *is* the creative
  // — redundantly stacking the campaign name and description below it just
  // wastes vertical space (and competes with the image for attention). We
  // collapse the text panel and let the image fill the card, keeping only
  // the CTA strip visible. Without an image we fall back to today's layout
  // so an advertiser who skipped the upload still gets a legible preview.
  const mediaHeight = hasMedia
    ? (tasks.length > 0 ? Math.floor(h * 0.78) : h)
    : Math.floor(h * 0.55)
  return (
    <div
      className="relative border-2 border-black bg-white overflow-hidden flex flex-col"
      style={{ width: w, height: h, maxWidth: '100%' }}
    >
      {!hideTestBadge && <TestBadge />}
      <div className="relative bg-black" style={{ height: mediaHeight }}>
        {ad.bannerUrl ? (
          ad.mediaType === 'video' ? (
            <video src={ad.bannerUrl} className="w-full h-full object-cover" autoPlay muted loop playsInline />
          ) : (
            <img src={ad.bannerUrl} alt={ad.name} className="w-full h-full object-cover" />
          )
        ) : null}
      </div>
      {!hasMedia && (
        <div className="flex-1 p-2 flex flex-col justify-between min-h-0">
          <div className="min-h-0">
            <p className="text-[10px] font-black uppercase tracking-tight text-black truncate">{ad.name}</p>
            {ad.description && (
              <p className="text-[9px] text-[#666666] mt-0.5 leading-tight line-clamp-2">{ad.description}</p>
            )}
          </div>
          {tasks.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {tasks.slice(0, 2).map((t, i) => (
                <span
                  key={t.id || i}
                  className="inline-flex items-center gap-0.5 border border-black px-1 py-0.5 text-[8px] font-black uppercase tracking-wider"
                >
                  {t.label} <span aria-hidden>↗</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {hasMedia && tasks.length > 0 && (
        // CTA-only footer when the image owns the surface. Keeps the same
        // visual treatment as the in-text strip so previews stay consistent.
        <div className="flex-1 p-2 flex flex-wrap items-center gap-1 min-h-0">
          {tasks.slice(0, 2).map((t, i) => (
            <span
              key={t.id || i}
              className="inline-flex items-center gap-0.5 border border-black px-1 py-0.5 text-[8px] font-black uppercase tracking-wider"
            >
              {t.label} <span aria-hidden>↗</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Popup ───────────────────────────────────────────────────────────────────
function PopupMock({ ad, tasks, size, hideTestBadge }: { ad: TestAdData; tasks: TestTask[]; size: string; hideTestBadge?: boolean }) {
  const { w, h } = parseSize(size)
  const hasMedia = !!ad.bannerUrl
  // Same rule as Sidebar: when the advertiser uploaded a banner, the image
  // carries the message and the name/description text becomes redundant
  // chrome. We let the image span the full popup and pin CTAs to the
  // bottom edge. Without media we keep the legacy split-pane layout.
  if (hasMedia) {
    return (
      <div
        className="relative border-2 border-black bg-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden flex flex-col"
        style={{ width: w, height: h, maxWidth: '100%' }}
      >
        {!hideTestBadge && <TestBadge />}
        <div className="relative bg-black flex-1 min-h-0">
          {ad.mediaType === 'video' ? (
            <video src={ad.bannerUrl} className="w-full h-full object-cover" autoPlay muted loop playsInline />
          ) : (
            <img src={ad.bannerUrl} alt={ad.name} className="w-full h-full object-cover" />
          )}
        </div>
        {tasks.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 bg-white px-2 py-1.5 border-t-2 border-black">
            {tasks.slice(0, 2).map((t, i) => (
              <span
                key={t.id || i}
                className="inline-flex items-center gap-0.5 border border-black px-1 py-0.5 text-[8px] font-black uppercase tracking-wider"
              >
                {t.label} <span aria-hidden>↗</span>
              </span>
            ))}
          </div>
        )}
      </div>
    )
  }
  return (
    <div
      className="relative border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden flex"
      style={{ width: w, height: h, maxWidth: '100%' }}
    >
      {!hideTestBadge && <TestBadge />}
      <div className="relative bg-black flex-none" style={{ width: h }} />
      <div className="flex-1 min-w-0 p-2 flex flex-col justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-tight text-black truncate">{ad.name}</p>
          {ad.description && (
            <p className="text-[9px] text-[#666666] mt-0.5 leading-tight line-clamp-2">{ad.description}</p>
          )}
        </div>
        {tasks.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {tasks.slice(0, 2).map((t, i) => (
              <span
                key={t.id || i}
                className="inline-flex items-center gap-0.5 border border-black px-1 py-0.5 text-[8px] font-black uppercase tracking-wider"
              >
                {t.label} <span aria-hidden>↗</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function TestAdRenderer({
  ad,
  tasks = [],
  placement = 'banner',
  size,
  hideTestBadge,
  className,
}: TestAdRendererProps) {
  const effectiveSize = size || DEFAULT_SIZE[placement]
  const Inner =
    placement === 'banner' ? BannerMock : placement === 'sidebar' ? SidebarMock : PopupMock
  return (
    <div className={className} data-testid={`test-ad-${placement}`}>
      <Inner ad={ad} tasks={tasks} size={effectiveSize} hideTestBadge={hideTestBadge} />
    </div>
  )
}
