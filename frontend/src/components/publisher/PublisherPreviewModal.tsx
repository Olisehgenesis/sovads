'use client'

import BannerAdPreview from '@/components/ads/BannerAdPreview'

export default function PublisherPreviewModal({
  siteId,
  onClose,
}: {
  siteId: string | null
  onClose: () => void
}) {
  if (!siteId) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-xl rounded-[20px] border border-[#E5E5EA] bg-white p-5 shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8E8E93]">Preview</p>
            <p className="mt-1 text-[14px] font-semibold text-[#1C1C1E]">Live banner render for {siteId}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[#E5E5EA] text-[#1C1C1E] transition-colors hover:bg-[#F2F2F7]"
            aria-label="Close preview"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div className="mt-5 rounded-[16px] border border-dashed border-[#E5E5EA] bg-[#F7F7FB] p-6">
          <p className="mb-4 text-center text-[11px] font-medium uppercase tracking-[0.18em] text-[#8E8E93]">Banner slot</p>
          <div className="flex justify-center">
            <BannerAdPreview siteId={siteId} />
          </div>
        </div>

        <p className="mt-4 text-[12px] leading-5 text-[#8E8E93]">
          This preview uses the selected site ID. If a placeholder appears, there is no active campaign targeting this slot yet.
        </p>
      </div>
    </div>
  )
}
