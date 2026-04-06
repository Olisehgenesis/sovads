'use client'

import { useState, useEffect } from 'react'
import { Banner } from '@/lib/sdk'
import { getSovAdsClient } from '@/lib/sovads-client'
import AdvertiserIcon from './AdvertiserIcon'

interface CampaignPreviewModalProps {
  campaign: {
    name: string
    description: string
    bannerUrl: string
    mediaType?: 'image' | 'video'
    targetUrl?: string
  } | null
  onClose: () => void
}

export default function CampaignPreviewModal({ campaign, onClose }: CampaignPreviewModalProps) {
  const [slotId] = useState(() => `campaign-preview-${Math.random().toString(36).slice(2, 10)}`)
  const [hasRendered, setHasRendered] = useState(false)

  useEffect(() => {
    if (!campaign) return

    const client = getSovAdsClient()
    const container = document.getElementById(slotId)

    if (!client || !container) return

    container.innerHTML = ''

    const banner = new Banner(client, slotId, { placementId: 'banner', size: '728x90' })
    banner.render().then(() => setHasRendered(true)).catch(console.error)

    return () => {
      try { (banner as any).destroy?.() } catch {}
    }
  }, [campaign, slotId])

  if (!campaign) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white border-2 border-black w-full max-w-3xl max-h-[90vh] overflow-auto z-10 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        <div className="sticky top-0 bg-white border-b-2 border-black p-4 flex justify-between items-center">
          <div>
            <h3 className="text-[14px] font-black uppercase tracking-tight">{campaign.name}</h3>
            <p className="text-[11px] text-[#666666] mt-0.5">{campaign.description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider hover:bg-[#F5F3F0] px-2 py-1"
          >
            <AdvertiserIcon name="delete" className="h-3 w-3" />
            Close
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#666666] mb-3">Your Ad Creative</p>
            <div className="border-2 border-black bg-black overflow-hidden">
              {campaign.mediaType === 'video' ? (
                <video
                  src={campaign.bannerUrl}
                  className="w-full aspect-video object-contain"
                  controls
                  playsInline
                  muted
                />
              ) : (
                <img
                  src={campaign.bannerUrl}
                  alt={campaign.description}
                  className="w-full aspect-video object-contain bg-black"
                />
              )}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#666666] mb-3">How It Will Appear</p>
            <div className="border-2 border-black bg-[#F5F3F0] p-4">
              <div
                id={slotId}
                className="w-full min-h-[90px] flex items-center justify-center"
                style={{ minHeight: '90px' }}
              >
                {!hasRendered && (
                  <span className="text-[11px] text-[#666666]">Loading preview...</span>
                )}
              </div>
            </div>
            <p className="text-[10px] text-[#999999] mt-2">Actual appearance may vary based on placement and device.</p>
          </div>

          {campaign.targetUrl && (
            <div className="border border-black bg-white p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#666666]">Target URL</p>
              <p className="text-[12px] font-bold text-[#141414] mt-1 break-all">{campaign.targetUrl}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}