'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAccount, useSignMessage } from 'wagmi'

import { useAds } from '@/hooks/useAds'
import { useStreamingAds } from '@/hooks/useStreamingAds'
import { isWalletAdmin } from '@/lib/admin'

import AdvertiserIcon from '@/components/advertiser/AdvertiserIcon'
import AdvertiserSidebar from '@/components/advertiser/AdvertiserSidebar'
import AdminPopupPreview from './AdminPopupPreview'
import {
  Alert,
  Button,
  EmptyState,
  Field,
  Metric,
  Section,
  Select,
  Skeleton,
  StatusBadge,
  TextArea,
  TextInput,
  formatNumber,
  formatPct,
  type StatusTone,
} from '@/components/advertiser/ui'

import { adminSidebarItems, type AdminSectionId } from './admin-config'

/* ─── Local types (kept from previous AdminDashboard) ────────────────────── */

interface Campaign {
  id: string
  name: string
  description?: string
  bannerUrl?: string
  mediaType?: 'image' | 'video'
  targetUrl?: string
  budget?: number
  spent?: number
  cpc?: number
  active?: boolean
  paused?: boolean
  advertiserId?: string
  advertiserWallet?: string
  verificationStatus?: string
  onChainId?: number
}

interface Publisher {
  publisherId: string
  wallet: string
  domain: string
  verifiedInDb: boolean
  onChainPublisher?: boolean | null
  officialPublisher?: boolean
  sites?: Array<{ domain: string; siteId: string; verifiedInDb: boolean }>
}

interface ActivityEntry {
  id: string
  type: string
  message: string
  timestamp: string | Date
}

interface StatsPayload {
  campaignCount: number
  totalAds: number
  totalImpressions: number
  totalClicks: number
  ctr: number
  totalPublishers: number
  activeCampaigns: number
  totalRevenue: number
  totalBudget: number
}

interface PricingConfig {
  impressionUsd: number
  tokenOverrides: Record<string, number>
}

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function campaignStatusBadge(c: Campaign): { label: string; tone: StatusTone } {
  const vs = (c.verificationStatus || '').toLowerCase()
  if (vs === 'rejected') return { label: 'Rejected', tone: 'danger' }
  if (vs === 'review' || vs === 'pending') return { label: 'In review', tone: 'info' }
  if (c.paused) return { label: 'Paused', tone: 'warning' }
  if (c.active) return { label: 'Active', tone: 'success' }
  return { label: 'Inactive', tone: 'neutral' }
}

function shortAddr(a?: string | null) {
  if (!a) return '—'
  return a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a
}

/* ─── Component ─────────────────────────────────────────────────────────── */

/**
 * Back office — calm workspace for the site manager.
 *
 * Mirrors the advertiser shell: top bar (workspace label + protocol status +
 * refresh), left sticky sidebar nav, `Section`/`Metric`/`Button` primitives
 * from `components/advertiser/ui`. All handlers/API calls/admin guards are
 * unchanged from the previous implementation — this is a UI refit only.
 */
export default function AdminDashboard() {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const {
    pause,
    unpause,
    stopCampaign,
    isProtocolPaused,
    isLoading: contractBusy,
    addOperator,
    removeOperator,
    isOperator,
  } = useStreamingAds()
  const {
    toggleCampaignPause,
    updateCampaignMetadata,
    extendCampaignDuration,
  } = useAds()

  const [section, setSection] = useState<AdminSectionId>('overview')

  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [stats, setStats] = useState<StatsPayload | null>(null)
  const [pricing, setPricing] = useState<PricingConfig>({ impressionUsd: 0.0002, tokenOverrides: {} })

  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('')
  const [previewCampaign, setPreviewCampaign] = useState<Campaign | null>(null)
  const [editBudget, setEditBudget] = useState<string>('')
  const [editSpent, setEditSpent] = useState<string>('')
  const [editMetadata, setEditMetadata] = useState<string>('')
  const [extendDays, setExtendDays] = useState<string>('')
  const [isActionBusy, setIsActionBusy] = useState(false)

  const [ticker, setTicker] = useState(0)

  // Operator management
  const [operatorInput, setOperatorInput] = useState('')
  const [operatorStatus, setOperatorStatus] = useState<{ address: string; isOp: boolean } | null>(null)
  const [operatorBusy, setOperatorBusy] = useState(false)

  const isAdmin = isWalletAdmin(address)

  const advertisers = useMemo(() => {
    const map = new Map<string, { advertiserId: string; banner: string; wallet: string; campaignCount: number }>()
    campaigns.forEach((c) => {
      if (c.advertiserId) {
        const key = c.advertiserWallet || c.advertiserId
        const existing = map.get(key)
        if (existing) {
          existing.campaignCount += 1
        } else {
          map.set(key, {
            advertiserId: c.advertiserId || 'unknown',
            banner: c.name || 'Untitled',
            wallet: c.advertiserWallet || 'Unknown',
            campaignCount: 1,
          })
        }
      }
    })
    return Array.from(map.values())
  }, [campaigns])

  const isDataReady = Boolean(address && isConnected && isAdmin)

  /* ── Data loaders (unchanged behaviour) ────────────────────────────── */

  const loadCampaigns = async () => {
    if (!address) return
    const routing = [
      `/api/admin/campaigns/list?adminWallet=${address}`,
      `/api/admin/campaigns?admin=${address}`,
    ]
    for (const url of routing) {
      const res = await fetch(url)
      if (!res.ok) continue
      const json = await res.json()
      if (json?.campaigns?.length || (json?.campaigns && Array.isArray(json.campaigns))) {
        setCampaigns(json.campaigns || [])
        return
      }
      if (json?.campaigns && !Array.isArray(json.campaigns)) {
        setCampaigns([])
        return
      }
      if (json?.campaigns) {
        setCampaigns(json.campaigns)
        return
      }
      if (json?.campaigns == null && Array.isArray(json)) {
        setCampaigns(json)
        return
      }
    }
    throw new Error('Failed to load campaigns')
  }

  const loadPublishers = async () => {
    const res = await fetch('/api/admin/publishers-sites-audit?includeUnverified=true')
    if (!res.ok) throw new Error('Failed to load publishers')
    const json = await res.json()
    const list = (json.publishers || []).map((p: any) => ({
      publisherId: p.publisherId,
      wallet: p.wallet || 'unknown',
      domain: p.domain || 'unknown',
      verifiedInDb: !!p.verifiedInDb,
      onChainPublisher: p.onChainPublisher,
      officialPublisher: p.officialPublisher,
      sites: (p.sites || []).map((site: any) => ({
        domain: site.domain,
        siteId: site.siteId,
        verifiedInDb: site.verifiedInDb,
      })),
    }))
    setPublishers(list)
  }

  const loadStats = async () => {
    const res = await fetch('/api/stats')
    if (!res.ok) throw new Error('Failed to load stats')
    const json = await res.json()
    setStats(json)
  }

  const loadActivity = async () => {
    if (!address) return
    const res = await fetch(`/api/admin/activity?adminWallet=${address}`)
    if (!res.ok) throw new Error('Failed to load activity')
    const json = await res.json()
    setActivity(json.activities || [])
  }

  const loadPricing = async () => {
    const res = await fetch('/api/admin/pricing-config')
    if (!res.ok) throw new Error('Failed to load pricing config')
    const json = await res.json()
    setPricing({
      impressionUsd: json.impressionUsd || 0.0002,
      tokenOverrides: json.tokenOverrides || {},
    })
  }

  const refreshData = async () => {
    setIsLoading(true)
    try {
      await Promise.all([loadCampaigns(), loadPublishers(), loadStats(), loadActivity(), loadPricing()])
      setFeedback({ tone: 'success', text: 'Data refreshed' })
    } catch (err) {
      setFeedback({ tone: 'error', text: err instanceof Error ? err.message : 'Refresh failed' })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!isDataReady) return
    refreshData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDataReady, ticker])

  /* ── Mutations (unchanged) ─────────────────────────────────────────── */

  const ensureAdmin = () => {
    if (!address) throw new Error('Connect wallet')
    if (!isAdmin) throw new Error('Not an admin')
    return address
  }

  const withAdminSignature = async (payload: { action: string }) => {
    // The admin API routes all read `adminWallet` (not `wallet`) from the
    // body — see /api/admin/campaigns/{verify,update,delete}/route.ts and
    // /api/admin/publishers/verify/route.ts. Sending the wrong key here
    // produces a silent 400 "Missing required fields", which is exactly
    // what the dashboard was hitting on every Approve/Reject before.
    const adminWallet = ensureAdmin()
    const message = `${payload.action} / ${Date.now()}`
    const signature = await signMessageAsync({ message })
    return { adminWallet, message, signature }
  }

  const handleVerifyCampaign = async (campaignId: string, status: 'approved' | 'rejected') => {
    try {
      const auth = await withAdminSignature({ action: `verify_campaign_${campaignId}_${status}` })
      const res = await fetch('/api/admin/campaigns/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, status, ...auth }),
      })
      if (!res.ok) throw new Error('Campaign verification failed')
      setFeedback({ tone: 'success', text: `Campaign ${status}` })
      refreshData()
    } catch (err) {
      setFeedback({ tone: 'error', text: err instanceof Error ? err.message : 'Verification error' })
    }
  }

  const handleVerifyPublisher = async (publisherId: string, verified: boolean) => {
    try {
      const auth = await withAdminSignature({ action: `verify_publisher_${publisherId}_${verified}` })
      const res = await fetch('/api/admin/publishers/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publisherId, verified, ...auth }),
      })
      if (!res.ok) throw new Error('Publisher verify/update failed')
      setFeedback({ tone: 'success', text: `Publisher ${verified ? 'verified' : 'unverified'}` })
      refreshData()
    } catch (err) {
      setFeedback({ tone: 'error', text: err instanceof Error ? err.message : 'Publisher verify error' })
    }
  }

  const handlePauseToggle = async () => {
    try {
      if (isProtocolPaused) await unpause()
      else await pause()
      setFeedback({ tone: 'success', text: isProtocolPaused ? 'System resumed' : 'System paused' })
      setTicker((prev) => prev + 1)
    } catch (err) {
      setFeedback({ tone: 'error', text: err instanceof Error ? err.message : 'Protocol pause toggle failed' })
    }
  }

  const stopCampaignInDb = async (campaignId: string) => {
    const auth = await withAdminSignature({ action: `stop_campaign_${campaignId}` })
    const res = await fetch('/api/admin/campaigns/update', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: campaignId, updates: { active: false }, ...auth }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'DB stop failed')
    }
    return true
  }

  const handleStopCampaign = async (campaign: Campaign) => {
    const { id, onChainId } = campaign
    try {
      setIsActionBusy(true)
      let chainMessage = ''
      if (onChainId != null) {
        const chainHash = await stopCampaign(onChainId)
        chainMessage = chainHash ? ` on-chain tx ${String(chainHash)}` : ''
      }
      await stopCampaignInDb(String(id))
      setFeedback({ tone: 'success', text: `Campaign ${String(id)} stopped${chainMessage}` })
      refreshData()
    } catch (err) {
      setFeedback({ tone: 'error', text: err instanceof Error ? err.message : 'Stop campaign failed' })
    } finally {
      setIsActionBusy(false)
    }
  }

  const setCampaignDbState = async (campaignId: string, updates: Record<string, any>) => {
    try {
      const auth = await withAdminSignature({ action: `db_update_campaign_${campaignId}` })
      const res = await fetch('/api/admin/campaigns/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: campaignId, updates, ...auth }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'DB campaign update failed')
      }
      return true
    } catch (error) {
      console.error('Campaign DB update failed:', error)
      return false
    }
  }

  const handleToggleCampaignPause = async (campaign: Campaign) => {
    const targetId = String(campaign.id)
    try {
      setIsActionBusy(true)
      if (campaign.onChainId != null) {
        await toggleCampaignPause(Number(campaign.onChainId))
      }
      setFeedback({ tone: 'success', text: `Campaign ${targetId} pause toggled` })
    } catch (err) {
      setFeedback({
        tone: 'error',
        text: `On-chain pause toggle failed: ${err instanceof Error ? err.message : 'unknown'}. Falling back to DB state.`,
      })
    }
    const dbSuccess = await setCampaignDbState(targetId, { paused: !campaign.paused })
    if (!dbSuccess) {
      setFeedback({ tone: 'error', text: 'DB fallback failed; state may be inconsistent.' })
    }
    refreshData()
    setIsActionBusy(false)
  }

  // Re-activates a campaign that's sitting `active=false` in the DB. We
  // intentionally do NOT touch the contract here: there's no on-chain
  // "resume" verb (`stopCampaign` is terminal in the streaming contract),
  // and the common reason a campaign is Inactive is one of:
  //   - admin Stop wrote `active=false` and we want to undo the DB side
  //   - older approve flow left `verificationStatus='approved'` but
  //     `active=false` (the bug we just fixed for new approvals)
  //   - manual DB toggle
  // For all of those the right move is: flip `active=true`, clear any
  // stray `paused` flag. Serve endpoints filter on `active`, so this is
  // what gets it serving again. If the on-chain state is actually
  // stopped, billing will fail on the next click — surface that as an
  // honest follow-up to the admin instead of pretending to reverse it.
  const handleActivateCampaign = async (campaign: Campaign) => {
    const targetId = String(campaign.id)
    try {
      setIsActionBusy(true)
      const ok = await setCampaignDbState(targetId, { active: true, paused: false })
      if (!ok) throw new Error('DB update failed')
      setFeedback({
        tone: 'success',
        text:
          campaign.onChainId != null
            ? `Campaign ${targetId} reactivated in DB. If it was Stop'd on-chain, billing may still be disabled.`
            : `Campaign ${targetId} reactivated`,
      })
      refreshData()
    } catch (err) {
      setFeedback({ tone: 'error', text: err instanceof Error ? err.message : 'Activate failed' })
    } finally {
      setIsActionBusy(false)
    }
  }

  const handleUpdateMetadata = async () => {
    if (!selectedCampaignId) {
      setFeedback({ tone: 'error', text: 'Select a campaign first' })
      return
    }
    try {
      setIsActionBusy(true)
      const target = campaigns.find((c) => c.id === selectedCampaignId)
      let onchainSuccess = false
      if (target?.onChainId != null) {
        try {
          await updateCampaignMetadata(Number(target.onChainId), editMetadata)
          onchainSuccess = true
        } catch (err) {
          console.warn('On-chain updateMetadata failed:', err)
        }
      }
      const dbSuccess = await setCampaignDbState(selectedCampaignId, { metadata: editMetadata })
      if (!dbSuccess) throw new Error('DB metadata update failed')
      setFeedback({
        tone: 'success',
        text: `Campaign metadata updated (${onchainSuccess ? 'chain+DB' : 'DB only'})`,
      })
      refreshData()
    } catch (err) {
      setFeedback({ tone: 'error', text: err instanceof Error ? err.message : 'Metadata update failed' })
    } finally {
      setIsActionBusy(false)
    }
  }

  const handleExtendCampaign = async () => {
    if (!selectedCampaignId || !extendDays) {
      setFeedback({ tone: 'error', text: 'Select a campaign and set extension days' })
      return
    }
    try {
      setIsActionBusy(true)
      const target = campaigns.find((c) => c.id === selectedCampaignId)
      const additionalSeconds = Number(extendDays) * 24 * 60 * 60
      let onchainSuccess = false
      if (target?.onChainId != null) {
        try {
          await extendCampaignDuration(Number(target.onChainId), additionalSeconds)
          onchainSuccess = true
        } catch (err) {
          console.warn('On-chain extendCampaignDuration failed:', err)
        }
      }
      if (target) {
        await setCampaignDbState(selectedCampaignId, { updatedAt: new Date() })
      }
      setFeedback({
        tone: 'success',
        text: `Campaign duration extended (${onchainSuccess ? 'chain+DB' : 'DB fallback'})`,
      })
      refreshData()
    } catch (err) {
      setFeedback({ tone: 'error', text: err instanceof Error ? err.message : 'Extension failed' })
    } finally {
      setIsActionBusy(false)
    }
  }

  const handleDeleteCampaign = async (campaign: Campaign) => {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(`Delete campaign "${campaign.name}"? This cannot be undone.`)
      if (!ok) return
    }
    try {
      const auth = await withAdminSignature({ action: `delete_campaign_${campaign.id}` })
      const res = await fetch('/api/admin/campaigns/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: campaign.id, ...auth }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Delete failed')
      }
      setFeedback({ tone: 'success', text: `Campaign ${campaign.id} deleted` })
      refreshData()
    } catch (err) {
      setFeedback({ tone: 'error', text: err instanceof Error ? err.message : 'Delete campaign failed' })
    }
  }

  const handleCheckOperator = async () => {
    const addr = operatorInput.trim()
    if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      setFeedback({ tone: 'error', text: 'Invalid address' })
      return
    }
    try {
      setOperatorBusy(true)
      const result = await isOperator(addr)
      setOperatorStatus({ address: addr, isOp: !!result })
    } catch (err) {
      setFeedback({ tone: 'error', text: err instanceof Error ? err.message : 'Check failed' })
    } finally {
      setOperatorBusy(false)
    }
  }

  const handleAddOperator = async () => {
    const addr = operatorInput.trim()
    if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      setFeedback({ tone: 'error', text: 'Invalid address' })
      return
    }
    try {
      setOperatorBusy(true)
      await addOperator(addr)
      setFeedback({ tone: 'success', text: `Operator ${addr.slice(0, 8)}… added` })
      setOperatorStatus({ address: addr, isOp: true })
    } catch (err) {
      setFeedback({ tone: 'error', text: err instanceof Error ? err.message : 'Add operator failed' })
    } finally {
      setOperatorBusy(false)
    }
  }

  const handleRemoveOperator = async () => {
    const addr = operatorInput.trim()
    if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      setFeedback({ tone: 'error', text: 'Invalid address' })
      return
    }
    try {
      setOperatorBusy(true)
      await removeOperator(addr)
      setFeedback({ tone: 'success', text: `Operator ${addr.slice(0, 8)}… removed` })
      setOperatorStatus({ address: addr, isOp: false })
    } catch (err) {
      setFeedback({ tone: 'error', text: err instanceof Error ? err.message : 'Remove operator failed' })
    } finally {
      setOperatorBusy(false)
    }
  }

  const handleCampaignOverride = async () => {
    try {
      if (!selectedCampaignId) throw new Error('Select a campaign first')
      const auth = await withAdminSignature({ action: `override_campaign_${selectedCampaignId}` })
      const updates: Record<string, any> = {}
      if (editBudget) updates.budget = Number(editBudget)
      if (editSpent) updates.spent = Number(editSpent)

      const res = await fetch('/api/admin/campaigns/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedCampaignId, updates, ...auth }),
      })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || 'Update failed')
      }
      setFeedback({ tone: 'success', text: 'Campaign override applied' })
      setEditBudget('')
      setEditSpent('')
      refreshData()
    } catch (err) {
      setFeedback({ tone: 'error', text: err instanceof Error ? err.message : 'Override error' })
    }
  }

  const handlePricingSave = async () => {
    try {
      const auth = await withAdminSignature({ action: 'update_pricing' })
      const res = await fetch('/api/admin/pricing-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          impressionUsd: pricing.impressionUsd,
          tokenOverrides: pricing.tokenOverrides,
          ...auth,
        }),
      })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || 'Pricing update failed')
      }
      setFeedback({ tone: 'success', text: 'Pricing config updated' })
      refreshData()
    } catch (err) {
      setFeedback({ tone: 'error', text: err instanceof Error ? err.message : 'Pricing update error' })
    }
  }

  /* ── Auth gates ──────────────────────────────────────────────────────── */

  if (!isConnected) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F3F0] p-6">
        <div className="w-full max-w-md border border-[#2D2D2D] bg-white p-8 text-center shadow-[6px_6px_0_0_#2D2D2D]">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center bg-[#2D2D2D]">
            <AdvertiserIcon name="settings" className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-[22px] font-bold tracking-tight text-[#2D2D2D]">Back office</h1>
          <p className="mt-2 text-[13px] leading-5 text-[#666]">
            Connect a wallet to access platform controls.
          </p>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F3F0] p-6">
        <div className="w-full max-w-md border border-[#2D2D2D] bg-white p-8 text-center shadow-[6px_6px_0_0_#2D2D2D]">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center bg-[#8A1F1F]">
            <AdvertiserIcon name="settings" className="h-6 w-6 text-white" />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8A1F1F]">Unauthorized</p>
          <h1 className="mt-1 text-[22px] font-bold tracking-tight text-[#2D2D2D]">Admin only</h1>
          <p className="mt-2 text-[13px] leading-5 text-[#666]">
            Your wallet isn’t listed in <code className="rounded bg-[#F4F4F2] px-1 py-0.5 text-[11px]">ADMIN_WALLETS</code>.
          </p>
          <p className="mt-3 break-all text-[11px] text-[#999]">{address}</p>
        </div>
      </div>
    )
  }

  /* ── Shell ───────────────────────────────────────────────────────────── */

  return (
    <div className="min-h-screen bg-[#F5F3F0]">
      {/* Top bar */}
      <div className="border-b border-[#E5E5E5] bg-white">
        <div className="mx-auto flex max-w-screen-xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#888]">Workspace</p>
            <h1 className="truncate text-[15px] font-bold text-[#2D2D2D]">Back office</h1>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge tone={isProtocolPaused ? 'warning' : 'success'}>
              Protocol {isProtocolPaused ? 'paused' : 'live'}
            </StatusBadge>
            <Button
              intent="secondary"
              size="sm"
              onClick={refreshData}
              disabled={isLoading}
              icon="rotate"
            >
              {isLoading ? 'Loading…' : 'Refresh'}
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-screen-xl px-4 py-6">
        <div className="flex gap-6 lg:gap-8">
          {/* Desktop sidebar. AdvertiserSidebar only string-compares
           * `activeSection`, so we feed admin section ids via a structural
           * cast — no runtime impact, just keeps TS happy. */}
          <div className="hidden w-[200px] flex-shrink-0 lg:block">
            <AdvertiserSidebar
              items={adminSidebarItems as never}
              activeSection={section as never}
              onSelect={(s) => setSection(s as AdminSectionId)}
            />
          </div>

          {/* Mobile section tabs */}
          <div className="mb-4 w-full overflow-x-auto pb-1 lg:hidden">
            <div className="flex min-w-max gap-1">
              {adminSidebarItems.map((item) => {
                const key = item.id ?? item.sectionId ?? item.href ?? item.label
                const isActive = !!item.sectionId && item.sectionId === section
                const tabClasses = [
                  'inline-flex items-center gap-1.5 whitespace-nowrap border px-3 py-1.5 text-[12px] font-medium transition-colors',
                  isActive
                    ? 'border-[#2D2D2D] bg-[#2D2D2D] text-white'
                    : 'border-[#E5E5E5] bg-white text-[#444] hover:bg-[#F4F4F2]',
                ].join(' ')
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => item.sectionId && setSection(item.sectionId)}
                    className={tabClasses}
                  >
                    <AdvertiserIcon name={item.icon} className="h-3.5 w-3.5" />
                    {item.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Main */}
          <main className="min-w-0 flex-1 space-y-5">
            {feedback && (
              <Alert tone={feedback.tone} onDismiss={() => setFeedback(null)}>
                {feedback.text}
              </Alert>
            )}

            {section === 'overview' && (
              <OverviewSection
                stats={stats}
                isProtocolPaused={!!isProtocolPaused}
                isLoading={isLoading}
                onJump={setSection}
              />
            )}

            {section === 'campaigns' && (
              <CampaignsSection
                campaigns={campaigns}
                isLoading={isLoading}
                isActionBusy={isActionBusy}
                onApprove={(id) => handleVerifyCampaign(id, 'approved')}
                onReject={(id) => handleVerifyCampaign(id, 'rejected')}
                onTogglePause={handleToggleCampaignPause}
                onActivate={handleActivateCampaign}
                onStop={handleStopCampaign}
                onDelete={handleDeleteCampaign}
                onPreview={setPreviewCampaign}
                selectedCampaignId={selectedCampaignId}
                onSelectCampaign={(id) => {
                  setSelectedCampaignId(id)
                  const picked = campaigns.find((c) => c.id === id)
                  if (picked) {
                    setEditBudget(String(picked.budget ?? ''))
                    setEditSpent(String(picked.spent ?? ''))
                    setEditMetadata(picked.description || '')
                  }
                }}
                editBudget={editBudget}
                onEditBudget={setEditBudget}
                editSpent={editSpent}
                onEditSpent={setEditSpent}
                editMetadata={editMetadata}
                onEditMetadata={setEditMetadata}
                extendDays={extendDays}
                onExtendDays={setExtendDays}
                onApplyOverride={handleCampaignOverride}
                onUpdateMetadata={handleUpdateMetadata}
                onExtend={handleExtendCampaign}
              />
            )}

            {section === 'publishers' && (
              <PublishersSection
                publishers={publishers}
                isLoading={isLoading}
                onToggleVerify={handleVerifyPublisher}
              />
            )}

            {section === 'advertisers' && (
              <AdvertisersSection advertisers={advertisers} isLoading={isLoading} />
            )}

            {section === 'system' && (
              <SystemSection
                pricing={pricing}
                onPricing={setPricing}
                onSavePricing={handlePricingSave}
                isProtocolPaused={!!isProtocolPaused}
                onTogglePause={handlePauseToggle}
                contractBusy={contractBusy}
                operatorInput={operatorInput}
                onOperatorInput={(v) => {
                  setOperatorInput(v)
                  setOperatorStatus(null)
                }}
                operatorStatus={operatorStatus}
                operatorBusy={operatorBusy}
                onCheckOperator={handleCheckOperator}
                onAddOperator={handleAddOperator}
                onRemoveOperator={handleRemoveOperator}
              />
            )}

            {section === 'audit' && (
              <AuditSection activity={activity} isLoading={isLoading} />
            )}
          </main>
        </div>
      </div>
      <AdminPopupPreview
        campaign={
          previewCampaign
            ? {
                name: previewCampaign.name,
                description: previewCampaign.description ?? '',
                bannerUrl: previewCampaign.bannerUrl ?? '',
                mediaType: previewCampaign.mediaType,
                targetUrl: previewCampaign.targetUrl,
              }
            : null
        }
        onClose={() => setPreviewCampaign(null)}
      />
    </div>
  )
}

/* ─── Section: Overview ──────────────────────────────────────────────────── */

function OverviewSection({
  stats,
  isProtocolPaused,
  isLoading,
  onJump,
}: {
  stats: StatsPayload | null
  isProtocolPaused: boolean
  isLoading: boolean
  onJump: (s: AdminSectionId) => void
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          accent="hero"
          label="Protocol"
          value={isProtocolPaused ? 'Paused' : 'Live'}
          hint={isProtocolPaused ? 'Streaming halted on-chain' : 'Streaming active on-chain'}
        />
        <Metric
          label="Campaigns"
          value={stats?.campaignCount != null ? formatNumber(stats.campaignCount) : '—'}
          hint={
            stats?.activeCampaigns != null
              ? `${formatNumber(stats.activeCampaigns)} active`
              : undefined
          }
          loading={isLoading && !stats}
        />
        <Metric
          label="Publishers"
          value={stats?.totalPublishers != null ? formatNumber(stats.totalPublishers) : '—'}
          loading={isLoading && !stats}
        />
        <Metric
          label="Avg CTR"
          value={stats?.ctr != null ? formatPct(stats.ctr, 2) : '—'}
          loading={isLoading && !stats}
        />
        <Metric
          label="Impressions"
          value={stats?.totalImpressions != null ? formatNumber(stats.totalImpressions) : '—'}
          loading={isLoading && !stats}
        />
        <Metric
          label="Clicks"
          value={stats?.totalClicks != null ? formatNumber(stats.totalClicks) : '—'}
          loading={isLoading && !stats}
        />
        <Metric
          label="Revenue"
          value={stats?.totalRevenue != null ? formatNumber(stats.totalRevenue) : '—'}
          hint="All-time"
          loading={isLoading && !stats}
        />
        <Metric
          label="Budget"
          value={stats?.totalBudget != null ? formatNumber(stats.totalBudget) : '—'}
          hint="Committed across campaigns"
          loading={isLoading && !stats}
        />
      </div>

      <Section title="Quick links" description="Jump to common admin tasks">
        <ul className="grid gap-2 sm:grid-cols-2">
          <li>
            <button
              type="button"
              onClick={() => onJump('campaigns')}
              className="flex w-full items-center justify-between border border-[#E5E5E5] bg-white px-3 py-2.5 text-left text-[13px] text-[#2D2D2D] hover:bg-[#FAFAF8]"
            >
              <span className="inline-flex items-center gap-2">
                <AdvertiserIcon name="campaign" className="h-4 w-4 text-[#666]" />
                Review pending campaigns
              </span>
              <span className="text-[#999]">→</span>
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => onJump('publishers')}
              className="flex w-full items-center justify-between border border-[#E5E5E5] bg-white px-3 py-2.5 text-left text-[13px] text-[#2D2D2D] hover:bg-[#FAFAF8]"
            >
              <span className="inline-flex items-center gap-2">
                <AdvertiserIcon name="websites" className="h-4 w-4 text-[#666]" />
                Verify publishers
              </span>
              <span className="text-[#999]">→</span>
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => onJump('system')}
              className="flex w-full items-center justify-between border border-[#E5E5E5] bg-white px-3 py-2.5 text-left text-[13px] text-[#2D2D2D] hover:bg-[#FAFAF8]"
            >
              <span className="inline-flex items-center gap-2">
                <AdvertiserIcon name="settings" className="h-4 w-4 text-[#666]" />
                Pricing & protocol
              </span>
              <span className="text-[#999]">→</span>
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => onJump('audit')}
              className="flex w-full items-center justify-between border border-[#E5E5E5] bg-white px-3 py-2.5 text-left text-[13px] text-[#2D2D2D] hover:bg-[#FAFAF8]"
            >
              <span className="inline-flex items-center gap-2">
                <AdvertiserIcon name="inbox" className="h-4 w-4 text-[#666]" />
                Audit trail
              </span>
              <span className="text-[#999]">→</span>
            </button>
          </li>
        </ul>
      </Section>
    </div>
  )
}

/* ─── Section: Campaigns ─────────────────────────────────────────────────── */

function CampaignsSection({
  campaigns,
  isLoading,
  isActionBusy,
  onApprove,
  onReject,
  onTogglePause,
  onActivate,
  onStop,
  onDelete,
  onPreview,
  selectedCampaignId,
  onSelectCampaign,
  editBudget,
  onEditBudget,
  editSpent,
  onEditSpent,
  editMetadata,
  onEditMetadata,
  extendDays,
  onExtendDays,
  onApplyOverride,
  onUpdateMetadata,
  onExtend,
}: {
  campaigns: Campaign[]
  isLoading: boolean
  isActionBusy: boolean
  onApprove: (id: string) => void
  onReject: (id: string) => void
  onTogglePause: (c: Campaign) => void
  onActivate: (c: Campaign) => void
  onStop: (c: Campaign) => void
  onDelete: (c: Campaign) => void
  onPreview: (c: Campaign) => void
  selectedCampaignId: string
  onSelectCampaign: (id: string) => void
  editBudget: string
  onEditBudget: (v: string) => void
  editSpent: string
  onEditSpent: (v: string) => void
  editMetadata: string
  onEditMetadata: (v: string) => void
  extendDays: string
  onExtendDays: (v: string) => void
  onApplyOverride: () => void
  onUpdateMetadata: () => void
  onExtend: () => void
}) {
  return (
    <div className="space-y-5">
      <Section
        title="Campaigns"
        description={`${campaigns.length} total · approve / pause / stop`}
      >
        {isLoading && campaigns.length === 0 ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : campaigns.length === 0 ? (
          <EmptyState
            icon="campaign"
            title="No campaigns yet"
            description="When advertisers submit campaigns they'll appear here for review."
          />
        ) : (
          <div className="overflow-x-auto border border-[#EFEFEF]">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-[#FAFAF8] text-[11px] font-semibold uppercase tracking-wide text-[#666]">
                  <th className="px-3 py-2 text-left">Campaign</th>
                  <th className="px-3 py-2 text-left">Advertiser</th>
                  <th className="px-3 py-2 text-right">CPC</th>
                  <th className="px-3 py-2 text-right">Budget</th>
                  <th className="px-3 py-2 text-right">Spent</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c, i) => {
                  const { label, tone } = campaignStatusBadge(c)
                  return (
                    <tr
                      key={c.id}
                      className={`border-t border-[#EFEFEF] ${
                        i % 2 === 1 ? 'bg-[#FCFCFB]' : 'bg-white'
                      } ${selectedCampaignId === c.id ? 'ring-1 ring-inset ring-[#2D2D2D]' : ''}`}
                    >
                      <td className="px-3 py-2 font-medium text-[#2D2D2D]">
                        <button
                          type="button"
                          onClick={() => onSelectCampaign(c.id)}
                          className="text-left hover:underline"
                          title="Select for override"
                        >
                          {c.name}
                        </button>
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-[#666]">
                        {shortAddr(c.advertiserWallet || c.advertiserId)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{c.cpc ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {c.budget != null ? formatNumber(c.budget) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[#666]">
                        {c.spent != null ? formatNumber(c.spent) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge tone={tone}>{label}</StatusBadge>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button
                            size="sm"
                            intent="ghost"
                            icon="preview"
                            onClick={() => onPreview(c)}
                          >
                            Preview
                          </Button>
                          {(label === 'In review' || label === 'Rejected') ? (
                            <Button
                              size="sm"
                              intent="ghost"
                              onClick={() => onApprove(c.id)}
                              disabled={isActionBusy}
                            >
                              {label === 'Rejected' ? 'Re-approve' : 'Approve'}
                            </Button>
                          ) : null}
                          {label === 'In review' ? (
                            <Button
                              size="sm"
                              intent="ghost"
                              onClick={() => onReject(c.id)}
                              disabled={isActionBusy}
                            >
                              Reject
                            </Button>
                          ) : null}
                          {(label === 'Active' || label === 'Paused') ? (
                            <Button
                              size="sm"
                              intent="ghost"
                              onClick={() => onTogglePause(c)}
                              disabled={isActionBusy}
                            >
                              {c.paused ? 'Resume' : 'Pause'}
                            </Button>
                          ) : null}
                          {label === 'Inactive' ? (
                            <Button
                              size="sm"
                              intent="primary"
                              onClick={() => onActivate(c)}
                              disabled={isActionBusy}
                              title="Set Campaign.active=true in the DB so it serves again. Does not reverse an on-chain Stop."
                            >
                              Activate
                            </Button>
                          ) : null}
                          {(label === 'Active' || label === 'Paused') ? (
                            <Button
                              size="sm"
                              intent="secondary"
                              onClick={() => onStop(c)}
                              disabled={isActionBusy}
                            >
                              Stop
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            intent="danger"
                            onClick={() => onDelete(c)}
                            disabled={isActionBusy}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Override"
        description={
          selectedCampaignId
            ? `Editing campaign ${selectedCampaignId.slice(0, 10)}…`
            : 'Select a campaign in the table above to edit budget, spend, metadata, or duration.'
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Pick a campaign">
            <Select
              value={selectedCampaignId}
              onChange={(e) => onSelectCampaign(e.target.value)}
            >
              <option value="">— Select campaign —</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {shortAddr(c.advertiserWallet || c.advertiserId)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Budget">
              <TextInput
                type="number"
                value={editBudget}
                onChange={(e) => onEditBudget(e.target.value)}
                placeholder="—"
              />
            </Field>
            <Field label="Spent">
              <TextInput
                type="number"
                value={editSpent}
                onChange={(e) => onEditSpent(e.target.value)}
                placeholder="—"
              />
            </Field>
          </div>
        </div>

        <div className="mt-3 flex justify-end">
          <Button
            intent="primary"
            size="sm"
            onClick={onApplyOverride}
            disabled={!selectedCampaignId || isActionBusy}
          >
            Apply override
          </Button>
        </div>

        <div className="mt-5 border-t border-[#EFEFEF] pt-4">
          <Field label="Metadata" hint="Updates both on-chain (if available) and DB.">
            <TextArea
              value={editMetadata}
              onChange={(e) => onEditMetadata(e.target.value)}
              rows={3}
              placeholder="JSON metadata or free-text description"
            />
          </Field>
          <div className="mt-3 flex justify-end">
            <Button
              intent="secondary"
              size="sm"
              onClick={onUpdateMetadata}
              disabled={!selectedCampaignId || isActionBusy}
            >
              Update metadata
            </Button>
          </div>
        </div>

        <div className="mt-5 border-t border-[#EFEFEF] pt-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label="Extend duration (days)">
              <TextInput
                type="number"
                value={extendDays}
                onChange={(e) => onExtendDays(e.target.value)}
                placeholder="e.g. 7"
              />
            </Field>
            <Button
              intent="secondary"
              size="sm"
              onClick={onExtend}
              disabled={!selectedCampaignId || isActionBusy || !extendDays}
            >
              Extend
            </Button>
          </div>
        </div>
      </Section>
    </div>
  )
}

/* ─── Section: Publishers ────────────────────────────────────────────────── */

function PublishersSection({
  publishers,
  isLoading,
  onToggleVerify,
}: {
  publishers: Publisher[]
  isLoading: boolean
  onToggleVerify: (publisherId: string, verified: boolean) => void
}) {
  return (
    <Section
      title="Publishers"
      description={`${publishers.length} known publisher${publishers.length === 1 ? '' : 's'}`}
    >
      {isLoading && publishers.length === 0 ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : publishers.length === 0 ? (
        <EmptyState
          icon="websites"
          title="No publishers yet"
          description="Once sites install the SDK and onboard they'll appear here."
        />
      ) : (
        <ul className="grid gap-2">
          {publishers.map((p) => (
            <li
              key={p.publisherId}
              className="flex flex-col gap-3 border border-[#EFEFEF] bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-[#2D2D2D]">{p.domain}</p>
                <p className="mt-0.5 truncate font-mono text-[11px] text-[#666]">{p.wallet}</p>
                <p className="mt-1 text-[11px] text-[#888]">
                  {p.sites?.length ?? 0} site{(p.sites?.length ?? 0) === 1 ? '' : 's'}
                  {p.officialPublisher ? ' · official' : ''}
                  {p.onChainPublisher ? ' · on-chain' : ''}
                </p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <StatusBadge tone={p.verifiedInDb ? 'success' : 'warning'}>
                  {p.verifiedInDb ? 'Verified' : 'Unverified'}
                </StatusBadge>
                <Button
                  size="sm"
                  intent={p.verifiedInDb ? 'secondary' : 'primary'}
                  onClick={() => onToggleVerify(p.publisherId, !p.verifiedInDb)}
                >
                  {p.verifiedInDb ? 'Revoke' : 'Verify'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

/* ─── Section: Advertisers ───────────────────────────────────────────────── */

function AdvertisersSection({
  advertisers,
  isLoading,
}: {
  advertisers: { advertiserId: string; banner: string; wallet: string; campaignCount: number }[]
  isLoading: boolean
}) {
  return (
    <Section
      title="Advertisers"
      description="Inferred from listed campaigns (one row per unique wallet)."
    >
      {isLoading && advertisers.length === 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : advertisers.length === 0 ? (
        <EmptyState
          icon="wallet"
          title="No advertisers yet"
          description="Advertisers show up here as soon as they submit their first campaign."
        />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {advertisers.map((adv) => (
            <div
              key={adv.advertiserId}
              className="flex items-center justify-between border border-[#EFEFEF] bg-white px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate font-mono text-[12px] text-[#2D2D2D]">{adv.wallet}</p>
                <p className="mt-0.5 text-[11px] text-[#888]">
                  {adv.campaignCount} campaign{adv.campaignCount === 1 ? '' : 's'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

/* ─── Section: System ────────────────────────────────────────────────────── */

function SystemSection({
  pricing,
  onPricing,
  onSavePricing,
  isProtocolPaused,
  onTogglePause,
  contractBusy,
  operatorInput,
  onOperatorInput,
  operatorStatus,
  operatorBusy,
  onCheckOperator,
  onAddOperator,
  onRemoveOperator,
}: {
  pricing: PricingConfig
  onPricing: (p: PricingConfig | ((prev: PricingConfig) => PricingConfig)) => void
  onSavePricing: () => void
  isProtocolPaused: boolean
  onTogglePause: () => void
  contractBusy: boolean
  operatorInput: string
  onOperatorInput: (v: string) => void
  operatorStatus: { address: string; isOp: boolean } | null
  operatorBusy: boolean
  onCheckOperator: () => void
  onAddOperator: () => void
  onRemoveOperator: () => void
}) {
  return (
    <div className="space-y-5">
      <Section title="Protocol" description="Emergency pause + on-chain status">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <p className="text-[12px] text-[#666]">Current state</p>
            <div className="mt-1">
              <StatusBadge tone={isProtocolPaused ? 'warning' : 'success'}>
                {isProtocolPaused ? 'Paused' : 'Live'}
              </StatusBadge>
            </div>
          </div>
          <Button
            intent={isProtocolPaused ? 'primary' : 'danger'}
            size="sm"
            onClick={onTogglePause}
            disabled={contractBusy}
          >
            {isProtocolPaused ? 'Resume protocol' : 'Emergency pause'}
          </Button>
        </div>
      </Section>

      <Section title="Pricing" description="Cost basis for impressions">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Impression USD" hint="Base price per impression, in USD.">
            <TextInput
              type="number"
              step="0.00001"
              value={pricing.impressionUsd}
              onChange={(e) =>
                onPricing((prev) => ({ ...prev, impressionUsd: Number(e.target.value) }))
              }
            />
          </Field>
        </div>

        <div className="mt-4">
          <Field
            label="Token price overrides"
            hint="Per-token JSON map. Invalid JSON is ignored while you type."
          >
            <TextArea
              rows={5}
              className="font-mono text-[12px]"
              value={JSON.stringify(pricing.tokenOverrides, null, 2)}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value)
                  onPricing((prev) => ({ ...prev, tokenOverrides: parsed }))
                } catch {
                  /* ignore — partial JSON while typing */
                }
              }}
            />
          </Field>
        </div>

        <div className="mt-3 flex justify-end">
          <Button intent="primary" size="sm" onClick={onSavePricing}>
            Save pricing
          </Button>
        </div>
      </Section>

      <Section
        title="Operators"
        description="Wallets allowed to sign claims via claimWithSignature. Owner-only."
      >
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
          <Field label="Operator address">
            <TextInput
              type="text"
              placeholder="0x…"
              value={operatorInput}
              onChange={(e) => onOperatorInput(e.target.value)}
              className="font-mono"
            />
          </Field>
          <Button
            size="sm"
            intent="secondary"
            onClick={onCheckOperator}
            disabled={operatorBusy}
          >
            Check
          </Button>
          <Button
            size="sm"
            intent="primary"
            onClick={onAddOperator}
            disabled={operatorBusy}
          >
            Add
          </Button>
          <Button
            size="sm"
            intent="danger"
            onClick={onRemoveOperator}
            disabled={operatorBusy}
          >
            Remove
          </Button>
        </div>

        {operatorStatus && (
          <div className="mt-3">
            <StatusBadge tone={operatorStatus.isOp ? 'success' : 'warning'}>
              {shortAddr(operatorStatus.address)} —{' '}
              {operatorStatus.isOp ? 'active operator' : 'not an operator'}
            </StatusBadge>
          </div>
        )}
      </Section>
    </div>
  )
}

/* ─── Section: Audit ─────────────────────────────────────────────────────── */

function AuditSection({
  activity,
  isLoading,
}: {
  activity: ActivityEntry[]
  isLoading: boolean
}) {
  return (
    <Section
      title="Audit trail"
      description={`${activity.length} recent event${activity.length === 1 ? '' : 's'}`}
    >
      {isLoading && activity.length === 0 ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : activity.length === 0 ? (
        <EmptyState
          icon="inbox"
          title="No recent activity"
          description="Admin actions and verification events will appear here."
        />
      ) : (
        <ul className="max-h-[480px] overflow-auto">
          {activity.map((item) => (
            <li
              key={`${item.type}-${item.id}`}
              className="border-b border-[#EFEFEF] py-2.5 last:border-b-0"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#666]">
                  {item.type}
                </p>
                <p className="text-[11px] text-[#999]">
                  {new Date(item.timestamp).toLocaleString()}
                </p>
              </div>
              <p className="mt-0.5 text-[13px] text-[#2D2D2D]">{item.message}</p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
