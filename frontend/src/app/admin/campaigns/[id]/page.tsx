'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import AdvertiserIcon from '@/components/advertiser/AdvertiserIcon'
import {
  Alert,
  EmptyState,
  Metric,
  Section,
  Skeleton,
  StatusBadge,
  formatNumber,
  formatPct,
  type StatusTone,
} from '@/components/advertiser/ui'

type CampaignPayload = {
  id: string
  name: string
  description?: string
  bannerUrl: string
  targetUrl: string
  budget: number
  spent: number
  cpc: number
  active: boolean
  paused?: boolean
  tokenAddress?: string
  tags?: string[]
  targetLocations?: string[]
  mediaType?: 'image' | 'video'
  onChainId?: number
  createdAt?: string | null
  verificationStatus?: string
}

type AnalyticsResponse = {
  period: string
  impressions: number
  clicks: number
  ctr: number
  totalRevenue: number
  dailyStats: Array<{ date: string; impressions: number; clicks: number; revenue: number }>
}

function statusForCampaign(c: CampaignPayload): { label: string; tone: StatusTone } {
  const vs = (c.verificationStatus || '').toLowerCase()
  if (vs === 'rejected') return { label: 'Rejected', tone: 'danger' }
  if (vs === 'review' || vs === 'pending') return { label: 'In review', tone: 'info' }
  if (c.paused) return { label: 'Paused', tone: 'warning' }
  if (c.active) return { label: 'Active', tone: 'success' }
  return { label: 'Inactive', tone: 'neutral' }
}

export default function AdminCampaignPage({ params }: { params: { id: string } }) {
  const [campaign, setCampaign] = useState<CampaignPayload | null>(null)
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const [campaignRes, analyticsRes] = await Promise.all([
          fetch(`/api/campaigns/detail?id=${encodeURIComponent(params.id)}`),
          fetch(`/api/analytics?campaignId=${encodeURIComponent(params.id)}&days=30`),
        ])

        if (!campaignRes.ok) {
          throw new Error(`Campaign load failed (${campaignRes.status})`)
        }
        if (!analyticsRes.ok) {
          throw new Error(`Analytics load failed (${analyticsRes.status})`)
        }

        const campaignData = await campaignRes.json()
        const analyticsData = await analyticsRes.json()

        setCampaign(campaignData.campaign)
        setAnalytics(analyticsData)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch campaign data')
      } finally {
        setIsLoading(false)
      }
    }

    load()
  }, [params.id])

  return (
    <div className="min-h-screen bg-[#F5F3F0]">
      {/* Top bar */}
      <div className="border-b border-[#E5E5E5] bg-white">
        <div className="mx-auto flex max-w-screen-xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#888]">
              Admin · Campaign
            </p>
            <h1 className="truncate text-[15px] font-bold text-[#2D2D2D]">
              {campaign?.name ?? 'Campaign details'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/campaigns"
              className="inline-flex items-center gap-1.5 border border-[#E5E5E5] bg-white px-3 py-2 text-[12px] font-medium text-[#2D2D2D] hover:bg-[#FAFAF8]"
            >
              ← All campaigns
            </Link>
            <Link
              href={`/edit-campaign/${encodeURIComponent(params.id)}`}
              className="inline-flex items-center gap-1.5 border border-[#2D2D2D] bg-[#2D2D2D] px-3 py-2 text-[12px] font-semibold text-white shadow-[2px_2px_0_0_#2D2D2D] hover:bg-[#1F1F1F]"
            >
              <AdvertiserIcon name="settings" className="h-3.5 w-3.5" />
              Edit
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-screen-xl px-4 py-6">
        <main className="space-y-5">
          {error && <Alert tone="error">{error}</Alert>}

          {isLoading && !campaign ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : !campaign ? (
            <EmptyState
              icon="campaign"
              title="Campaign not found"
              description="It may have been deleted or you don’t have permission to view it."
              action={
                <Link
                  href="/admin/campaigns"
                  className="inline-flex items-center gap-1.5 border border-[#2D2D2D] bg-[#2D2D2D] px-3 py-2 text-[12px] font-semibold text-white"
                >
                  Back to list
                </Link>
              }
            />
          ) : (
            <>
              {/* KPI hero */}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Metric
                  accent="hero"
                  label="Status"
                  value={statusForCampaign(campaign).label}
                  hint={`CPC ${campaign.cpc}`}
                />
                <Metric
                  label="Budget"
                  value={formatNumber(campaign.budget)}
                  hint={`Spent ${formatNumber(campaign.spent)}`}
                />
                <Metric
                  label="Impressions (30d)"
                  value={analytics ? formatNumber(analytics.impressions) : '—'}
                  loading={!analytics}
                />
                <Metric
                  label="CTR (30d)"
                  value={analytics ? formatPct(analytics.ctr, 2) : '—'}
                  loading={!analytics}
                />
              </div>

              {/* Details */}
              <Section title="Basic info">
                <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
                  <Row label="ID" value={<span className="font-mono text-[12px]">{campaign.id}</span>} />
                  <Row
                    label="On-chain ID"
                    value={campaign.onChainId != null ? String(campaign.onChainId) : '—'}
                  />
                  <Row label="Media" value={campaign.mediaType ?? '—'} />
                  <Row
                    label="Token"
                    value={
                      campaign.tokenAddress ? (
                        <span className="font-mono text-[12px]">{campaign.tokenAddress}</span>
                      ) : (
                        '—'
                      )
                    }
                  />
                  <Row
                    label="Created"
                    value={
                      campaign.createdAt
                        ? new Date(campaign.createdAt).toLocaleString()
                        : '—'
                    }
                  />
                  <Row
                    label="State"
                    value={
                      <StatusBadge tone={statusForCampaign(campaign).tone}>
                        {statusForCampaign(campaign).label}
                      </StatusBadge>
                    }
                  />
                </dl>
                {campaign.description && (
                  <p className="mt-4 border-t border-[#EFEFEF] pt-3 text-[13px] leading-5 text-[#444]">
                    {campaign.description}
                  </p>
                )}
              </Section>

              <Section title="Targeting">
                <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-[13px]">
                  <Row
                    label="Target URL"
                    value={
                      <a
                        className="break-all text-[#2D2D2D] underline hover:text-[#1F1F1F]"
                        href={campaign.targetUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {campaign.targetUrl}
                      </a>
                    }
                  />
                  <Row
                    label="Tags"
                    value={campaign.tags?.length ? campaign.tags.join(', ') : '—'}
                  />
                  <Row
                    label="Locations"
                    value={
                      campaign.targetLocations?.length
                        ? campaign.targetLocations.join(', ')
                        : '—'
                    }
                  />
                </dl>
              </Section>

              <Section title="Daily performance" description="Last 30 days">
                {!analytics ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-7 w-full" />
                    ))}
                  </div>
                ) : analytics.dailyStats.length === 0 ? (
                  <EmptyState
                    icon="analytics"
                    title="No traffic in the last 30 days"
                    description="Impressions and clicks will appear here once they accumulate."
                  />
                ) : (
                  <div className="overflow-x-auto border border-[#EFEFEF]">
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="bg-[#FAFAF8] text-[11px] font-semibold uppercase tracking-wide text-[#666]">
                          <th className="px-3 py-2 text-left">Date</th>
                          <th className="px-3 py-2 text-right">Impressions</th>
                          <th className="px-3 py-2 text-right">Clicks</th>
                          <th className="px-3 py-2 text-right">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.dailyStats.map((day, i) => (
                          <tr
                            key={day.date}
                            className={`border-t border-[#EFEFEF] ${
                              i % 2 === 1 ? 'bg-[#FCFCFB]' : 'bg-white'
                            }`}
                          >
                            <td className="px-3 py-2 text-[#2D2D2D]">{day.date}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {formatNumber(day.impressions)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {formatNumber(day.clicks)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-[#666]">
                              {day.revenue.toFixed(6)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>
            </>
          )}
        </main>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[#EFEFEF] py-1.5 last:border-b-0 sm:border-b-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-[#888]">{label}</dt>
      <dd className="min-w-0 text-right text-[#2D2D2D]">{value}</dd>
    </div>
  )
}
