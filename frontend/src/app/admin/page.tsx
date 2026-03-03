'use client'

import { useState, useEffect } from 'react'
import { useAds } from '@/hooks/useAds'
import { useAccount, useSignMessage } from 'wagmi'
import { GLOBAL_TREASURY_CAMPAIGN_ID } from '@/lib/sovadgs'
import { CELO_TOKENS, getTokenSymbol } from '@/lib/tokens'

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
  const [allCampaigns, setAllCampaigns] = useState<any[]>([])
  const [recentActivities, setRecentActivities] = useState<any[]>([])
  const [isVerifying, setIsVerifying] = useState<string | null>(null)
  const [isUpdating, setIsUpdating] = useState<string | null>(null)
  const [isUnauthorized, setIsUnauthorized] = useState(false)
  const [editingCampaign, setEditingCampaign] = useState<any | null>(null)

  const { signMessageAsync } = useSignMessage()

  // Find G$ token address from configuration
  const gsTokenAddress = Object.values(CELO_TOKENS).find(t => t.symbol === 'G$')?.address || ''

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (address) {
      loadPendingCampaigns()
      loadAllCampaigns()
      loadActivity()
    } else {
      setPendingCampaigns([])
      setRecentActivities([])
      setIsUnauthorized(false)
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
        setIsUnauthorized(false)
      } else if (response.status === 403) {
        setIsUnauthorized(true)
        setPendingCampaigns([])
      }
    } catch (error) {
      console.error('Error loading pending campaigns:', error)
    }
  }

  const loadAllCampaigns = async () => {
    if (!address) return
    try {
      const response = await fetch(`/api/admin/campaigns/list?adminWallet=${address}`)
      if (response.ok) {
        const data = await response.json()
        setAllCampaigns(data.campaigns || [])
      }
    } catch (error) {
      console.error('Error loading all campaigns:', error)
    }
  }

  const loadActivity = async () => {
    if (!address) return
    try {
      const response = await fetch(`/api/admin/activity?adminWallet=${address}`)
      if (response.ok) {
        const data = await response.json()
        setRecentActivities(data.activities || [])
      }
    } catch (error) {
      console.error('Error loading activity:', error)
    }
  }

  const handleVerifyCampaign = async (campaignId: string, status: 'approved' | 'rejected' | 'pending') => {
    if (!address) return
    setIsVerifying(campaignId)
    try {
      const message = `Admin action: ${status === 'pending' ? 'Unverify' : status.toUpperCase()} campaign ${campaignId} at ${new Date().toISOString()}`
      const signature = await signMessageAsync({ message })

      const response = await fetch('/api/admin/campaigns/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, status, adminWallet: address, signature, message })
      })

      if (response.ok) {
        alert(`Campaign status updated to ${status}`)
        loadPendingCampaigns()
        loadAllCampaigns()
        loadData()
      } else {
        const errorData = await response.json()
        alert(`Failed: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error verifying campaign:', error)
      if (!(error instanceof Error && error.message.includes('User rejected'))) {
        alert('Error updating campaign status')
      }
    } finally {
      setIsVerifying(null)
    }
  }

  const handleAdminUpdate = async (campaignId: string, updates: any) => {
    if (!address) return
    setIsUpdating(campaignId)
    try {
      const message = `Admin update: campaign ${campaignId} at ${new Date().toISOString()}`
      const signature = await signMessageAsync({ message })

      const response = await fetch('/api/admin/campaigns/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: campaignId, updates, adminWallet: address, signature, message })
      })

      if (response.ok) {
        alert('Campaign updated successfully')
        setEditingCampaign(null)
        loadAllCampaigns()
        loadPendingCampaigns()
      } else {
        const errorData = await response.json()
        alert(`Failed to update: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error updating campaign:', error)
    } finally {
      setIsUpdating(null)
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
          <div className="admin-card">
            <div className="text-lg font-bold text-[var(--text-primary)]">{systemStats.totalAds}</div>
            <div className="text-[var(--text-secondary)] text-[10px] uppercase tracking-tight">Total Campaigns</div>
          </div>
          <div className="admin-card">
            <div className="text-lg font-bold text-[var(--text-primary)]">{systemStats.totalPublishers}</div>
            <div className="text-[var(--text-secondary)] text-[10px] uppercase tracking-tight">Total Publishers</div>
          </div>
          <div className="admin-card">
            <div className="text-lg font-bold text-[var(--text-primary)]">{systemStats.totalImpressions.toLocaleString()}</div>
            <div className="text-[var(--text-secondary)] text-[10px] uppercase tracking-tight">Total Impressions</div>
          </div>
          <div className="admin-card">
            <div className="text-lg font-bold text-[var(--text-primary)]">{systemStats.totalRevenue.toFixed(2)}</div>
            <div className="text-[var(--text-secondary)] text-[10px] uppercase tracking-tight">Total Revenue</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Treasury Management */}
          <div className="admin-card">
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
                  className="btn-admin px-4 py-1.5 text-xs whitespace-nowrap"
                >
                  {isToppingUp ? 'Processing...' : 'Top Up Treasury'}
                </button>
              </div>
            </div>
          </div>

          {/* System Controls */}
          <div className="admin-card">
            <h2 className="text-xs font-semibold text-[var(--text-primary)] mb-3 uppercase tracking-wider">System Controls</h2>
            <div className="space-y-3">
              <button
                onClick={triggerAnalytics}
                className="btn-admin px-4 py-1.5 text-xs"
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
        {/* All Campaigns Management */}
        {address && (
          <div className="admin-card mb-6">
            <h2 className="text-sm font-bold text-[var(--accent-primary-solid)] mb-4 uppercase tracking-widest border-b border-[var(--glass-border)] pb-2 flex items-center gap-2">
              Manage All Campaigns ({allCampaigns.length})
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--glass-border)] text-[10px] uppercase text-[var(--text-secondary)] tracking-tighter">
                    <th className="py-2 px-2 font-medium">Campaign</th>
                    <th className="py-2 px-2 font-medium">Status</th>
                    <th className="py-2 px-2 font-medium text-right">Budget</th>
                    <th className="py-2 px-2 font-medium text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {allCampaigns.map((camp) => (
                    <tr key={camp.id} className="border-b border-[var(--glass-border)] hover:bg-[var(--glass-bg-hover)] transition-colors group">
                      <td className="py-3 px-2">
                        <div className="flex flex-col">
                          <span className="text-[11px] font-bold text-[var(--text-primary)] mb-0.5">{camp.name}</span>
                          <span className="text-[9px] text-[var(--text-tertiary)] truncate max-w-[200px]">{camp.bannerUrl}</span>
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded ${camp.verificationStatus === 'approved' ? 'bg-green-500/10 text-green-400' :
                          camp.verificationStatus === 'rejected' ? 'bg-red-500/10 text-red-400' :
                            'bg-yellow-500/10 text-yellow-400'
                          }`}>
                          {camp.verificationStatus || 'pending'}
                        </span>
                        {!camp.active && (
                          <span className="ml-2 text-[8px] bg-gray-500/20 text-gray-400 px-1 rounded uppercase">Inactive</span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-right">
                        <span className="text-[11px] font-bold text-[var(--text-primary)]">{camp.budget} {getTokenSymbol(camp.tokenAddress)}</span>
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex justify-center gap-2">
                          <a
                            href={camp.bannerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-0.5 border border-blue-500/30 text-blue-400 text-[9px] uppercase hover:bg-blue-500/10 rounded transition-all text-center inline-block"
                          >
                            View
                          </a>
                          <button
                            onClick={() => setEditingCampaign(camp)}
                            className="px-2 py-0.5 border border-[var(--glass-border)] text-[9px] uppercase hover:bg-[var(--glass-bg-hover)] rounded transition-all"
                          >
                            Edit
                          </button>
                          {camp.verificationStatus === 'pending' || !camp.verificationStatus ? (
                            <>
                              <button
                                onClick={() => handleVerifyCampaign(camp.id, 'approved')}
                                disabled={isVerifying === camp.id}
                                className="px-2 py-0.5 border border-green-500/30 text-green-400 text-[9px] uppercase hover:bg-green-500/10 rounded transition-all"
                              >
                                {isVerifying === camp.id ? '...' : 'Approve'}
                              </button>
                              <button
                                onClick={() => handleVerifyCampaign(camp.id, 'rejected')}
                                disabled={isVerifying === camp.id}
                                className="px-2 py-0.5 border border-red-500/30 text-red-400 text-[9px] uppercase hover:bg-red-500/10 rounded transition-all"
                              >
                                {isVerifying === camp.id ? '...' : 'Reject'}
                              </button>
                            </>
                          ) : camp.verificationStatus === 'approved' ? (
                            <button
                              onClick={() => handleVerifyCampaign(camp.id, 'pending')}
                              disabled={isVerifying === camp.id}
                              className="px-2 py-0.5 border border-yellow-500/30 text-yellow-400 text-[9px] uppercase hover:bg-yellow-500/10 rounded transition-all"
                            >
                              Unverify
                            </button>
                          ) : null}
                          <button
                            onClick={() => handleAdminUpdate(camp.id, { active: !camp.active })}
                            disabled={isUpdating === camp.id}
                            className={`px-2 py-0.5 border ${camp.active ? 'border-red-500/30 text-red-400' : 'border-green-500/30 text-green-400'} text-[9px] uppercase hover:opacity-80 rounded transition-all`}
                          >
                            {camp.active ? 'Disable' : 'Enable'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {editingCampaign && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="admin-card max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <h3 className="text-sm font-bold uppercase mb-4 tracking-widest">Edit Campaign (Admin)</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] uppercase text-[var(--text-secondary)] mb-1">Name</label>
                  <input
                    type="text"
                    defaultValue={editingCampaign.name}
                    id="edit-name"
                    className="w-full px-3 py-1.5 bg-black/20 border border-[var(--glass-border)] rounded text-[11px]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-[var(--text-secondary)] mb-1">Description</label>
                  <textarea
                    defaultValue={editingCampaign.description}
                    id="edit-desc"
                    className="w-full px-3 py-1.5 bg-black/20 border border-[var(--glass-border)] rounded text-[11px]"
                    rows={2}
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-[var(--text-secondary)] mb-1">Creative URL (Image/Video)</label>
                  <input
                    type="text"
                    defaultValue={editingCampaign.bannerUrl}
                    id="edit-banner"
                    className="w-full px-3 py-1.5 bg-black/20 border border-[var(--glass-border)] rounded text-[11px]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-[var(--text-secondary)] mb-1">Target URL</label>
                  <input
                    type="text"
                    defaultValue={editingCampaign.targetUrl}
                    id="edit-target"
                    className="w-full px-3 py-1.5 bg-black/20 border border-[var(--glass-border)] rounded text-[11px]"
                  />
                </div>
              </div>
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => {
                    const name = (document.getElementById('edit-name') as HTMLInputElement).value
                    const description = (document.getElementById('edit-desc') as HTMLTextAreaElement).value
                    const bannerUrl = (document.getElementById('edit-banner') as HTMLInputElement).value
                    const targetUrl = (document.getElementById('edit-target') as HTMLInputElement).value
                    handleAdminUpdate(editingCampaign.id, { name, description, bannerUrl, targetUrl })
                  }}
                  disabled={isUpdating === editingCampaign.id}
                  className="px-6 py-2 bg-black text-white text-xs uppercase font-bold border-2 border-black hover:bg-gray-800 rounded flex-1 transition-all"
                >
                  {isUpdating === editingCampaign.id ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  onClick={() => setEditingCampaign(null)}
                  className="px-6 py-2 border border-[var(--glass-border)] text-xs uppercase hover:bg-[var(--glass-bg-hover)] rounded"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}


        {/* Recent Activity */}
        <div className="admin-card">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">Recent Activity</h2>
            <button
              onClick={loadActivity}
              className="text-[9px] text-[var(--accent-primary-solid)] hover:underline uppercase transition-all"
            >
              Refresh
            </button>
          </div>
          <div className="space-y-2">
            {recentActivities.length === 0 ? (
              <p className="text-[10px] text-[var(--text-tertiary)] uppercase text-center py-4">No recent activity found</p>
            ) : (
              recentActivities.map((activity, idx) => (
                <div key={activity.id || idx} className="flex justify-between items-center py-1.5 border-b border-gray-100 last:border-0">
                  <span className="text-[var(--text-secondary)] text-[11px]">{activity.message}</span>
                  <span className="text-[var(--text-tertiary)] text-[10px]">
                    {new Date(activity.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Unauthorized Overlay */}
      {isUnauthorized && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="glass-card p-8 max-w-md w-full text-center border-red-500/20 shadow-2xl shadow-red-500/5">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
              <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2 uppercase">Unauthorized Access</h3>
            <p className="text-[var(--text-secondary)] text-xs mb-6 uppercase leading-relaxed">
              Your wallet address <span className="font-mono text-[var(--accent-primary-solid)]">{address?.slice(0, 6)}...{address?.slice(-4)}</span> is not authorized to access the Admin Dashboard.
            </p>
            <div className="space-y-3">
              <p className="text-[10px] text-[var(--text-tertiary)] uppercase">
                If you believe this is an error, please ensure your address is added to the <code className="bg-black/40 px-1 py-0.5 rounded text-red-400">ADMIN_WALLETS</code> configuration.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}