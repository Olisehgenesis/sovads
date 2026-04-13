'use client'

import { useState, useEffect } from 'react'
import { formatEther } from 'viem'
import { usePublicClient, useReadContract } from 'wagmi'
import { sovAdsStreamingAbi } from '@/contract/sovAdsStreamingAbi'
import { SOVADS_STREAMING_ADDRESS, chainId } from '@/lib/chain-config'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

interface AnalyticsStats {
  campaignCount: number
  publisherCount: number
  totalBudget: bigint
  remainingBudget: bigint
  totalPublisherBudget: bigint
  totalStakerBudget: bigint
  activeAdminFlows: number
  activePublisherFlows: number
  activeStakerFlows: number
}

interface DailyStat {
  date: string
  impressions: number
  clicks: number
  revenue: number
}

export default function AnalyticsPage() {
  const publicClient = usePublicClient({ chainId })

  const { data: campaignCountData } = useReadContract({
    address: SOVADS_STREAMING_ADDRESS as `0x${string}`,
    abi: sovAdsStreamingAbi,
    functionName: 'campaignCount',
    chainId,
  })

  const { data: totalStaked } = useReadContract({
    address: SOVADS_STREAMING_ADDRESS as `0x${string}`,
    abi: sovAdsStreamingAbi,
    functionName: 'totalStaked',
    chainId,
  })

  const [stats, setStats] = useState<AnalyticsStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [history, setHistory] = useState<DailyStat[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [days, setDays] = useState<number>(30)

  useEffect(() => {
    async function loadAnalytics() {
      setIsLoading(true)
      try {
        // Primary source: DB stats endpoint
        const response = await fetch('/api/stats')
        if (!response.ok) {
          throw new Error('DB stats fetch failed')
        }

        const dbData = await response.json()
        const dbTotalBudget = Number(dbData.totalBudget ?? 0)
        const dbTotalPublisherBudget = Number(dbData.totalPublisherBudget ?? 0)

        const dbRemainingBudget = Number(dbData.remainingBudget ?? (dbTotalBudget - Number(dbData.totalRevenue ?? 0)))
        const s: AnalyticsStats = {
          campaignCount: Number(dbData.campaignCount ?? dbData.totalAds ?? 0),
          publisherCount: Number(dbData.publisherCount ?? dbData.totalPublishers ?? 0),
          totalBudget: BigInt(Math.floor(dbTotalBudget * 1e18)),
          remainingBudget: BigInt(Math.floor(dbRemainingBudget * 1e18)),
          totalPublisherBudget: BigInt(Math.floor(dbTotalPublisherBudget * 1e18)),
          totalStakerBudget: 0n,
          activeAdminFlows: 0,
          activePublisherFlows: 0,
          activeStakerFlows: 0,
        }

        // contract fallback (for security/consistency) if campaign count or budgets are missing
        if (!publicClient || campaignCountData == null) {
          setStats(s)
          return
        }

        // If DB has zero or missing for any critical field, fallback to on-chain where available.
        const canUseFallback = Number(campaignCountData) > 0
        if (canUseFallback && (s.campaignCount === 0 || s.totalBudget === 0n || s.totalPublisherBudget === 0n)) {
          const count = Number(campaignCountData)
          const fallback: AnalyticsStats = {
            campaignCount: count,
            publisherCount: s.publisherCount,
            totalBudget: 0n,
            remainingBudget: 0n,
            totalPublisherBudget: 0n,
            totalStakerBudget: 0n,
            activeAdminFlows: 0,
            activePublisherFlows: 0,
            activeStakerFlows: 0,
          }

          for (let i = 1; i <= count; i++) {
            try {
              const c: any = await publicClient.readContract({
                address: SOVADS_STREAMING_ADDRESS as `0x${string}`,
                abi: sovAdsStreamingAbi,
                functionName: 'getCampaign',
                args: [BigInt(i)],
              })

              fallback.totalBudget += BigInt(c.totalBudget)
              fallback.totalPublisherBudget += BigInt(c.publisherBudget)
              fallback.totalStakerBudget += BigInt(c.stakerBudget)
              if (c.adminStreamActive) fallback.activeAdminFlows += 1
              if (c.publisherFlowActive) fallback.activePublisherFlows += 1
              if (c.stakerFlowActive) fallback.activeStakerFlows += 1
            } catch (e) {
              console.warn('could not fetch campaign', i, e)
            }
          }

          s.campaignCount = fallback.campaignCount
          s.totalBudget = fallback.totalBudget > 0n ? fallback.totalBudget : s.totalBudget
          s.remainingBudget = fallback.totalBudget > 0n ? fallback.totalBudget : s.remainingBudget
          s.totalPublisherBudget = fallback.totalPublisherBudget > 0n ? fallback.totalPublisherBudget : s.totalPublisherBudget
          // keep staker/flow values in fallback struct but not shown in UI
          s.totalStakerBudget = fallback.totalStakerBudget
          s.activeAdminFlows = fallback.activeAdminFlows
          s.activePublisherFlows = fallback.activePublisherFlows
          s.activeStakerFlows = fallback.activeStakerFlows
        }

        setStats(s)
      } catch (e) {
        // On any DB failure, fallback to on-chain contract metrics
        console.warn('DB analytics load failed, falling back to contract', e)

        if (!publicClient || campaignCountData == null) {
          setError(e instanceof Error ? e.message : String(e))
          setIsLoading(false)
          return
        }

        const count = Number(campaignCountData)
        const onchain: AnalyticsStats = {
          campaignCount: count,
          publisherCount: 0,
          totalBudget: 0n,
          remainingBudget: 0n,
          totalPublisherBudget: 0n,
          totalStakerBudget: 0n,
          activeAdminFlows: 0,
          activePublisherFlows: 0,
          activeStakerFlows: 0,
        }

        for (let i = 1; i <= count; i++) {
          try {
            const c: any = await publicClient.readContract({
              address: SOVADS_STREAMING_ADDRESS as `0x${string}`,
              abi: sovAdsStreamingAbi,
              functionName: 'getCampaign',
              args: [BigInt(i)],
            })

            onchain.totalBudget += BigInt(c.totalBudget)
            onchain.totalPublisherBudget += BigInt(c.publisherBudget)
            onchain.totalStakerBudget += BigInt(c.stakerBudget)
            if (c.adminStreamActive) onchain.activeAdminFlows += 1
            if (c.publisherFlowActive) onchain.activePublisherFlows += 1
            if (c.stakerFlowActive) onchain.activeStakerFlows += 1
          } catch (e2) {
            console.warn('could not fetch campaign', i, e2)
          }
        }

        setStats(onchain)
      } finally {
        setIsLoading(false)
      }
    }

    loadAnalytics()
  }, [publicClient, campaignCountData])

  // fetch historical breakdown from the analytics API
  useEffect(() => {
    async function loadHistory() {
      setHistoryLoading(true)
      try {
        const res = await fetch(`/api/analytics?days=${days}`)
        if (res.ok) {
          const data = await res.json()
          setHistory(data.dailyStats || [])
          setHistoryError(null)
        } else {
          const err = await res.text()
          setHistoryError(err || 'Failed to load history')
        }
      } catch (e) {
        setHistoryError(e instanceof Error ? e.message : String(e))
      } finally {
        setHistoryLoading(false)
      }
    }

    loadHistory()
  }, [days])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="mb-8">
            <div className="h-10 w-64 animate-pulse bg-[#e5e5e5] border-2 border-black mb-4" />
            <div className="h-4 w-96 animate-pulse bg-[#e5e5e5] border border-black" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="border-2 border-black bg-white p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <div className="h-3 w-24 animate-pulse bg-[#e5e5e5] mb-4" />
                <div className="h-8 w-16 animate-pulse bg-[#e5e5e5]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="border-2 border-black bg-[#fef2f2] p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <h2 className="text-base font-heading mb-2">Failed to load analytics</h2>
            <p className="text-sm text-[var(--text-secondary)]">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!stats) {
    return null
  }

  const formatG = (value: bigint) => `${Number(formatEther(value)).toLocaleString()} G$`

  return (
    <div className="min-h-screen bg-transparent text-[var(--text-primary)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="mb-10">
          <h1 className="text-4xl sm:text-5xl font-heading uppercase tracking-tight mb-3">
            Network Analytics
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mb-4 max-w-2xl">
            On-chain metrics for SovAds streaming contract — campaigns, budgets, and active flows.
          </p>
          <a href="/" className="text-xs font-black uppercase tracking-wider hover:underline decoration-2">← Back to Home</a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="border-2 border-black bg-white p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-3">Campaigns</p>
            <p className="text-4xl font-heading">{stats.campaignCount}</p>
          </div>
          <div className="border-2 border-black bg-white p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-3">Publishers</p>
            <p className="text-4xl font-heading">{stats.publisherCount}</p>
          </div>
          <div className="border-2 border-black bg-white p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-3">Budget Remaining</p>
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://gooddollar.org/wp-content/uploads/2021/06/GD-Logo-Icon.svg" alt="G$" className="w-6 h-6 flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
              <p className="text-2xl font-heading break-all">{formatG(stats.remainingBudget)}</p>
            </div>
          </div>
        </div>

        {/* historical chart */}
        <div className="mb-12">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <h2 className="text-2xl font-heading uppercase">
              Activity — {days > 0 ? `last ${days} days` : 'all time'}
            </h2>
            <div className="flex gap-2">
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="border-2 border-black bg-white px-3 py-2 text-xs font-bold uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
              >
                {[7, 14, 30, 60, 90, 0].map((d) => (
                  <option key={d} value={d}>{d === 0 ? 'All' : `${d}d`}</option>
                ))}
              </select>
            </div>
          </div>

          {historyLoading ? (
            <div className="border-2 border-black bg-white p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 border-2 border-black border-t-transparent animate-spin" />
                <span className="text-xs font-black uppercase tracking-wider">Loading chart data…</span>
              </div>
            </div>
          ) : historyError ? (
            <div className="border-2 border-black bg-[#fef2f2] p-4 text-sm font-bold text-[#ef4444]">{historyError}</div>
          ) : (
            <div className="border-2 border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={history.map((h) => ({
                date: h.date,
                impressions: h.impressions,
                clicks: h.clicks,
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fontWeight: 700 }} />
                <YAxis tick={{ fontSize: 11, fontWeight: 700 }} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="impressions"
                  stroke="#000000"
                  strokeWidth={2}
                  name="Impressions"
                />
                <Line
                  type="monotone"
                  dataKey="clicks"
                  stroke="#22c55e"
                  strokeWidth={2}
                  name="Clicks"
                />
              </LineChart>
            </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
