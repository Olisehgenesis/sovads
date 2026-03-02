'use client'

import { useState, useEffect } from 'react'
import { useAds } from '@/hooks/useAds'
import { useAccount } from 'wagmi'
import { GLOBAL_TREASURY_CAMPAIGN_ID } from '@/lib/sovadgs'
import { CELO_TOKENS } from '@/lib/tokens'

interface SystemStats {
  totalAds: number
  totalPublishers: number
  totalImpressions: number
  totalRevenue: number
}

export default function AdminDashboard() {
  const { address } = useAccount()
  const { topUpCampaign, isLoading: contractLoading } = useAds()
  const [systemStats, setSystemStats] = useState<SystemStats>({
    totalAds: 0,
    totalPublishers: 0,
    totalImpressions: 0,
    totalRevenue: 0
  })
  const [isLoading, setIsLoading] = useState(true)
  const [treasuryAmount, setTreasuryAmount] = useState('')
  const [isToppingUp, setIsToppingUp] = useState(false)

  const [pendingCampaigns, setPendingCampaigns] = useState<any[]>([])
  const [isVerifying, setIsVerifying] = useState<string | null>(null)

  // Find G$ token address from configuration
  const gsTokenAddress = Object.values(CELO_TOKENS).find(t => t.symbol === 'G$')?.address || ''

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (address) {
      loadPendingCampaigns()
    }
  }, [address])

  const loadData = async () => {
    try {
      // Load system stats
      const statsResponse = await fetch('/api/stats')
      if (statsResponse.ok) {
        const statsData = await statsResponse.json()
        setSystemStats({
          totalAds: statsData.totalAds,
          totalPublishers: statsData.totalPublishers,
          totalImpressions: statsData.totalImpressions,
          totalRevenue: statsData.totalRevenue
        })
      }
      setIsLoading(false)
    } catch (error) {
      console.error('Error loading admin data:', error)
      setIsLoading(false)
    }
  }

  const loadPendingCampaigns = async () => {
    if (!address) return
    try {
      const response = await fetch(`/api/admin/campaigns/pending?adminWallet=${address}`)
      if (response.ok) {
        const data = await response.json()
        setPendingCampaigns(data.campaigns || [])
      }
    } catch (error) {
      console.error('Error loading pending campaigns:', error)
    }
  }

  const handleVerifyCampaign = async (campaignId: string, status: 'approved' | 'rejected') => {
    if (!address) return
    setIsVerifying(campaignId)
    try {
      const response = await fetch('/api/admin/campaigns/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, status, adminWallet: address })
      })

      if (response.ok) {
        alert(`Campaign ${status} successfully`)
        loadPendingCampaigns()
        loadData() // Refresh stats
      } else {
        const errorData = await response.json()
        alert(`Failed to verify: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error verifying campaign:', error)
      alert('Error verifying campaign')
    } finally {
      setIsVerifying(null)
    }
  }

  const handleTreasuryTopup = async () => {
    if (!treasuryAmount || !gsTokenAddress) {
      alert('Please enter an amount and ensure G$ token is configured')
      return
    }

    setIsToppingUp(true)
    try {
      await topUpCampaign(Number(GLOBAL_TREASURY_CAMPAIGN_ID), treasuryAmount, gsTokenAddress)
      alert('Treasury topped up successfully!')
      setTreasuryAmount('')
    } catch (error) {
      console.error('Topup failed:', error)
      alert('Failed to top up treasury. See console for details.')
    } finally {
      setIsToppingUp(false)
    }
  }

  const triggerAnalytics = async () => {
    try {
      const response = await fetch('/api/analytics/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'aggregate' })
      })

      if (response.ok) {
        const data = await response.json()
        alert(`Analytics aggregation triggered. Job ID: ${data.jobId}`)
      } else {
        alert('Failed to trigger analytics aggregation')
      }
    } catch (error) {
      console.error('Error triggering analytics:', error)
      alert('Error triggering analytics aggregation')
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent-primary-solid)] mx-auto"></div>
          <p className="mt-4 text-[var(--text-secondary)] text-[11px]">Loading admin dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-base font-bold text-[var(--text-primary)] uppercase tracking-wider">Admin Dashboard</h1>
          <div className="text-[10px] text-[var(--text-secondary)] uppercase">
            G$ Token: <span className="text-[var(--text-primary)] font-mono">{gsTokenAddress.slice(0, 6)}...{gsTokenAddress.slice(-4)}</span>
          </div>
        </div>

        {/* System Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="glass-card rounded-lg p-4">
            <div className="text-lg font-bold text-[var(--text-primary)]">{systemStats.totalAds}</div>
            <div className="text-[var(--text-secondary)] text-[10px] uppercase tracking-tight">Total Campaigns</div>
          </div>
          <div className="glass-card rounded-lg p-4">
            <div className="text-lg font-bold text-[var(--text-primary)]">{systemStats.totalPublishers}</div>
            <div className="text-[var(--text-secondary)] text-[10px] uppercase tracking-tight">Total Publishers</div>
          </div>
          <div className="glass-card rounded-lg p-4">
            <div className="text-lg font-bold text-[var(--text-primary)]">{systemStats.totalImpressions.toLocaleString()}</div>
            <div className="text-[var(--text-secondary)] text-[10px] uppercase tracking-tight">Total Impressions</div>
          </div>
          <div className="glass-card rounded-lg p-4">
            <div className="text-lg font-bold text-[var(--text-primary)]">{systemStats.totalRevenue.toFixed(2)}</div>
            <div className="text-[var(--text-secondary)] text-[10px] uppercase tracking-tight">Total Revenue</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Treasury Management */}
          <div className="glass-card rounded-lg p-4">
            <h2 className="text-xs font-semibold text-[var(--text-primary)] mb-3 uppercase tracking-wider">Treasury Management (G$)</h2>
            <div className="space-y-4">
              <p className="text-[10px] text-[var(--text-secondary)] uppercase">
                Fund the Global Treasury campaign (#1) to enable viewer and publisher G$ payouts.
              </p>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={treasuryAmount}
                  onChange={(e) => setTreasuryAmount(e.target.value)}
                  placeholder="Amount in G$"
                  className="flex-1 px-3 py-1.5 bg-input border border-border rounded-md text-[11px]"
                />
                <button
                  onClick={handleTreasuryTopup}
                  disabled={isToppingUp || contractLoading}
                  className="btn btn-primary px-4 py-1.5 text-xs whitespace-nowrap"
                >
                  {isToppingUp ? 'Processing...' : 'Top Up Treasury'}
                </button>
              </div>
            </div>
          </div>

          {/* System Controls */}
          <div className="glass-card rounded-lg p-4">
            <h2 className="text-xs font-semibold text-[var(--text-primary)] mb-3 uppercase tracking-wider">System Controls</h2>
            <div className="space-y-3">
              <button
                onClick={triggerAnalytics}
                className="btn btn-primary px-4 py-1.5 text-xs"
              >
                Trigger Analytics Aggregation
              </button>
              <p className="text-[10px] text-[var(--text-secondary)] uppercase">
                Manually trigger analytics aggregation for the current day.
              </p>
            </div>
          </div>
        </div>

        {/* Ad Verification Management */}
        {address && (
          <div className="glass-card rounded-lg p-6 mb-6">
            <h2 className="text-sm font-bold text-[var(--accent-primary-solid)] mb-4 uppercase tracking-widest border-b border-[var(--glass-border)] pb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>
              Campaign Approvals ({pendingCampaigns.length})
            </h2>

            {pendingCampaigns.length === 0 ? (
              <p className="text-[10px] text-[var(--text-tertiary)] uppercase text-center py-8 bg-[var(--glass-bg-subtle)] rounded border border-dashed border-[var(--glass-border)]">
                No campaigns pending verification
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--glass-border)] text-[10px] uppercase text-[var(--text-secondary)] tracking-tighter">
                      <th className="py-2 px-2 font-medium">Campaign</th>
                      <th className="py-2 px-2 font-medium">Advertiser</th>
                      <th className="py-2 px-2 font-medium text-right">Budget</th>
                      <th className="py-2 px-2 font-medium text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingCampaigns.map((camp) => (
                      <tr key={camp.id} className="border-b border-[var(--glass-border)] hover:bg-[var(--glass-bg-hover)] transition-colors group">
                        <td className="py-3 px-2">
                          <div className="flex flex-col">
                            <span className="text-[11px] font-bold text-[var(--text-primary)] mb-0.5">{camp.name}</span>
                            <span className="text-[9px] text-[var(--text-tertiary)] truncate max-w-[200px]">{camp.bannerUrl}</span>
                          </div>
                        </td>
                        <td className="py-3 px-2">
                          <span className="text-[10px] font-mono text-[var(--text-secondary)] bg-[var(--glass-bg-subtle)] px-2 py-0.5 rounded">
                            {camp.advertiserWallet.slice(0, 6)}...{camp.advertiserWallet.slice(-4)}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-right">
                          <span className="text-[11px] font-bold text-[var(--accent-primary-solid)]">{camp.budget} G$</span>
                        </td>
                        <td className="py-3 px-2">
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={() => handleVerifyCampaign(camp.id, 'approved')}
                              disabled={isVerifying === camp.id}
                              className="px-3 py-1 bg-green-500/20 hover:bg-green-500/40 text-green-400 text-[9px] font-bold uppercase rounded border border-green-500/30 transition-all active:scale-95 disabled:opacity-50"
                            >
                              {isVerifying === camp.id ? '...' : 'Approve'}
                            </button>
                            <button
                              onClick={() => handleVerifyCampaign(camp.id, 'rejected')}
                              disabled={isVerifying === camp.id}
                              className="px-3 py-1 bg-red-500/20 hover:bg-red-500/40 text-red-400 text-[9px] font-bold uppercase rounded border border-red-500/30 transition-all active:scale-95 disabled:opacity-50"
                            >
                              {isVerifying === camp.id ? '...' : 'Reject'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Recent Activity */}
        <div className="glass-card rounded-lg p-4">
          <h2 className="text-xs font-semibold text-[var(--text-primary)] mb-3 uppercase tracking-wider">Recent Activity</h2>
          <div className="space-y-2">
            <div className="flex justify-between items-center py-1.5 border-b border-[var(--glass-border)]">
              <span className="text-[var(--text-secondary)] text-[11px]">Analytics aggregation completed</span>
              <span className="text-[var(--text-tertiary)] text-[10px]">2 minutes ago</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-[var(--glass-border)]">
              <span className="text-[var(--text-secondary)] text-[11px]">New campaign created: DeFi Protocol</span>
              <span className="text-[var(--text-tertiary)] text-[10px]">1 hour ago</span>
            </div>
            <div className="flex justify-between items-center py-1.5">
              <span className="text-[var(--text-secondary)] text-[11px]">Publisher registered: example.com</span>
              <span className="text-[var(--text-tertiary)] text-[10px]">2 hours ago</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}