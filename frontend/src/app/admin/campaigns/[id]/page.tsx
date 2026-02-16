"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import TopUpModal from '@/components/TopUpModal'
import { useAds } from '@/hooks/useAds'
import { getTokenSymbol } from '@/lib/tokens'

interface Campaign {
  id: string
  name: string
  description?: string
  bannerUrl?: string
  tokenAddress?: string
  onChainId?: number
  budget?: number
  spent?: number
}

interface Analytics {
  impressions: number
  clicks: number
  ctr: number
  totalRevenue: number
}

export default function AdminCampaignPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const { id } = params
  const { topUpCampaign } = useAds()

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    load()
  }, [id])

  const load = async () => {
    setIsLoading(true)
    try {
      const resp = await fetch(`/api/campaigns/detail?id=${encodeURIComponent(id)}`)
      if (!resp.ok) throw new Error('Failed to load campaign')
      const data = await resp.json()
      setCampaign(data.campaign)

      const aResp = await fetch(`/api/analytics?campaignId=${encodeURIComponent(id)}&days=30`)
      if (aResp.ok) {
        const adata = await aResp.json()
        setAnalytics({
          impressions: adata.impressions || 0,
          clicks: adata.clicks || 0,
          ctr: adata.ctr || 0,
          totalRevenue: adata.totalRevenue || 0,
        })
      }
    } catch (error) {
      console.error('Error loading campaign page:', error)
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) return <div className="p-6">Loading...</div>
  if (!campaign) return <div className="p-6">Campaign not found</div>

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">Campaign: {campaign.name}</h1>
          <div className="flex gap-2">
            <button className="btn btn-outline" onClick={() => router.back()}>Back</button>
            <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>Top Up</button>
          </div>
        </div>

        <div className="glass-card p-4 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <img src={campaign.bannerUrl} alt={campaign.description} className="w-full rounded-md" />
            </div>
            <div>
              <p className="text-sm text-[var(--text-secondary)]">{campaign.description}</p>
              <div className="mt-3">
                <div className="text-xs text-[var(--text-tertiary)]">On-chain ID</div>
                <div className="font-mono">{campaign.onChainId ?? 'Not synced'}</div>
              </div>
              <div className="mt-3">
                <div className="text-xs text-[var(--text-tertiary)]">Token</div>
                <div>{getTokenSymbol(campaign.tokenAddress)} ({campaign.tokenAddress})</div>
              </div>
              <div className="mt-3">
                <div className="text-xs text-[var(--text-tertiary)]">Budget</div>
                <div>{campaign.budget ?? 0}</div>
              </div>
              <div className="mt-3">
                <div className="text-xs text-[var(--text-tertiary)]">Spent</div>
                <div>{campaign.spent ?? 0}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="glass-card p-4 rounded-lg">
          <h2 className="text-sm font-semibold mb-2">Analytics (30 days)</h2>
          {analytics ? (
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-lg font-bold">{analytics.impressions.toLocaleString()}</div>
                <div className="text-xs text-[var(--text-tertiary)]">Impressions</div>
              </div>
              <div>
                <div className="text-lg font-bold">{analytics.clicks.toLocaleString()}</div>
                <div className="text-xs text-[var(--text-tertiary)]">Clicks</div>
              </div>
              <div>
                <div className="text-lg font-bold">{analytics.ctr.toFixed(2)}%</div>
                <div className="text-xs text-[var(--text-tertiary)]">CTR</div>
              </div>
            </div>
          ) : (
            <div>No analytics available</div>
          )}
        </div>

        <TopUpModal
          open={isModalOpen}
          campaign={campaign}
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => { setIsModalOpen(false); load() }}
        />
      </div>
    </div>
  )
}
