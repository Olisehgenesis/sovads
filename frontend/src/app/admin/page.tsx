'use client'

import { useState, useEffect } from 'react'
import { useAds } from '@/hooks/useAds'
import { GLOBAL_TREASURY_CAMPAIGN_ID } from '@/lib/sovadgs'
import { CELO_TOKENS } from '@/lib/tokens'

interface SystemStats {
  totalAds: number
  totalPublishers: number
  totalImpressions: number
  totalRevenue: number
}

export default function AdminDashboard() {
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

  // Find G$ token address from configuration
  const gsTokenAddress = Object.values(CELO_TOKENS).find(t => t.symbol === 'G$')?.address || ''

  useEffect(() => {
    loadData()
  }, [])

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