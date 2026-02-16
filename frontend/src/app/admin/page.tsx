'use client'

import { useState, useEffect } from 'react'

interface OracleStatus {
  isRunning: boolean
  chain: string
  managerAddress: string
  oracleAddress: string
}

interface SystemStats {
  totalAds: number
  totalPublishers: number
  totalImpressions: number
  totalRevenue: number
}

export default function AdminDashboard() {
  const [oracleStatus, setOracleStatus] = useState<OracleStatus | null>(null)
  const [systemStats, setSystemStats] = useState<SystemStats>({
    totalAds: 0,
    totalPublishers: 0,
    totalImpressions: 0,
    totalRevenue: 0
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      // Load oracle status
      const oracleResponse = await fetch('/api/oracle?action=status')
      if (oracleResponse.ok) {
        const oracleData = await oracleResponse.json()
        setOracleStatus(oracleData)
      }

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

  const triggerAnalytics = async () => {
    try {
      const response = await fetch('/api/analytics/trigger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'aggregate'
        })
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

  const toggleOracle = async () => {
    if (!oracleStatus) return

    try {
      const action = oracleStatus.isRunning ? 'stop' : 'start'
      const response = await fetch('/api/oracle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action })
      })

      if (response.ok) {
        await loadData() // Reload data
        alert(`Oracle ${action}ed successfully`)
      } else {
        alert(`Failed to ${action} oracle`)
      }
    } catch (error) {
      console.error('Error toggling oracle:', error)
      alert('Error toggling oracle')
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
        <h1 className="text-base font-bold text-[var(--text-primary)] mb-6 uppercase tracking-wider">Admin Dashboard</h1>

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
            <div className="text-[var(--text-secondary)] text-[10px] uppercase tracking-tight">Total Revenue (USDC)</div>
          </div>
        </div>

        {/* Oracle Status */}
        <div className="glass-card rounded-lg p-4 mb-6">
          <h2 className="text-xs font-semibold text-[var(--text-primary)] mb-3 uppercase tracking-wider">Oracle Status</h2>
          {oracleStatus ? (
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${oracleStatus.isRunning ? 'bg-[var(--accent-primary-solid)]' : 'bg-red-500'}`}></div>
                <span className="text-[var(--text-primary)] text-[10px] uppercase">
                  {oracleStatus.isRunning ? 'Running' : 'Stopped'}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px]">
                <div className="flex justify-between md:block border-b border-[var(--glass-border)] md:border-none py-1">
                  <span className="text-[var(--text-secondary)]">Chain:</span>
                  <span className="text-[var(--text-primary)] ml-2">{oracleStatus.chain}</span>
                </div>
                <div className="flex justify-between md:block border-b border-[var(--glass-border)] md:border-none py-1">
                  <span className="text-[var(--text-secondary)]">Oracle Address:</span>
                  <span className="text-[var(--text-primary)] ml-2 font-mono">{oracleStatus.oracleAddress || 'N/A'}</span>
                </div>
                <div className="flex justify-between md:block py-1 col-span-1 md:col-span-2">
                  <span className="text-[var(--text-secondary)]">Manager Contract:</span>
                  <span className="text-[var(--text-primary)] ml-2 font-mono truncate">{oracleStatus.managerAddress}</span>
                </div>
              </div>
              <button
                onClick={toggleOracle}
                className={`btn ${oracleStatus.isRunning
                    ? 'bg-red-900/40 text-red-500 border border-red-500/50 hover:bg-red-900/60'
                    : 'btn-primary'
                  } px-4 py-1.5`}
              >
                {oracleStatus.isRunning ? 'Stop Oracle' : 'Start Oracle'}
              </button>
            </div>
          ) : (
            <div className="text-[var(--text-secondary)]">Oracle status unavailable</div>
          )}
        </div>

        {/* System Controls */}
        <div className="glass-card rounded-lg p-4 mb-6">
          <h2 className="text-xs font-semibold text-[var(--text-primary)] mb-3 uppercase tracking-wider">System Controls</h2>
          <div className="space-y-3">
            <button
              onClick={triggerAnalytics}
              className="btn btn-primary px-4 py-1.5"
            >
              Trigger Analytics Aggregation
            </button>
            <p className="text-[10px] text-[var(--text-secondary)] uppercase">
              Manually trigger analytics aggregation for the current day
            </p>
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
              <span className="text-[var(--text-secondary)] text-[11px]">Payout processed for publisher 0x123...</span>
              <span className="text-[var(--text-tertiary)] text-[10px]">15 minutes ago</span>
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