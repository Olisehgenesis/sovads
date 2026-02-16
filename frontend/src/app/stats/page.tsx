'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Stats {
  totalAds: number
  totalUniqueImpressions: number
  totalImpressions: number
  totalClicks: number
  totalPublishers: number
  activeCampaigns: number
  totalRevenue: number
}

export default function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadStats()
    // Refresh stats every 30 seconds
    const interval = setInterval(loadStats, 30000)
    return () => clearInterval(interval)
  }, [])

  const loadStats = async () => {
    try {
      const response = await fetch('/api/stats')
      if (!response.ok) {
        throw new Error('Failed to load stats')
      }
      const data = await response.json()
      setStats(data)
      setError(null)
    } catch (err) {
      console.error('Error loading stats:', err)
      setError(err instanceof Error ? err.message : 'Failed to load stats')
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-transparent text-[var(--text-primary)] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-[var(--text-secondary)]">Loading statistics...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-transparent text-[var(--text-primary)] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">Error: {error}</p>
          <button
            onClick={loadStats}
            className="btn btn-primary px-6 py-2"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!stats) {
    return null
  }

  const clickThroughRate = stats.totalImpressions > 0
    ? ((stats.totalClicks / stats.totalImpressions) * 100).toFixed(2)
    : '0.00'

  return (
    <div className="min-h-screen bg-transparent text-[var(--text-primary)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            Platform Statistics
          </h1>
          <p className="text-lg text-[var(--text-secondary)] mb-6">
            Real-time metrics and insights from the SovAds network
          </p>
          <Link
            href="/"
            className="text-primary hover:underline text-sm font-medium"
          >
            ← Back to Home
          </Link>
        </div>

        {/* Main Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Total Unique Impressions */}
          <div className="glass-card rounded-lg p-6 hover:border-primary/50 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <div className="text-3xl">👁️</div>
              <div className="text-xs text-[var(--text-secondary)]60 bg-primary/10 px-2 py-1 rounded-full">
                Unique
              </div>
            </div>
            <div className="text-3xl font-bold text-[var(--text-primary)] mb-1">
              {stats.totalUniqueImpressions.toLocaleString()}
            </div>
            <div className="text-sm text-[var(--text-secondary)]">
              Total Unique Impressions
            </div>
            <div className="text-xs text-[var(--text-secondary)]50 mt-2">
              {stats.totalImpressions.toLocaleString()} total impressions
            </div>
          </div>

          {/* Total Ads */}
          <div className="glass-card rounded-lg p-6 hover:border-primary/50 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <div className="text-3xl">📢</div>
              <div className="text-xs text-[var(--text-secondary)]60 bg-primary/10 px-2 py-1 rounded-full">
                Campaigns
              </div>
            </div>
            <div className="text-3xl font-bold text-[var(--text-primary)] mb-1">
              {stats.totalAds.toLocaleString()}
            </div>
            <div className="text-sm text-[var(--text-secondary)]">
              Total Ads
            </div>
            <div className="text-xs text-[var(--text-secondary)]50 mt-2">
              {stats.activeCampaigns} active
            </div>
          </div>

          {/* Total Clicks */}
          <div className="glass-card rounded-lg p-6 hover:border-primary/50 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <div className="text-3xl">🖱️</div>
              <div className="text-xs text-[var(--text-secondary)]60 bg-primary/10 px-2 py-1 rounded-full">
                Engagement
              </div>
            </div>
            <div className="text-3xl font-bold text-[var(--text-primary)] mb-1">
              {stats.totalClicks.toLocaleString()}
            </div>
            <div className="text-sm text-[var(--text-secondary)]">
              Total Clicks
            </div>
            <div className="text-xs text-[var(--text-secondary)]50 mt-2">
              {clickThroughRate}% CTR
            </div>
          </div>

          {/* Total Publishers */}
          <div className="glass-card rounded-lg p-6 hover:border-primary/50 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <div className="text-3xl">🌐</div>
              <div className="text-xs text-[var(--text-secondary)]60 bg-primary/10 px-2 py-1 rounded-full">
                Network
              </div>
            </div>
            <div className="text-3xl font-bold text-[var(--text-primary)] mb-1">
              {stats.totalPublishers.toLocaleString()}
            </div>
            <div className="text-sm text-[var(--text-secondary)]">
              Total Publishers
            </div>
            <div className="text-xs text-[var(--text-secondary)]50 mt-2">
              Sites in network
            </div>
          </div>
        </div>

        {/* Additional Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Revenue Card */}
          <div className="glass-card rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Revenue</h2>
            <div className="text-4xl font-bold text-primary mb-2">
              ${stats.totalRevenue.toFixed(2)}
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              Total revenue generated across all campaigns
            </p>
          </div>

          {/* Performance Metrics */}
          <div className="glass-card rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Performance</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[var(--text-secondary)]">Click-Through Rate</span>
                <span className="text-lg font-semibold">{clickThroughRate}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[var(--text-secondary)]">Active Campaigns</span>
                <span className="text-lg font-semibold">{stats.activeCampaigns}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[var(--text-secondary)]">Total Impressions</span>
                <span className="text-lg font-semibold">{stats.totalImpressions.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Last Updated */}
        <div className="mt-8 text-center text-sm text-[var(--text-secondary)]50">
          Last updated: {new Date().toLocaleTimeString()} • Auto-refreshes every 30 seconds
        </div>
      </div>
    </div>
  )
}

