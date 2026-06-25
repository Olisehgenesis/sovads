"use client"

import { useEffect, useState } from 'react'

type Stats = {
  totalImpressions: number
  totalPublishers: number
  activeCampaigns: number
  totalGsRedeemed: number
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

export default function StatsStrip() {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setStats(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const items = [
    { label: 'Verified Impressions', value: stats ? formatNumber(stats.totalImpressions) : '—' },
    { label: 'Active Publishers', value: stats ? formatNumber(stats.totalPublishers) : '—' },
    { label: 'Rewards Distributed', value: stats ? formatMoney(stats.totalGsRedeemed) : '—' },
    { label: 'Active Campaigns', value: stats ? formatNumber(stats.activeCampaigns) : '—' },
  ]

  return (
    <section
      aria-label="Protocol statistics"
      className="border-y-4 border-black bg-black text-white"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ul className="grid grid-cols-2 md:grid-cols-4 divide-y-2 md:divide-y-0 md:divide-x-2 divide-white/20">
          {items.map((item) => (
            <li key={item.label} className="px-4 py-8 sm:py-10 text-center">
              <div className="font-heading text-4xl sm:text-5xl tracking-tight">
                {item.value}
              </div>
              <div className="mt-2 text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] text-white/70">
                {item.label}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
