'use client'

import { useCallback, useEffect, useState } from 'react'
import type { CampaignV2, GlobalAdvertiserStats } from '@/components/advertiser/types'

const EMPTY_GLOBAL: GlobalAdvertiserStats = {
  totalImpressions: 0,
  totalClicks: 0,
  avgCtr: 0,
  totalSpent: 0,
  activeCampaigns: 0,
}

/**
 * Loads campaigns owned by `wallet` and aggregates lifetime impressions/clicks
 * across all of them. Pure fetch — no on-chain reads here.
 */
export function useAdvertiserCampaigns(wallet: string | undefined) {
  const [campaigns, setCampaigns] = useState<CampaignV2[]>([])
  const [globalStats, setGlobalStats] = useState<GlobalAdvertiserStats>(EMPTY_GLOBAL)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (address: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaigns/list?wallet=${address}`)
      if (!res.ok) throw new Error('Failed to load campaigns')
      const data = await res.json()
      const list = (data.campaigns ?? []) as CampaignV2[]
      setCampaigns(list)

      const active = list.filter((c) => c.active && !c.paused).length
      const totalSpent = list.reduce((s, c) => s + (c.spent ?? 0), 0)
      setGlobalStats({ ...EMPTY_GLOBAL, activeCampaigns: active, totalSpent })

      // Lifetime aggregation: 365d slice per campaign. Errors per-campaign are
      // tolerated so a single failure doesn't blank the dashboard.
      if (list.length > 0) {
        const results = await Promise.allSettled(
          list.map((c) =>
            fetch(`/api/analytics?campaignId=${c.id}&days=365`).then((r) =>
              r.ok ? r.json() : Promise.resolve({ impressions: 0, clicks: 0 })
            )
          )
        )
        let totalImpressions = 0
        let totalClicks = 0
        for (const r of results) {
          if (r.status === 'fulfilled') {
            totalImpressions += r.value.impressions ?? 0
            totalClicks += r.value.clicks ?? 0
          }
        }
        const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0
        setGlobalStats((prev) => ({ ...prev, totalImpressions, totalClicks, avgCtr }))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load campaigns')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const refresh = useCallback(() => {
    if (wallet) void load(wallet)
  }, [wallet, load])

  useEffect(() => {
    if (wallet) void load(wallet)
  }, [wallet, load])

  return { campaigns, globalStats, isLoading, error, refresh }
}
