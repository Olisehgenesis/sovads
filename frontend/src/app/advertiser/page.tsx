'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import WalletButton from '@/components/WalletButton'
import { getTokenSymbol } from '@/lib/tokens'
import { BannerAd } from '@/components/ads/AdSlots'

interface Campaign {
  id: string
  name: string
  description: string
  bannerUrl: string
  targetUrl: string
  budget: number
  spent: number
  cpc: number
  active: boolean
  tokenAddress?: string
  mediaType?: 'image' | 'video'
  tags?: string[]
  targetLocations?: string[]
  metadata?: Record<string, unknown>
  startDate?: string | null
  endDate?: string | null
}

interface CampaignStats {
  impressions: number
  clicks: number
  ctr: number
  totalSpent: number
}

export default function AdvertiserDashboard() {
  const { address, isConnected } = useAccount()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [campaignStats, setCampaignStats] = useState<CampaignStats>({
    impressions: 0,
    clicks: 0,
    ctr: 0,
    totalSpent: 0
  })


  useEffect(() => {
    if (isConnected && address) {
      loadCampaigns(address)
    }
  }, [isConnected, address])

  const loadCampaigns = async (walletAddress: string) => {
    try {
      const res = await fetch(`/api/campaigns/list?wallet=${walletAddress}`)
      if (!res.ok) throw new Error('Failed to load campaigns')
      const data = await res.json()
      setCampaigns(data.campaigns as Campaign[])
    } catch (error) {
      console.error('Error loading campaigns:', error)
    }
  }

  const loadCampaignStats = async (campaignId: string) => {
    try {
      const response = await fetch(`/api/analytics?campaignId=${campaignId}&days=30`)
      if (response.ok) {
        const data = await response.json()
        setCampaignStats({
          impressions: data.impressions,
          clicks: data.clicks,
          ctr: data.ctr,
          totalSpent: data.totalRevenue
        })
      }
    } catch (error) {
      console.error('Error loading campaign stats:', error)
    }
  }

  const cloneCampaign = (campaign: Campaign) => {
    // Navigate to create campaign page with pre-filled data
    const params = new URLSearchParams({
      clone: 'true',
      name: `${campaign.name} (Copy)`,
      description: campaign.description || '',
      bannerUrl: campaign.bannerUrl,
      targetUrl: campaign.targetUrl,
      budget: campaign.budget.toString(),
      cpc: campaign.cpc.toString(),
      tokenAddress: campaign.tokenAddress || '',
      tags: campaign.tags?.join(',') || '',
      targetLocations: campaign.targetLocations?.join(',') || '',
      mediaType: campaign.mediaType || 'image',
    })
    window.location.href = `/create-campaign?${params.toString()}`
  }

  // Creation is handled on dedicated page now

  return (
    <div className="min-h-screen bg-transparent">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-base font-bold uppercase tracking-wider">Advertiser Dashboard</h1>
          {isConnected ? (
            <Link href="/create-campaign" className="btn btn-primary px-4 py-1.5">
              Create Campaign
            </Link>
          ) : null}
        </div>

        <div className="glass-card rounded-xl p-4 mb-6">
          <h2 className="text-xs font-semibold mb-3 uppercase tracking-wider">Preview Live Banner Placement</h2>
          <BannerAd className="min-h-[120px] rounded-lg border border-dashed border-[var(--glass-border)]" />
        </div>

        {!isConnected ? (
          <div className="glass-card rounded-xl p-6 text-center">
            <h2 className="text-sm font-semibold mb-3 uppercase tracking-wider">Connect Your Wallet</h2>
            <p className="text-[var(--text-secondary)] text-[11px] mb-4">Connect your wallet to create and manage advertising campaigns</p>
            <WalletButton />
          </div>
        ) : (
          <div className="space-y-8">
            {/* Campaigns List */}
            <div className="glass-card rounded-xl p-4">
              <h2 className="text-xs font-semibold mb-3 uppercase tracking-wider">Your Campaigns</h2>
              <div className="space-y-3">
                {campaigns.length === 0 ? (
                  <div className="text-[var(--text-tertiary)] text-[11px]">No campaigns yet. Create your first campaign.</div>
                ) : campaigns.map((campaign) => (
                  <div
                    key={campaign.id}
                    className={`border rounded-lg p-4 cursor-pointer transition-colors ${selectedCampaign?.id === campaign.id
                        ? 'border-primary bg-secondary'
                        : 'border-[var(--glass-border)] hover:border-[var(--glass-border-hover)]'
                      }`}
                    onClick={() => {
                      setSelectedCampaign(campaign)
                      loadCampaignStats(campaign.id)
                    }}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-sm font-medium">{campaign.name}</h3>
                        <p className="text-[var(--text-secondary)] text-[11px]">{campaign.description}</p>
                        <div className="flex space-x-3 mt-1.5 text-[10px] text-[var(--text-tertiary)] uppercase tracking-tight">
                          {(() => {
                            const tokenSymbol = getTokenSymbol(campaign.tokenAddress)
                            return (
                              <>
                                <span>Budget: {campaign.budget} {tokenSymbol}</span>
                                <span>Spent: {campaign.spent} {tokenSymbol}</span>
                                <span>CPC: {campaign.cpc} {tokenSymbol}</span>
                                <span className={campaign.active ? 'text-[var(--accent-primary-solid)]' : 'text-red-500'}>
                                  {campaign.active ? 'Active' : 'Inactive'}
                                </span>
                              </>
                            )
                          })()}
                        </div>
                        <div className="mt-1.5 text-[10px] text-[var(--text-tertiary)] uppercase">
                          Media: {campaign.mediaType === 'video' ? 'Video' : 'Image / GIF'}
                        </div>
                        {(campaign.tags?.length || campaign.targetLocations?.length) && (
                          <div className="mt-3 space-y-2">
                            {campaign.tags && campaign.tags.length > 0 && (
                              <div className="flex flex-wrap gap-2 text-xs">
                                {campaign.tags.map((tag) => (
                                  <span key={tag} className="px-2 py-1 bg-secondary/60 border border-[var(--glass-border)] rounded-full">
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            )}
                            {campaign.targetLocations && campaign.targetLocations.length > 0 && (
                              <div className="flex flex-wrap gap-2 text-xs text-[var(--text-secondary)]">
                                <span className="font-medium text-[var(--text-primary)]">Target:</span>
                                {campaign.targetLocations.map((loc) => (
                                  <span key={loc} className="px-2 py-1 bg-muted border border-[var(--glass-border)] rounded-full">
                                    {loc}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-base font-semibold">
                          {campaign.budget > 0 ? ((campaign.spent / campaign.budget) * 100).toFixed(1) : '0.0'}%
                        </div>
                        <div className="text-[10px] text-[var(--text-tertiary)] uppercase">Budget Used</div>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            cloneCampaign(campaign)
                          }}
                          className="text-xs px-2 py-1 glass-card rounded hover:bg-secondary/80"
                        >
                          Clone
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Campaign Stats */}
            {selectedCampaign && (
              <div className="glass-card rounded-xl p-4">
                <h2 className="text-xs font-semibold mb-3 uppercase tracking-wider">
                  Campaign Stats: {selectedCampaign.name}
                </h2>
                <div className="mb-6">
                  {selectedCampaign.mediaType === 'video' ? (
                    <video
                      src={selectedCampaign.bannerUrl}
                      className="w-full rounded-lg border border-[var(--glass-border)]"
                      controls
                      playsInline
                      muted
                    />
                  ) : (
                    <img
                      src={selectedCampaign.bannerUrl}
                      alt={selectedCampaign.description}
                      className="w-full max-h-64 object-contain rounded-lg border border-[var(--glass-border)]"
                    />
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="glass-card rounded-lg p-3">
                    <div className="text-lg font-bold">{campaignStats.impressions.toLocaleString()}</div>
                    <div className="text-[var(--text-tertiary)] text-[10px] uppercase">Impressions</div>
                  </div>
                  <div className="glass-card rounded-lg p-3">
                    <div className="text-lg font-bold">{campaignStats.clicks.toLocaleString()}</div>
                    <div className="text-[var(--text-tertiary)] text-[10px] uppercase">Clicks</div>
                  </div>
                  <div className="glass-card rounded-lg p-3">
                    <div className="text-lg font-bold">{campaignStats.ctr.toFixed(2)}%</div>
                    <div className="text-[var(--text-tertiary)] text-[10px] uppercase">CTR</div>
                  </div>
                  <div className="glass-card rounded-lg p-3">
                    <div className="text-lg font-bold">{campaignStats.totalSpent.toFixed(6)}</div>
                    <div className="text-[var(--text-tertiary)] text-[10px] uppercase">
                      Total Spent {selectedCampaign?.tokenAddress ? `(${getTokenSymbol(selectedCampaign.tokenAddress)})` : ''}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}