'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'

import AdvertiserIcon from '@/components/advertiser/AdvertiserIcon'
import {
  Alert,
  Button,
  EmptyState,
  Section,
  Skeleton,
  StatusBadge,
  type StatusTone,
} from '@/components/advertiser/ui'

type CampaignSummary = {
  id: string
  name: string
  status: string
}

function statusTone(s: string): StatusTone {
  const v = s.toLowerCase()
  if (v === 'rejected') return 'danger'
  if (v === 'review' || v === 'pending') return 'info'
  if (v === 'paused') return 'warning'
  if (v === 'active' || v === 'approved') return 'success'
  return 'neutral'
}

export default function AdminCampaignsIndex() {
  const { address, isConnected } = useAccount()
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!address) return
    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch(
          `/api/admin/campaigns/list?adminWallet=${encodeURIComponent(address)}`,
        )
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

  if (!isConnected) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F3F0] p-6">
        <div className="w-full max-w-md border border-[#2D2D2D] bg-white p-8 text-center shadow-[6px_6px_0_0_#2D2D2D]">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center bg-[#2D2D2D]">
            <AdvertiserIcon name="campaign" className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-[22px] font-bold tracking-tight text-[#2D2D2D]">Admin campaigns</h1>
          <p className="mt-2 text-[13px] leading-5 text-[#666]">
            Connect an admin wallet to view campaigns.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F5F3F0]">
      {/* Top bar */}
      <div className="border-b border-[#E5E5E5] bg-white">
        <div className="mx-auto flex max-w-screen-xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#888]">
              Admin
            </p>
            <h1 className="truncate text-[15px] font-bold text-[#2D2D2D]">Campaigns</h1>
          </div>
          <Link
            href="/backoffice"
            className="inline-flex items-center gap-1.5 border border-[#2D2D2D] bg-white px-3 py-2 text-[12px] font-semibold text-[#2D2D2D] hover:bg-[#F4F4F2]"
          >
            ← Back office
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-screen-xl px-4 py-6">
        <main className="space-y-5">
          {error && <Alert tone="error">{error}</Alert>}

          <Section
            title="All campaigns"
            description={loading ? 'Loading…' : `${campaigns.length} total`}
          >
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : campaigns.length === 0 ? (
              <EmptyState
                icon="campaign"
                title="No campaigns found"
                description="Campaigns submitted by advertisers will appear here for review."
                action={
                  <Link
                    href="/backoffice"
                    className="inline-flex items-center gap-1.5 border border-[#2D2D2D] bg-[#2D2D2D] px-3 py-2 text-[12px] font-semibold text-white"
                  >
                    Go to back office
                  </Link>
                }
              />
            ) : (
              <ul className="grid gap-2">
                {campaigns.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/admin/campaigns/${encodeURIComponent(c.id)}`}
                      className="flex items-center justify-between gap-3 border border-[#E5E5E5] bg-white px-4 py-3 hover:bg-[#FAFAF8]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-semibold text-[#2D2D2D]">
                          {c.name}
                        </p>
                        <p className="mt-0.5 truncate font-mono text-[11px] text-[#666]">
                          {c.id}
                        </p>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-3">
                        <StatusBadge tone={statusTone(c.status)}>{c.status}</StatusBadge>
                        <span className="text-[#999]">→</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </main>
      </div>
    </div>
  )
}
