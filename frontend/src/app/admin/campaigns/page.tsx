'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'

type CampaignSummary = {
  id: string
  name: string
  status: string
}

export default function AdminCampaignsIndex() {
  const { address } = useAccount()
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!address) return
    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/campaigns/list?adminWallet=${encodeURIComponent(address)}`)
        if (!res.ok) {
          throw new Error(`Failed to load campaigns (${res.status})`)
        }
        const data = await res.json()
        const items = (data.campaigns ?? []).map((c: any) => ({
          id: c.id || c._id || '',
          name: c.name || 'Unnamed',
          status: c.verificationStatus || (c.active ? 'active' : 'inactive'),
        }))
        setCampaigns(items)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load campaigns')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [address])

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="text-3xl font-bold mb-5">Admin Campaigns</h1>

      {!address && <p className="text-red-600">Connect an admin wallet to view campaigns.</p>}
      {address && loading && <p>Loading campaigns...</p>}
      {address && error && <p className="text-red-600">{error}</p>}

      {address && !loading && !error && campaigns.length === 0 && <p>No campaigns found.</p>}

      {address && !loading && !error && campaigns.length > 0 && (
        <div className="grid gap-3">
          {campaigns.map((campaign) => (
            <Link
              key={campaign.id}
              href={`/admin/campaigns/${encodeURIComponent(campaign.id)}`}
              className="border rounded p-4 hover:bg-slate-100"
            >
              <div className="font-semibold">{campaign.name}</div>
              <div className="text-xs text-gray-500">ID: {campaign.id}</div>
              <div className="text-xs text-gray-600 mt-1">Status: {campaign.status}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
