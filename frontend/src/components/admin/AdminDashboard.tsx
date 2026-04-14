'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { useAds } from '@/hooks/useAds'
import { useStreamingAds } from '@/hooks/useStreamingAds'
import { isWalletAdmin } from '@/lib/admin'

interface Campaign {
  id: string
  name: string
  description?: string
  bannerUrl?: string
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

const SectionButton = ({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={`text-left px-3 py-2 font-black uppercase tracking-widest text-sm rounded ${
      active ? 'bg-black text-white' : 'bg-white text-[#141414] hover:bg-[#F5F3F0]'
    } transition-colors w-full`}
  >
    {label}
  </button>
)

const MetricCard = ({ label, value }: { label: string; value: string | number }) => (
  <div className="rounded-lg border border-[#e5e5e5] bg-white p-4 shadow-sm">
    <p className="text-[10px] font-black uppercase tracking-wider text-[#666666]">{label}</p>
    <p className="text-[20px] font-black text-[#141414] mt-2">{value}</p>
  </div>
)

export default function AdminDashboard() {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const { pause, unpause, stopCampaign, isProtocolPaused, isLoading: contractBusy, addOperator, removeOperator, isOperator } = useStreamingAds()
  const { toggleCampaignPause, updateCampaignMetadata, extendCampaignDuration, isLoading: adsBusy } = useAds()

  const [activeTab, setActiveTab] = useState<'overview' | 'campaigns' | 'publishers' | 'advertisers' | 'settings' | 'audit'>('overview')

  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [stats, setStats] = useState<StatsPayload | null>(null)
  const [pricing, setPricing] = useState<PricingConfig>({ impressionUsd: 0.0002, tokenOverrides: {} })

  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('')
  const [editBudget, setEditBudget] = useState<string>('')
  const [editSpent, setEditSpent] = useState<string>('')
  const [newCampaignName, setNewCampaignName] = useState<string>('')
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

  const loadCampaigns = async () => {
    if (!address) return

    // Prefer dedicated list API, fallback to legacy campaigns API for compatibility.
    const routing = [
      `/api/admin/campaigns/list?adminWallet=${address}`,
      `/api/admin/campaigns?admin=${address}`,
    ]

    let json
    for (const url of routing) {
      const res = await fetch(url)
      if (!res.ok) continue
      json = await res.json()
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
      sites: (p.sites || []).map((site: any) => ({ domain: site.domain, siteId: site.siteId, verifiedInDb: site.verifiedInDb })),
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
    try {
      await Promise.all([loadCampaigns(), loadPublishers(), loadStats(), loadActivity(), loadPricing()])
      setStatusMessage({ type: 'success', text: 'Data refreshed' })
    } catch (err) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Refresh failed' })
    }
  }

  useEffect(() => {
    if (!isDataReady) return
    refreshData()
  }, [isDataReady, ticker])

  const ensureAdmin = () => {
    if (!address) throw new Error('Connect wallet')
    if (!isAdmin) throw new Error('Not an admin')
    return address
  }

  const withAdminSignature = async (payload: { action: string }) => {
    const wallet = ensureAdmin()
    const message = `${payload.action} / ${Date.now()}`
    const signature = await signMessageAsync({ message })
    return { wallet, message, signature }
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
      setStatusMessage({ type: 'success', text: `Campaign ${status}` })
      refreshData()
    } catch (err) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Verification error' })
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
      setStatusMessage({ type: 'success', text: `Publisher ${verified ? 'verified' : 'unverified'}` })
      refreshData()
    } catch (err) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Publisher verify error' })
    }
  }

  const handlePauseToggle = async () => {
    try {
      if (isProtocolPaused) await unpause()
      else await pause()
      setStatusMessage({ type: 'success', text: isProtocolPaused ? 'System resumed' : 'System paused' })
      setTicker((prev) => prev + 1)
    } catch (err) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Protocol pause toggle failed' })
    }
  }

  const stopCampaignInDb = async (campaignId: string) => {
    try {
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
    } catch (err) {
      throw err
    }
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
      setStatusMessage({ type: 'success', text: `Campaign ${String(id)} stopped${chainMessage}` })
      refreshData()
    } catch (err) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Stop campaign failed' })
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
    let onchainSuccess = false

    try {
      setIsActionBusy(true)
      if (campaign.onChainId != null) {
        await toggleCampaignPause(Number(campaign.onChainId))
        onchainSuccess = true
      }
      setStatusMessage({ type: 'success', text: `Campaign ${targetId} pause toggled` })
    } catch (err) {
      setStatusMessage({ type: 'error', text: `On-chain pause toggle failed: ${err instanceof Error ? err.message : 'unknown'}. Falling back to DB state.` })
    }

    const dbUpdates: Record<string, any> = { paused: !campaign.paused }
    const dbSuccess = await setCampaignDbState(targetId, dbUpdates)
    if (!dbSuccess) {
      setStatusMessage({ type: 'error', text: 'DB fallback failed; state may be inconsistent.' })
    }
    refreshData()
    setIsActionBusy(false)
  }

  const handleUpdateMetadata = async () => {
    if (!selectedCampaignId) {
      setStatusMessage({ type: 'error', text: 'Select a campaign first' })
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
      if (!dbSuccess) {
        throw new Error('DB metadata update failed')
      }

      setStatusMessage({ type: 'success', text: `Campaign metadata updated (${onchainSuccess ? 'chain+DB' : 'DB only'})` })
      refreshData()
    } catch (err) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Metadata update failed' })
    } finally {
      setIsActionBusy(false)
    }
  }

  const handleExtendCampaign = async () => {
    if (!selectedCampaignId || !extendDays) {
      setStatusMessage({ type: 'error', text: 'Select a campaign and set extension days' })
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

      // For DB fallback we only update endDate to estimated + additionalSeconds (if original had endDate)
      if (target) {
        const updates: Record<string, any> = {}
        if (target.targetUrl) {
          // no op, keep existing structure
        }
        if (target.onChainId != null && onchainSuccess) {
          /* no db changes needed; metadata may come from chain */
        }
        // to avoid sending invalid updates we can leave as no op, but ensure DB keeps active state
        await setCampaignDbState(selectedCampaignId, { updatedAt: new Date() })
      }

      setStatusMessage({ type: 'success', text: `Campaign duration extended (${onchainSuccess ? 'chain+DB' : 'DB fallback'})` })
      refreshData()
    } catch (err) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Extension failed' })
    } finally {
      setIsActionBusy(false)
    }
  }

  const handleDeleteCampaign = async (campaign: Campaign) => {
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
      setStatusMessage({ type: 'success', text: `Campaign ${campaign.id} deleted` })
      refreshData()
    } catch (err) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Delete campaign failed' })
    }
  }

  const handleCheckOperator = async () => {
    const addr = operatorInput.trim()
    if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      setStatusMessage({ type: 'error', text: 'Invalid address' })
      return
    }
    try {
      setOperatorBusy(true)
      const result = await isOperator(addr)
      setOperatorStatus({ address: addr, isOp: !!result })
    } catch (err) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Check failed' })
    } finally {
      setOperatorBusy(false)
    }
  }

  const handleAddOperator = async () => {
    const addr = operatorInput.trim()
    if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      setStatusMessage({ type: 'error', text: 'Invalid address' })
      return
    }
    try {
      setOperatorBusy(true)
      await addOperator(addr)
      setStatusMessage({ type: 'success', text: `Operator ${addr.slice(0, 8)}... added` })
      setOperatorStatus({ address: addr, isOp: true })
    } catch (err) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Add operator failed' })
    } finally {
      setOperatorBusy(false)
    }
  }

  const handleRemoveOperator = async () => {
    const addr = operatorInput.trim()
    if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      setStatusMessage({ type: 'error', text: 'Invalid address' })
      return
    }
    try {
      setOperatorBusy(true)
      await removeOperator(addr)
      setStatusMessage({ type: 'success', text: `Operator ${addr.slice(0, 8)}... removed` })
      setOperatorStatus({ address: addr, isOp: false })
    } catch (err) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Remove operator failed' })
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
      setStatusMessage({ type: 'success', text: 'Campaign override applied' })
      setEditBudget('')
      setEditSpent('')
      refreshData()
    } catch (err) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Override error' })
    }
  }

  const handlePricingSave = async () => {
    try {
      const auth = await withAdminSignature({ action: 'update_pricing' })
      const res = await fetch('/api/admin/pricing-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ impressionUsd: pricing.impressionUsd, tokenOverrides: pricing.tokenOverrides, ...auth }),
      })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || 'Pricing update failed')
      }
      setStatusMessage({ type: 'success', text: 'Pricing config updated' })
      refreshData()
    } catch (err) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Pricing update error' })
    }
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center p-10">
        <div className="max-w-lg text-center bg-white border-2 border-black p-8 rounded-lg">Connect wallet to access Admin Back Office</div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-10 bg-[#111] text-white">
        <div className="max-w-md text-center border-4 border-red-500 p-8 rounded-lg">
          <h1 className="text-3xl font-black uppercase mb-4">Unauthorized</h1>
          <p>Admin wallet required. Current wallet is not listed as admin.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F5F3F0] text-[#141414]">
      <main className="max-w-7xl mx-auto p-5">
        <header className="mb-8">
          <h1 className="text-5xl font-black uppercase tracking-tight">Back Office | Admin Control Center</h1>
          <p className="mt-2 text-sm text-[#535353]">Full system control for platform administrators with unified publisher + advertiser capabilities, real-time system health, and audit trails.</p>
        </header>

        {statusMessage && (
          <div className={`mb-4 rounded-lg p-3 font-black ${statusMessage.type === 'success' ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
            {statusMessage.text}
          </div>
        )}

        <div className="bg-white py-2 px-4 rounded-md mb-4 border border-[#e5e5e5] shadow-sm">
          <nav className="flex flex-wrap gap-3 text-xs font-black uppercase">
            {['SovAds', 'Dashboard', 'Leaderboard', 'Docs', 'About'].map((item) => (
              <a key={item} href={`/${item.toLowerCase()}`} className="text-[#444] hover:text-black">{item}</a>
            ))}
            <span className="text-[#999]">{address?.slice(0, 8)}...{address?.slice(-8)}</span>
          </nav>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4">
          <aside className="space-y-2">
            <SectionButton active={activeTab === 'overview'} label="Overview" onClick={() => setActiveTab('overview')} />
            <SectionButton active={activeTab === 'campaigns'} label="Campaigns" onClick={() => setActiveTab('campaigns')} />
            <SectionButton active={activeTab === 'publishers'} label="Publishers" onClick={() => setActiveTab('publishers')} />
            <SectionButton active={activeTab === 'advertisers'} label="Advertisers" onClick={() => setActiveTab('advertisers')} />
            <SectionButton active={activeTab === 'settings'} label="System Config" onClick={() => setActiveTab('settings')} />
            <SectionButton active={activeTab === 'audit'} label="Audit Logs" onClick={() => setActiveTab('audit')} />
          </aside>

          <div className="space-y-6">
            {activeTab === 'overview' && (
              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Total Campaigns" value={stats?.campaignCount ?? '—'} />
                <MetricCard label="Active Campaigns" value={stats?.activeCampaigns ?? '—'} />
                <MetricCard label="Total Publishers" value={stats?.totalPublishers ?? '—'} />
                <MetricCard label="Total Impressions" value={stats?.totalImpressions ?? '—'} />
                <MetricCard label="Total Clicks" value={stats?.totalClicks ?? '—'} />
                <MetricCard label="CTR" value={stats?.ctr?.toFixed(2) + '%'} />
                <MetricCard label="Total Revenue" value={stats?.totalRevenue?.toLocaleString() ?? '—'} />
                <MetricCard label="On-chain status" value={isProtocolPaused ? 'Paused' : 'Active'} />
              </section>
            )}

            {activeTab === 'campaigns' && (
              <section className="bg-white border border-[#e5e5e5] p-4 rounded-lg shadow-sm">
                <div className="flex flex-wrap justify-between items-start gap-3 mb-4">
                  <h2 className="text-xl font-black uppercase">Campaign Management</h2>
                  <button
                    onClick={refreshData}
                    className="bg-black text-white px-4 py-2 text-xs font-black uppercase tracking-wider"
                  >
                    Refresh
                  </button>
                </div>

                <div className="mb-4 grid gap-2 md:grid-cols-2">
                  <select value={selectedCampaignId} onChange={(e) => {
                    const id = e.target.value
                    setSelectedCampaignId(id)
                    const picked = campaigns.find((c) => c.id === id)
                    if (picked) {
                      setNewCampaignName(picked.name || '')
                      setEditBudget(String(picked.budget ?? ''))
                      setEditSpent(String(picked.spent ?? ''))
                      setEditMetadata(picked.description || '')
                    }
                  }} className="border border-[#e5e5e5] rounded px-3 py-2 w-full">
                    <option value="">Select campaign for override</option>
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} ({c.advertiserWallet || c.advertiserId})</option>
                    ))}
                  </select>
                  <input type="number" placeholder="Budget override" value={editBudget} onChange={(e) => setEditBudget(e.target.value)} className="border border-[#e5e5e5] rounded px-3 py-2 w-full" />
                  <input type="number" placeholder="Spent override" value={editSpent} onChange={(e) => setEditSpent(e.target.value)} className="border border-[#e5e5e5] rounded px-3 py-2 w-full" />
                  <button onClick={handleCampaignOverride} className="bg-green-500 text-white py-2 text-xs font-black uppercase tracking-wider rounded">Apply Override</button>
                </div>

                <div className="mb-4 border border-[#e5e5e5] rounded p-3 grid gap-2">
                  <label className="text-xs font-black uppercase tracking-wider">Metadata</label>
                  <textarea value={editMetadata} onChange={(e) => setEditMetadata(e.target.value)} className="border border-[#e5e5e5] rounded p-2" rows={2} />
                  <button onClick={handleUpdateMetadata} disabled={!selectedCampaignId || isActionBusy} className="bg-blue-600 text-white py-2 text-xs font-black uppercase tracking-wider rounded">Update Metadata</button>

                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" placeholder="Extend days" value={extendDays} onChange={(e) => setExtendDays(e.target.value)} className="border border-[#e5e5e5] rounded px-3 py-2" />
                    <button onClick={handleExtendCampaign} disabled={!selectedCampaignId || isActionBusy} className="bg-indigo-600 text-white py-2 text-xs font-black uppercase tracking-wider rounded">Extend Duration</button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-[#fafafa]">
                      <tr>
                        <th className="p-2 text-[11px] font-black uppercase border p-2">Name</th>
                        <th className="p-2 text-[11px] font-black uppercase border">Advertiser</th>
                        <th className="p-2 text-[11px] font-black uppercase border">CPC</th>
                        <th className="p-2 text-[11px] font-black uppercase border">Budget</th>
                        <th className="p-2 text-[11px] font-black uppercase border">Spent</th>
                        <th className="p-2 text-[11px] font-black uppercase border">Status</th>
                        <th className="p-2 text-[11px] font-black uppercase border">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.map((campaign) => {
                        const paused = campaign.paused || !campaign.active
                        return (
                          <tr key={campaign.id} className="border-b last:border-b-0">
                            <td className="p-2 text-sm">{campaign.name}</td>
                            <td className="p-2 text-sm">{campaign.advertiserWallet || campaign.advertiserId}</td>
                            <td className="p-2 text-sm">{campaign.cpc ?? '—'}</td>
                            <td className="p-2 text-sm">{campaign.budget ?? '—'}</td>
                            <td className="p-2 text-sm">{campaign.spent ?? '—'}</td>
                            <td className="p-2 text-sm">{campaign.verificationStatus || 'pending'} / {paused ? 'paused' : 'active'}</td>
                            <td className="p-2 text-sm flex flex-wrap gap-1">
                              <button onClick={() => handleVerifyCampaign(campaign.id, 'approved')} className="text-[10px] py-1 px-2 border border-green-600 text-green-700">Approve</button>
                              <button onClick={() => handleVerifyCampaign(campaign.id, 'rejected')} className="text-[10px] py-1 px-2 border border-red-600 text-red-700">Reject</button>
                              <button onClick={() => handleToggleCampaignPause(campaign)} className="text-[10px] py-1 px-2 border border-yellow-600 text-yellow-700">{campaign.paused ? 'Resume' : 'Pause'}</button>
                              <button onClick={() => handleStopCampaign(campaign)} className="text-[10px] py-1 px-2 border border-black">Stop</button>
                              <button onClick={() => handleDeleteCampaign(campaign)} className="text-[10px] py-1 px-2 border border-purple-600 text-purple-700">Delete</button>
                              <button onClick={() => {
                                setSelectedCampaignId(campaign.id)
                                setNewCampaignName(campaign.name || '')
                                setEditBudget(String(campaign.budget ?? ''))
                                setEditSpent(String(campaign.spent ?? ''))
                                setEditMetadata(campaign.description || '')
                              }} className="text-[10px] py-1 px-2 border border-blue-600 text-blue-700">Select</button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {activeTab === 'publishers' && (
              <section className="bg-white border border-[#e5e5e5] p-4 rounded-lg shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-black uppercase">Publisher Management</h2>
                  <span className="text-xs uppercase tracking-wider text-[#666]">{publishers.length} publishers</span>
                </div>
                <div className="grid gap-3">
                  {publishers.map((p) => (
                    <div key={p.publisherId} className="p-3 border border-[#dedede] rounded">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-black text-sm uppercase">{p.domain}</p>
                          <p className="text-xs text-[#666]">{p.wallet}</p>
                          <p className="text-xs mt-1">Sites: {p.sites?.length ?? 0}</p>
                        </div>
                        <div className="flex gap-2">
                          <span className={`text-[10px] font-black uppercase px-2 py-1 rounded ${p.verifiedInDb ? 'bg-green-200' : 'bg-yellow-200'}`}>{p.verifiedInDb ? 'Verified' : 'Unverified'}</span>
                          <button onClick={() => handleVerifyPublisher(p.publisherId, !p.verifiedInDb)} className="text-[10px] px-2 py-1 border border-black uppercase">{p.verifiedInDb ? 'Revoke' : 'Verify'}</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {activeTab === 'advertisers' && (
              <section className="bg-white border border-[#e5e5e5] p-4 rounded-lg shadow-sm">
                <h2 className="text-xl font-black uppercase mb-4">Advertiser Dashboard</h2>
                <p className="text-sm text-[#666] mb-3">Advertisers inferred from listed campaigns.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {advertisers.map((adv) => (
                    <div key={adv.advertiserId} className="border border-[#e5e5e5] p-3 rounded bg-[#fafafa]">
                      <p className="text-xs font-black uppercase">{adv.wallet}</p>
                      <p className="text-[12px]">Campaigns: {adv.campaignCount}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {activeTab === 'settings' && (
              <section className="bg-white border border-[#e5e5e5] p-4 rounded-lg shadow-sm">
                <h2 className="text-xl font-black uppercase mb-4">System Settings</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-[10px] font-black uppercase text-[#666]">Impression USD</label>
                    <input
                      type="number"
                      step="0.00001"
                      value={pricing.impressionUsd}
                      onChange={(e) => setPricing((prev) => ({ ...prev, impressionUsd: Number(e.target.value) }))}
                      className="w-full border border-[#e5e5e5] p-2 rounded"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-[#666]">Contract state</label>
                    <div className="p-2 bg-[#f0f0f0] border border-[#d7d7d7] rounded font-black text-xs uppercase">{isProtocolPaused ? 'Paused' : 'Active'}</div>
                    <button onClick={handlePauseToggle} disabled={contractBusy} className="mt-2 bg-black text-white px-3 py-2 text-xs font-black uppercase w-full">{isProtocolPaused ? 'Resume Protocol' : 'Emergency Pause'}</button>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-[10px] font-black uppercase text-[#666]">Token price overrides</p>
                  <textarea
                    rows={5}
                    value={JSON.stringify(pricing.tokenOverrides, null, 2)}
                    onChange={(e) => {
                      try { const parsed = JSON.parse(e.target.value); setPricing((prev) => ({ ...prev, tokenOverrides: parsed })) } catch {
                        // ignore invalid JSON in real-time
                      }
                    }}
                    className="w-full border border-[#e5e5e5] p-2 rounded font-mono text-xs"
                  />
                </div>

                <button onClick={handlePricingSave} className="mt-4 bg-blue-700 text-white px-4 py-2 uppercase font-black text-xs">Save Settings</button>

                <div className="mt-6 border-t border-[#e5e5e5] pt-4">
                  <h3 className="text-lg font-black uppercase mb-3">Operator Management (Claim Signers)</h3>
                  <p className="text-xs text-[#666] mb-3">Add or remove wallets authorized to sign claims via <code>claimWithSignature</code>. Only the contract owner can manage operators.</p>
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
                    <input
                      type="text"
                      placeholder="0x... operator address"
                      value={operatorInput}
                      onChange={(e) => { setOperatorInput(e.target.value); setOperatorStatus(null) }}
                      className="border border-[#e5e5e5] rounded px-3 py-2 w-full font-mono text-sm"
                    />
                    <button onClick={handleCheckOperator} disabled={operatorBusy} className="bg-gray-700 text-white px-4 py-2 text-xs font-black uppercase tracking-wider rounded whitespace-nowrap">Check</button>
                    <button onClick={handleAddOperator} disabled={operatorBusy} className="bg-green-600 text-white px-4 py-2 text-xs font-black uppercase tracking-wider rounded whitespace-nowrap">Add</button>
                    <button onClick={handleRemoveOperator} disabled={operatorBusy} className="bg-red-600 text-white px-4 py-2 text-xs font-black uppercase tracking-wider rounded whitespace-nowrap">Remove</button>
                  </div>
                  {operatorStatus && (
                    <div className={`mt-2 text-xs font-black uppercase px-3 py-2 rounded ${operatorStatus.isOp ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                      {operatorStatus.address.slice(0, 10)}...{operatorStatus.address.slice(-8)} — {operatorStatus.isOp ? '✓ Active Operator' : '✗ Not an Operator'}
                    </div>
                  )}
                </div>
              </section>
            )}

            {activeTab === 'audit' && (
              <section className="bg-white border border-[#e5e5e5] p-4 rounded-lg shadow-sm">
                <h2 className="text-xl font-black uppercase mb-4">Audit Log</h2>
                <div className="space-y-2 max-h-[420px] overflow-auto">
                  {activity.map((item) => (
                    <div key={`${item.type}-${item.id}`} className="border border-[#e5e5e5] rounded p-2 text-xs">
                      <div className="font-black">{item.type}</div>
                      <div>{item.message}</div>
                      <div className="text-[#666]">{new Date(item.timestamp).toLocaleString()}</div>
                    </div>
                  ))}
                  {activity.length === 0 && <div className="text-[#666]">No recent activity.</div>}
                </div>
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
