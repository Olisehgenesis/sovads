'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import WalletButton from '@/components/WalletButton'
import { getTokenSymbol } from '@/lib/tokens'
import { BannerAd } from '@/components/ads/AdSlots'
import { useAds } from '@/hooks/useAds'
import TopUpModal from '@/components/TopUpModal'

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
  onChainId?: number
  paused?: boolean
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
  const {
    topUpCampaign,
    toggleCampaignPause,
    extendCampaignDuration,
    isLoading: isContractLoading
  } = useAds()

  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [campaignStats, setCampaignStats] = useState<CampaignStats>({
    impressions: 0,
    clicks: 0,
    ctr: 0,
    totalSpent: 0
  })

  // Management state
  const [fundingAmount, setFundingAmount] = useState('')
  const [fundingCampaignId, setFundingCampaignId] = useState<string | null>(null)
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false)

  const [extendingCampaignId, setExtendingCampaignId] = useState<string | null>(null)
  const [extendAmount, setExtendAmount] = useState('') // in days

  const [isProcessing, setIsProcessing] = useState(false)
  const [msgError, setMsgError] = useState<string | null>(null)
  const [msgSuccess, setMsgSuccess] = useState<string | null>(null)

  const loadCampaigns = useCallback(async (walletAddress: string) => {
    try {
      const res = await fetch(`/api/campaigns/list?wallet=${walletAddress}`)
      if (!res.ok) throw new Error('Failed to load campaigns')
      const data = await res.json()
      setCampaigns(data.campaigns as Campaign[])
    } catch (error) {
      console.error('Error loading campaigns:', error)
    }
  }, [])

  useEffect(() => {
    if (isConnected && address) {
      loadCampaigns(address)
    }
  }, [isConnected, address, loadCampaigns])

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

  const handleFundCampaign = async (campaign: Campaign) => {
    if (!fundingAmount || (!campaign.onChainId && campaign.onChainId !== 0) || !campaign.tokenAddress) return
    setIsProcessing(true)
    setMsgError(null)
    setMsgSuccess(null)
    try {
      await topUpCampaign(Number(campaign.onChainId), fundingAmount, campaign.tokenAddress)
      setMsgSuccess(`Successfully funded ${campaign.name}!`)
      setFundingAmount('')
      setFundingCampaignId(null)
      if (address) loadCampaigns(address)
    } catch (err) {
      setMsgError(err instanceof Error ? err.message : 'Failed to fund campaign')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleTogglePause = async (campaign: Campaign) => {
    if ((!campaign.onChainId && campaign.onChainId !== 0)) return
    setIsProcessing(true)
    setMsgError(null)
    setMsgSuccess(null)
    try {
      await toggleCampaignPause(Number(campaign.onChainId))
      setMsgSuccess(`Campaign ${campaign.paused ? 'resumed' : 'paused'} successfully!`)
      if (address) loadCampaigns(address)
    } catch (err) {
      setMsgError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleExtendDuration = async (campaign: Campaign) => {
    if (!extendAmount || (!campaign.onChainId && campaign.onChainId !== 0)) return
    setIsProcessing(true)
    setMsgError(null)
    setMsgSuccess(null)
    try {
      const additionalSeconds = Number(extendAmount) * 24 * 60 * 60
      await extendCampaignDuration(Number(campaign.onChainId), additionalSeconds)
      setMsgSuccess('Duration extended!')
      setExtendingCampaignId(null)
      if (address) loadCampaigns(address)
    } catch (err) {
      setMsgError(err instanceof Error ? err.message : 'Extension failed')
    } finally {
      setIsProcessing(false)
    }
  }

  const cloneCampaign = (campaign: Campaign) => {
    // Open campaign admin/details page for this campaign
    // the campaign.id is the DB id used by the admin route
    window.location.href = `/admin/campaigns/${campaign.id}`
  }

  const clearModes = () => {
    setFundingCampaignId(null);
    setExtendingCampaignId(null);
    setMsgError(null);
    setMsgSuccess(null);
  };

  return (
    <div className="min-h-screen bg-transparent">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-heading uppercase tracking-wider">Advertiser</h1>
          {isConnected ? (
            <Link href="/create-campaign" className="btn btn-primary">
              Create Campaign
            </Link>
          ) : null}
        </div>

        <div className="card p-6 mb-8">
          <h2 className="text-sm font-heading mb-4 uppercase tracking-wider">Preview Live Banner</h2>
          <BannerAd className="min-h-[100px] border-2 border-dashed border-black" />
        </div>

        {!isConnected ? (
          <div className="card p-8 text-center bg-[#F5F3F0]">
            <h2 className="text-xl font-heading mb-4 uppercase tracking-wider">Connect Wallet</h2>
            <p className="text-black font-bold text-xs mb-6 uppercase">Manage your advertising campaigns</p>
            <WalletButton />
          </div>
        ) : (
          <div className="space-y-8">
            {/* Campaigns List */}
            <div className="card p-6">
              <h2 className="text-sm font-heading mb-6 uppercase tracking-wider">Your Campaigns</h2>
              <div className="space-y-4">
                {campaigns.length === 0 ? (
                  <div className="text-[var(--text-tertiary)] text-[11px]">No campaigns yet. Create your first campaign.</div>
                ) : campaigns.map((campaign) => (
                  <div
                    key={campaign.id}
                    className={`border-2 border-black p-5 cursor-pointer transition-all hover:translate-x-1 hover:translate-y-1 ${selectedCampaign?.id === campaign.id
                      ? 'bg-[#F5F3F0] shadow-sm'
                      : 'bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]'
                      }`}
                    onClick={() => {
                      setSelectedCampaign(campaign)
                      loadCampaignStats(campaign.id)
                    }}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h3 className="text-sm font-medium">{campaign.name}</h3>
                            <p className="text-[var(--text-secondary)] text-[11px]">{campaign.description}</p>
                          </div>
                          <div className="text-right">
                            <div className="text-base font-semibold">
                              {campaign.budget > 0 ? ((campaign.spent / campaign.budget) * 100).toFixed(1) : '0.0'}%
                            </div>
                            <div className="text-[10px] text-[var(--text-tertiary)] uppercase whitespace-nowrap">Budget Used</div>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-[10px] text-[var(--text-tertiary)] uppercase tracking-tight">
                          {(() => {
                            const tokenSymbol = getTokenSymbol(campaign.tokenAddress)
                            return (
                              <>
                                <span>Budget: {campaign.budget} {tokenSymbol}</span>
                                <span>Spent: {campaign.spent} {tokenSymbol}</span>
                                <span className={campaign.active && !campaign.paused ? 'text-[var(--accent-primary-solid)]' : 'text-red-500'}>
                                  {campaign.active ? (campaign.paused ? 'Paused' : 'Active') : 'Inactive'}
                                </span>
                              </>
                            )
                          })()}
                        </div>
                        <div className="mt-2 text-[10px] font-bold text-black uppercase">
                          Media: {campaign.mediaType === 'video' ? 'Video' : 'Image'} | ID: {campaign.onChainId ?? '...'}
                        </div>

                        <div className="mt-4 flex flex-wrap gap-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              cloneCampaign(campaign)
                            }}
                            className="btn btn-outline py-1 h-8 px-3"
                          >
                            View Details
                          </button>
                          {(campaign.onChainId || campaign.onChainId === 0) && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  clearModes()
                                  setFundingCampaignId(campaign.id)
                                  setIsTopUpModalOpen(true)
                                }}
                                className="btn btn-primary py-1 h-8 px-4"
                              >
                                Fund
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleTogglePause(campaign)
                                }}
                                disabled={isProcessing}
                                className="btn btn-outline py-1 h-8 px-3"
                              >
                                {campaign.paused ? 'Resume' : 'Pause'}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  window.location.href = `/edit-campaign/${campaign.id}`
                                }}
                                className="btn btn-outline py-1 h-8 px-3"
                              >
                                Edit
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  clearModes()
                                  if (extendingCampaignId !== campaign.id) setExtendingCampaignId(campaign.id)
                                }}
                                className="btn btn-outline py-1 h-8 px-3"
                              >
                                Extend
                              </button>
                            </>
                          )}
                        </div>

                        {/* Mode Panels */}
                        {(extendingCampaignId === campaign.id) && (
                          <div className="mt-4 p-4 border-2 border-black bg-[#F5F3F0] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]" onClick={(e) => e.stopPropagation()}>
                            {extendingCampaignId === campaign.id && (
                              <div className="flex items-center gap-3">
                                <input
                                  type="number"
                                  value={extendAmount}
                                  onChange={(e) => setExtendAmount(e.target.value)}
                                  placeholder="Days"
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleExtendDuration(campaign)}
                                  disabled={isProcessing || !extendAmount}
                                  className="btn btn-primary text-xs"
                                >
                                  {isProcessing ? '...' : 'Extend'}
                                </button>
                              </div>
                            )}

                            {msgError && <div className="mt-2 text-[10px] font-bold text-red-600 uppercase">{msgError}</div>}
                            {msgSuccess && <div className="mt-2 text-[10px] font-bold text-green-600 uppercase">{msgSuccess}</div>}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Campaign Stats */}
            {selectedCampaign && (
              <div className="card p-6">
                <h2 className="text-sm font-heading mb-6 uppercase tracking-wider">
                  Stats: {selectedCampaign.name}
                </h2>
                <div className="mb-8 border-4 border-black bg-white overflow-hidden shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                  {selectedCampaign.mediaType === 'video' ? (
                    <video
                      src={selectedCampaign.bannerUrl}
                      className="w-full aspect-video object-contain bg-black"
                      controls
                      playsInline
                      muted
                    />
                  ) : (
                    <img
                      src={selectedCampaign.bannerUrl}
                      alt={selectedCampaign.description}
                      className="w-full aspect-video object-contain bg-black"
                    />
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="card p-4 text-center">
                    <div className="text-2xl font-heading">{campaignStats.impressions.toLocaleString()}</div>
                    <div className="text-[10px] font-bold uppercase">Impressions</div>
                  </div>
                  <div className="card p-4 text-center">
                    <div className="text-2xl font-heading">{campaignStats.clicks.toLocaleString()}</div>
                    <div className="text-[10px] font-bold uppercase">Clicks</div>
                  </div>
                  <div className="card p-4 text-center">
                    <div className="text-2xl font-heading">{campaignStats.ctr.toFixed(2)}%</div>
                    <div className="text-[10px] font-bold uppercase">CTR</div>
                  </div>
                  <div className="card p-4 text-center">
                    <div className="text-2xl font-heading">{campaignStats.totalSpent.toFixed(4)}</div>
                    <div className="text-[10px] font-bold uppercase whitespace-nowrap">
                      Spent ({getTokenSymbol(selectedCampaign.tokenAddress)})
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {/* Top-up modal */}
        <TopUpModal
          open={isTopUpModalOpen}
          campaign={campaigns.find((c) => c.id === fundingCampaignId) ?? null}
          onClose={() => {
            setIsTopUpModalOpen(false)
            setFundingCampaignId(null)
          }}
          onSuccess={() => {
            setIsTopUpModalOpen(false)
            setFundingCampaignId(null)
            if (address) loadCampaigns(address)
          }}
        />
      </div>
    </div>
  )
}
