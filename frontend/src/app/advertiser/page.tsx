'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import WalletButton from '@/components/WalletButton'
import { getTokenSymbol } from '@/lib/tokens'
import { BannerAd } from '@/components/ads/AdSlots'
import { useAds } from '@/hooks/useAds'

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
    updateCampaignMetadata,
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

  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null)
  const [editMetadata, setEditMetadata] = useState('')

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

  const handleUpdateMetadata = async (campaign: Campaign) => {
    if (!editMetadata || (!campaign.onChainId && campaign.onChainId !== 0)) return
    setIsProcessing(true)
    setMsgError(null)
    setMsgSuccess(null)
    try {
      await updateCampaignMetadata(Number(campaign.onChainId), editMetadata)
      setMsgSuccess('Metadata updated!')
      setEditingCampaignId(null)
      if (address) loadCampaigns(address)
    } catch (err) {
      setMsgError(err instanceof Error ? err.message : 'Update failed')
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

  const clearModes = () => {
    setFundingCampaignId(null);
    setEditingCampaignId(null);
    setExtendingCampaignId(null);
    setMsgError(null);
    setMsgSuccess(null);
  };

  return (
    <div className="min-h-screen bg-transparent">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-base font-bold uppercase tracking-wider">Advertiser Dashboard</h1>
          {isConnected ? (
            <Link href="/create-campaign" className="btn btn-primary">
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
              <div className="space-y-4">
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
                        <div className="mt-1.5 text-[10px] text-[var(--text-tertiary)] uppercase">
                          Media: {campaign.mediaType === 'video' ? 'Video' : 'Image / GIF'} | ID: {campaign.onChainId ?? 'Syncing...'}
                        </div>

                        <div className="mt-4 flex flex-wrap gap-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              cloneCampaign(campaign)
                            }}
                            className="btn btn-outline py-1 h-8 px-3"
                          >
                            Clone
                          </button>
                          {(campaign.onChainId || campaign.onChainId === 0) && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  clearModes()
                                  if (fundingCampaignId !== campaign.id) setFundingCampaignId(campaign.id)
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
                                  clearModes()
                                  if (editingCampaignId !== campaign.id) {
                                    setEditingCampaignId(campaign.id)
                                    setEditMetadata(campaign.description || '')
                                  }
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
                        {(fundingCampaignId === campaign.id || editingCampaignId === campaign.id || extendingCampaignId === campaign.id) && (
                          <div className="mt-4 p-4 bg-secondary border border-primary/20 rounded-lg animate-in fade-in slide-in-from-top-2" onClick={(e) => e.stopPropagation()}>
                            {fundingCampaignId === campaign.id && (
                              <div className="flex items-center gap-3">
                                <input
                                  type="number"
                                  value={fundingAmount}
                                  onChange={(e) => setFundingAmount(e.target.value)}
                                  placeholder={`Amount in ${getTokenSymbol(campaign.tokenAddress)}`}
                                  className="flex-1 bg-input border border-border rounded-md px-3 py-2 text-xs"
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleFundCampaign(campaign)}
                                  disabled={isProcessing || !fundingAmount}
                                  className="btn btn-primary px-6"
                                >
                                  {isProcessing ? 'Processing...' : 'Add Funds'}
                                </button>
                              </div>
                            )}

                            {editingCampaignId === campaign.id && (
                              <div className="space-y-3">
                                <textarea
                                  value={editMetadata}
                                  onChange={(e) => setEditMetadata(e.target.value)}
                                  placeholder="Update campaign description / metadata..."
                                  className="w-full bg-input border border-border rounded-md px-3 py-2 text-xs min-h-[80px]"
                                  autoFocus
                                />
                                <div className="flex justify-end gap-2">
                                  <button onClick={clearModes} className="btn btn-outline px-4">Cancel</button>
                                  <button
                                    onClick={() => handleUpdateMetadata(campaign)}
                                    disabled={isProcessing || !editMetadata}
                                    className="btn btn-primary px-6"
                                  >
                                    {isProcessing ? 'Updating...' : 'Save Changes'}
                                  </button>
                                </div>
                              </div>
                            )}

                            {extendingCampaignId === campaign.id && (
                              <div className="flex items-center gap-3">
                                <input
                                  type="number"
                                  value={extendAmount}
                                  onChange={(e) => setExtendAmount(e.target.value)}
                                  placeholder="Additional Days"
                                  className="flex-1 bg-input border border-border rounded-md px-3 py-2 text-xs"
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleExtendDuration(campaign)}
                                  disabled={isProcessing || !extendAmount}
                                  className="btn btn-primary px-6"
                                >
                                  {isProcessing ? 'Extending...' : 'Extend'}
                                </button>
                              </div>
                            )}

                            {msgError && <div className="mt-2 text-[10px] text-destructive px-1">{msgError}</div>}
                            {msgSuccess && <div className="mt-2 text-[10px] text-[var(--accent-primary-solid)] px-1">{msgSuccess}</div>}
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
              <div className="glass-card rounded-xl p-4">
                <h2 className="text-xs font-semibold mb-3 uppercase tracking-wider">
                  Campaign Stats: {selectedCampaign.name}
                </h2>
                <div className="mb-6">
                  {selectedCampaign.mediaType === 'video' ? (
                    <video
                      src={selectedCampaign.bannerUrl}
                      className="w-full max-h-64 rounded-lg border border-[var(--glass-border)]"
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
                  <div className="glass-card rounded-lg p-3 text-center">
                    <div className="text-lg font-bold">{campaignStats.impressions.toLocaleString()}</div>
                    <div className="text-[var(--text-tertiary)] text-[10px] uppercase">Impressions</div>
                  </div>
                  <div className="glass-card rounded-lg p-3 text-center">
                    <div className="text-lg font-bold">{campaignStats.clicks.toLocaleString()}</div>
                    <div className="text-[var(--text-tertiary)] text-[10px] uppercase">Clicks</div>
                  </div>
                  <div className="glass-card rounded-lg p-3 text-center">
                    <div className="text-lg font-bold">{campaignStats.ctr.toFixed(2)}%</div>
                    <div className="text-[var(--text-tertiary)] text-[10px] uppercase">CTR</div>
                  </div>
                  <div className="glass-card rounded-lg p-3 text-center">
                    <div className="text-lg font-bold">{campaignStats.totalSpent.toFixed(6)}</div>
                    <div className="text-[var(--text-tertiary)] text-[10px] uppercase whitespace-nowrap">
                      Spent ({getTokenSymbol(selectedCampaign.tokenAddress)})
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