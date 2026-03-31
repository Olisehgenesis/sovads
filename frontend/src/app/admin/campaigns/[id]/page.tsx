'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

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
  tokenAddress?: string
  tags?: string[]
  targetLocations?: string[]
  mediaType?: 'image' | 'video'
  onChainId?: number
  createdAt?: string | null
}

type AnalyticsResponse = {
  period: string
  impressions: number
  clicks: number
  ctr: number
  totalRevenue: number
  dailyStats: Array<{ date: string; impressions: number; clicks: number; revenue: number }>
}

export default function AdminCampaignPage({ params }: { params: { id: string } }) {
  const router = useRouter()
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

  if (isLoading) {
    return <div className="p-6 text-center">Loading campaign details…</div>
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-600 font-bold mb-4">Error: {error}</p>
        <button className="btn btn-outline" onClick={() => router.back()}>
          Back
        </button>
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="p-6">
        <p className="text-red-600 font-bold mb-4">Campaign not found.</p>
        <button className="btn btn-outline" onClick={() => router.back()}>
          Back
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Campaign Details</h1>
        <div className="space-x-2">
          <Link href="/backoffice" className="btn btn-outline">
            Back to Admin
          </Link>
          <Link href={`/edit-campaign/${encodeURIComponent(params.id)}`} className="btn btn-primary">
            Edit Campaign
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="p-4 border rounded-md">
          <h2 className="text-lg font-semibold">Basic Info</h2>
          <p className="text-sm mt-2"><strong>ID:</strong> {campaign.id}</p>
          <p className="text-sm mt-1"><strong>Name:</strong> {campaign.name}</p>
          <p className="text-sm mt-1"><strong>Description:</strong> {campaign.description ?? '—'}</p>
          <p className="text-sm mt-1"><strong>Media type:</strong> {campaign.mediaType}</p>
          <p className="text-sm mt-1"><strong>Token:</strong> {campaign.tokenAddress ?? 'N/A'}</p>
          <p className="text-sm mt-1"><strong>On-chain ID:</strong> {campaign.onChainId ?? 'N/A'}</p>
          <p className="text-sm mt-1"><strong>Status:</strong> {campaign.active ? 'Active' : 'Inactive'}</p>
        </div>
        <div className="p-4 border rounded-md">
          <h2 className="text-lg font-semibold">Budget</h2>
          <p className="text-sm mt-2"><strong>Budget:</strong> {campaign.budget.toLocaleString()}</p>
          <p className="text-sm mt-1"><strong>Spent:</strong> {campaign.spent.toLocaleString()}</p>
          <p className="text-sm mt-1"><strong>CPC:</strong> {campaign.cpc}</p>
          <p className="text-sm mt-1"><strong>ROI:</strong> {campaign.budget > 0 ? `${(((campaign.spent / campaign.budget) * 100).toFixed(2))}%` : '—'}</p>
        </div>
      </div>

      <div className="p-4 border rounded-md mb-6">
        <h2 className="text-lg font-semibold mb-2">Campaign Tags & Target</h2>
        <p className="text-sm"><strong>Target URL:</strong> <a className="text-blue-600" href={campaign.targetUrl} target="_blank" rel="noreferrer">{campaign.targetUrl}</a></p>
        <p className="text-sm mt-1"><strong>Tags:</strong> {campaign.tags && campaign.tags.length > 0 ? campaign.tags.join(', ') : '—'}</p>
        <p className="text-sm mt-1"><strong>Locations:</strong> {campaign.targetLocations && campaign.targetLocations.length > 0 ? campaign.targetLocations.join(', ') : '—'}</p>
      </div>

      <div className="p-4 border rounded-md mb-6">
        <h2 className="text-lg font-semibold mb-2">Performance (30d)</h2>
        {analytics ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3 border rounded text-sm">
                <div className="text-xs text-gray-500">Impressions</div>
                <div className="text-xl font-bold">{analytics.impressions.toLocaleString()}</div>
              </div>
              <div className="p-3 border rounded text-sm">
                <div className="text-xs text-gray-500">Clicks</div>
                <div className="text-xl font-bold">{analytics.clicks.toLocaleString()}</div>
              </div>
              <div className="p-3 border rounded text-sm">
                <div className="text-xs text-gray-500">CTR</div>
                <div className="text-xl font-bold">{analytics.ctr.toFixed(2)}%</div>
              </div>
              <div className="p-3 border rounded text-sm">
                <div className="text-xs text-gray-500">Revenue</div>
                <div className="text-xl font-bold">{analytics.totalRevenue.toFixed(6)}</div>
              </div>
            </div>

            <div className="mt-4">
              <h3 className="text-md font-semibold mb-2">Daily trend (last 30 days)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse border border-slate-200">
                  <thead>
                    <tr>
                      <th className="px-2 py-1 border border-slate-200">Date</th>
                      <th className="px-2 py-1 border border-slate-200">Impressions</th>
                      <th className="px-2 py-1 border border-slate-200">Clicks</th>
                      <th className="px-2 py-1 border border-slate-200">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.dailyStats.map((day) => (
                      <tr key={day.date}>
                        <td className="px-2 py-1 border border-slate-200">{day.date}</td>
                        <td className="px-2 py-1 border border-slate-200">{day.impressions.toLocaleString()}</td>
                        <td className="px-2 py-1 border border-slate-200">{day.clicks.toLocaleString()}</td>
                        <td className="px-2 py-1 border border-slate-200">{day.revenue.toFixed(6)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="text-sm text-gray-500">No analytics available.</div>
        )}
      </div>
    </div>
  )
}
