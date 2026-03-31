'use client'

import { useState, useEffect } from 'react'
import { formatEther } from 'viem'
import { usePublicClient, useReadContract } from 'wagmi'
import { sovAdsStreamingAbi } from '@/contract/sovAdsStreamingAbi'
import { SOVADS_STREAMING_ADDRESS, chainId } from '@/lib/chain-config'
import Link from 'next/link'
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

        const s: AnalyticsStats = {
          campaignCount: Number(dbData.campaignCount ?? dbData.totalAds ?? 0),
          publisherCount: Number(dbData.publisherCount ?? dbData.totalPublishers ?? 0),
          totalBudget: BigInt(Math.floor(dbTotalBudget * 1e18)),
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500">Error loading analytics: {error}</p>
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
        <div className="mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            Network Analytics
          </h1>
          <p className="text-lg text-[var(--text-secondary)] mb-6">
            On‑chain metrics for SovAds streaming contract. See TVL, budgets and active flows.
          </p>
          <Link
            href="/"
            className="text-primary hover:underline text-sm font-medium"
          >
            ← Back to Home
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="glass-card rounded-lg p-6">
            <h2 className="text-xs font-semibold mb-2">Campaigns</h2>
            <div className="text-3xl font-bold">{stats.campaignCount}</div>
          </div>



          <div className="glass-card rounded-lg p-6">
            <h2 className="text-xs font-semibold mb-2">Total Budgets</h2>
            <div className="text-lg">
              {formatG(stats.totalBudget)}
            </div>
          </div>

          <div className="glass-card rounded-lg p-6">
            <h2 className="text-xs font-semibold mb-2">Publisher Count</h2>
            <div className="text-3xl font-bold">{stats.publisherCount}</div>
          </div>


        </div>

        {/* historical chart */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">
            Activity over {days > 0 ? `last ${days} days` : 'all time'}
          </h2>
            <div className="flex gap-2">
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="border px-2 py-1 rounded"
              >
                {[7, 14, 30, 60, 90, 0].map((d) => (
                  <option key={d} value={d}>{d === 0 ? 'All' : `${d}d`}</option>
                ))}
              </select>
            </div>
          </div>

          {historyLoading ? (
            <div className="text-center py-10">Loading history…</div>
          ) : historyError ? (
            <div className="text-red-500">{historyError}</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={history.map((h) => ({
                date: h.date,
                impressions: h.impressions,
                clicks: h.clicks,
              }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="impressions"
                  stroke="#0088FE"
                  name="Impressions"
                />
                <Line
                  type="monotone"
                  dataKey="clicks"
                  stroke="#FFBB28"
                  name="Clicks"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}
