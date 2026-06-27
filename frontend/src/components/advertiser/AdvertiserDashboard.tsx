'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAccount, useReadContract } from 'wagmi'
import { formatUnits } from 'viem'

import WalletButton from '@/components/WalletButton'
import TopUpModal from '@/components/TopUpModal'
import { useAds } from '@/hooks/useAds'
import { useStreamingAds } from '@/hooks/useStreamingAds'
import { useAdvertiserCampaigns } from '@/hooks/useAdvertiserCampaigns'
import { GOODDOLLAR_ADDRESS, chainId } from '@/lib/chain-config'

import AdvertiserIcon from './AdvertiserIcon'
import AdvertiserSidebar from './AdvertiserSidebar'
import { advertiserSidebarItems, type AdvertiserSectionId } from './advertiser-config'
import CampaignPreviewModal, {
  BannerPreview,
  SidebarPreview,
  PopupPreview,
  BottomBarPreview,
  NativeCardPreview,
  type PreviewCampaign,
  type PreviewDevice,
} from './CampaignPreviewModal'
import EditCampaignModal from './EditCampaignModal'
import CampaignTable from './CampaignTable'
import CampaignCard from './CampaignCard'
import { BannerAd, SidebarAd, PopupAd } from '@/components/ads/AdSlots'
import {
  Alert,
  Button,
  EmptyState,
  Field,
  Metric,
  Section,
  Skeleton,
  StatusBadge,
  TextInput,
  formatDate,
  formatNumber,
  formatPct,
  getCampaignStatusDisplay,
} from './ui'
import type { Campaign, DailyEntry } from './types'

const ERC20_BALANCE_ABI = [{
  name: 'balanceOf',
  type: 'function',
  stateMutability: 'view',
  inputs: [{ name: 'owner', type: 'address' }],
  outputs: [{ type: 'uint256' }],
}] as const

type StatusFilter = 'all' | 'active' | 'paused' | 'inactive'
type ViewMode = 'table' | 'cards'

/**
 * The advertiser workspace.
 *
 * A single, calm shell: top bar (workspace + balance + primary CTA), left
 * sidebar nav, and section-scoped main content. Heavy in-page forms (campaign
 * creation, CTA management) live on dedicated routes — this shell focuses on
 * monitoring + light editing.
 */
export default function AdvertiserDashboard() {
  const { address, isConnected } = useAccount()
  const { toggleCampaignPause, extendCampaignDuration, isLoading: isContractLoading } = useAds()
  const { createStreamingCampaign } = useStreamingAds()

  const { campaigns, globalStats, isLoading, error, refresh } = useAdvertiserCampaigns(address ?? undefined)

  // G$ balance shown in the top bar — the question advertisers ask first.
  const { data: balanceRaw } = useReadContract({
    address: GOODDOLLAR_ADDRESS as `0x${string}`,
    abi: ERC20_BALANCE_ABI,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    chainId,
    query: { enabled: !!address, refetchInterval: 30_000 },
  })
  const balance = balanceRaw != null
    ? parseFloat(formatUnits(balanceRaw as bigint, 18))
    : null

  // Section + view state
  const [section, setSection] = useState<AdvertiserSectionId>('overview')
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  // Modals
  const [previewCampaign, setPreviewCampaign] = useState<Campaign | null>(null)
  const [editCampaign, setEditCampaign] = useState<Campaign | null>(null)
  const [fundCampaign, setFundCampaign] = useState<Campaign | null>(null)
  const [extendTarget, setExtendTarget] = useState<Campaign | null>(null)
  const [extendDays, setExtendDays] = useState('')
  const [isExtending, setIsExtending] = useState(false)

  // Inline action feedback
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  // Analytics
  const [analyticsCampaign, setAnalyticsCampaign] = useState<Campaign | null>(null)
  const [statsDays, setStatsDays] = useState<'7' | '30' | '90' | 'all'>('30')
  const [stats, setStats] = useState<{ impressions: number; clicks: number; ctr: number; totalSpent: number } | null>(null)
  const [daily, setDaily] = useState<DailyEntry[]>([])
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsError, setStatsError] = useState<string | null>(null)

  const loadStats = useCallback(async (id: string, days: string) => {
    setStatsLoading(true)
    setStatsError(null)
    try {
      const param = days === 'all' ? '365' : days
      const res = await fetch(`/api/analytics?campaignId=${id}&days=${param}`)
      if (!res.ok) throw new Error('Failed to load analytics')
      const data = await res.json()
      setStats({
        impressions: data.impressions ?? 0,
        clicks: data.clicks ?? 0,
        ctr: data.ctr ?? 0,
        totalSpent: data.totalRevenue ?? 0,
      })
      setDaily((data.daily ?? []) as DailyEntry[])
    } catch (err) {
      setStatsError(err instanceof Error ? err.message : 'Analytics load failed')
    } finally {
      setStatsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (analyticsCampaign) void loadStats(analyticsCampaign.id, statsDays)
  }, [analyticsCampaign, statsDays, loadStats])

  // ── Row action handler ───────────────────────────────────────────────────
  const handleAction = useCallback(
    async (
      action: 'preview' | 'stats' | 'fund' | 'pause' | 'edit' | 'extend' | 'publish' | 'discard',
      c: Campaign,
    ) => {
      switch (action) {
        case 'preview': return setPreviewCampaign(c)
        case 'fund':    return setFundCampaign(c)
        case 'edit':    return setEditCampaign(c)
        case 'extend':  return setExtendTarget(c)
        case 'stats':
          setAnalyticsCampaign(c)
          setSection('analytics')
          return
        case 'pause': {
          if (c.onChainId == null) return
          setBusy(true)
          setFeedback(null)
          try {
            await toggleCampaignPause(Number(c.onChainId))
            setFeedback({ tone: 'success', text: `Campaign ${c.paused ? 'resumed' : 'paused'}.` })
            refresh()
          } catch (err) {
            setFeedback({ tone: 'error', text: err instanceof Error ? err.message : 'Action failed' })
          } finally {
            setBusy(false)
          }
          return
        }
        case 'publish': {
          // Promote a draft on-chain: createStreamingCampaign(budget, dur, meta)
          // then notify the API so the row flips from 'draft' → 'review'.
          if (!address) {
            setFeedback({ tone: 'error', text: 'Connect your wallet first.' })
            return
          }
          if (c.status !== 'draft') return
          if (!c.startDate || !c.endDate) {
            setFeedback({
              tone: 'error',
              text: 'This draft is missing a schedule. Open Edit, set start + end dates, then publish.',
            })
            return
          }
          const startIso = new Date(c.startDate).toISOString()
          const endIso = new Date(c.endDate).toISOString()
          const durationSeconds = Math.max(
            1,
            Math.floor((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000),
          )
          // Mirror the off-chain id format used at draft-time so the API can
          // dedupe / cross-reference: sovads-YYMMDD-XXXXXX
          const d = new Date()
          const yy = String(d.getFullYear()).slice(-2)
          const mm = String(d.getMonth() + 1).padStart(2, '0')
          const dd = String(d.getDate()).padStart(2, '0')
          const rand = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')
          const contractCampaignId = `sovads-${yy}${mm}${dd}-${rand}`
          const onChainMetadata = JSON.stringify({
            id: contractCampaignId,
            name: c.name,
            description: c.description,
            bannerUrl: c.bannerUrl,
            targetUrl: c.targetUrl,
            cpc: String(c.cpc),
            startDate: startIso,
            endDate: endIso,
            createdAt: new Date().toISOString(),
          })

          setBusy(true)
          setFeedback(null)
          try {
            const result = await createStreamingCampaign(
              String(c.budget),
              durationSeconds,
              onChainMetadata,
            )
            const resp = await fetch('/api/campaigns/submit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                campaignId: c.id,
                wallet: address,
                transactionHash: result.hash,
                contractCampaignId,
                onChainId: result.id,
              }),
            })
            if (!resp.ok) {
              const err = await resp.json().catch(() => ({}))
              throw new Error(err?.error || 'Submit failed')
            }
            setFeedback({
              tone: 'success',
              text: 'Campaign submitted. It will go live once review approves it.',
            })
            refresh()
          } catch (err) {
            setFeedback({
              tone: 'error',
              text: err instanceof Error ? err.message : 'Publish failed',
            })
          } finally {
            setBusy(false)
          }
          return
        }
        case 'discard': {
          if (!address) return
          if (c.status !== 'draft') return
          const ok =
            typeof window !== 'undefined'
              ? window.confirm(`Discard draft "${c.name}"? This can't be undone.`)
              : true
          if (!ok) return
          setBusy(true)
          setFeedback(null)
          try {
            const resp = await fetch('/api/campaigns/delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ wallet: address, id: c.id }),
            })
            if (!resp.ok) {
              const err = await resp.json().catch(() => ({}))
              throw new Error(err?.error || 'Delete failed')
            }
            setFeedback({ tone: 'success', text: 'Draft discarded.' })
            refresh()
          } catch (err) {
            setFeedback({
              tone: 'error',
              text: err instanceof Error ? err.message : 'Discard failed',
            })
          } finally {
            setBusy(false)
          }
          return
        }
      }
    },
    [toggleCampaignPause, refresh, address, createStreamingCampaign],
  )

  const handleExtendSubmit = async () => {
    if (!extendTarget || !extendDays || extendTarget.onChainId == null) return
    setIsExtending(true)
    setFeedback(null)
    try {
      const seconds = Number(extendDays) * 86400
      await extendCampaignDuration(Number(extendTarget.onChainId), seconds)
      setFeedback({ tone: 'success', text: 'Campaign duration extended.' })
      setExtendTarget(null)
      setExtendDays('')
      refresh()
    } catch (err) {
      setFeedback({ tone: 'error', text: err instanceof Error ? err.message : 'Extension failed' })
    } finally {
      setIsExtending(false)
    }
  }

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return campaigns.filter((c) => {
      const matchQ = !q || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
      const matchS =
        statusFilter === 'all' ||
        (statusFilter === 'active' && c.active && !c.paused) ||
        (statusFilter === 'paused' && !!c.paused) ||
        (statusFilter === 'inactive' && !c.active)
      return matchQ && matchS
    })
  }, [campaigns, searchQuery, statusFilter])

  // ── Connect gate ─────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[#F5F3F0] flex items-center justify-center p-6">
        <div className="w-full max-w-md border border-[#2D2D2D] bg-white p-8 shadow-[6px_6px_0_0_#2D2D2D] text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center bg-[#2D2D2D]">
            <AdvertiserIcon name="campaign" className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-[22px] font-bold tracking-tight text-[#2D2D2D]">Advertiser workspace</h1>
          <p className="mt-2 text-[13px] text-[#666] leading-5">
            Connect a wallet to manage campaigns, track performance, and fund placements.
          </p>
          <div className="mt-5"><WalletButton /></div>
        </div>
      </div>
    )
  }

  // ── Shell ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F5F3F0]">
      {/* Top bar */}
      <div className="border-b border-[#E5E5E5] bg-white">
        <div className="mx-auto flex max-w-screen-xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#888]">Workspace</p>
            <h1 className="truncate text-[15px] font-bold text-[#2D2D2D]">Advertiser</h1>
          </div>
          <div className="flex items-center gap-2">
            <BalancePill balance={balance} />
            <Link
              href="/create-campaign"
              className="inline-flex items-center gap-1.5 border border-[#2D2D2D] bg-[#2D2D2D] px-3 py-2 text-[12px] font-semibold text-white shadow-[2px_2px_0_0_#2D2D2D] hover:bg-[#1F1F1F]"
            >
              <AdvertiserIcon name="activate" className="h-3.5 w-3.5" />
              New campaign
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-screen-xl px-4 py-6">
        <div className="flex gap-6 lg:gap-8">
          {/* Desktop sidebar */}
          <div className="hidden w-[200px] flex-shrink-0 lg:block">
            <AdvertiserSidebar items={advertiserSidebarItems} activeSection={section} onSelect={setSection} />
          </div>

          {/* Mobile section tabs */}
          <div className="mb-4 w-full overflow-x-auto pb-1 lg:hidden">
            <div className="flex min-w-max gap-1">
              {advertiserSidebarItems.map((item) => {
                const key = item.id ?? item.sectionId ?? item.href ?? item.label
                const isActive = !!item.sectionId && item.sectionId === section
                const tabClasses = [
                  'inline-flex items-center gap-1.5 whitespace-nowrap border px-3 py-1.5 text-[12px] font-medium transition-colors',
                  isActive
                    ? 'border-[#2D2D2D] bg-[#2D2D2D] text-white'
                    : 'border-[#E5E5E5] bg-white text-[#444] hover:bg-[#F4F4F2]',
                ].join(' ')
                if (item.href) {
                  return (
                    <Link key={key} href={item.href} className={tabClasses}>
                      <AdvertiserIcon name={item.icon} className="h-3.5 w-3.5" />
                      {item.label}
                    </Link>
                  )
                }
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
                campaigns={campaigns}
                globalStats={globalStats}
                balance={balance}
                isLoading={isLoading}
                onJumpToCampaigns={() => setSection('campaigns')}
                onRowAction={handleAction}
              />
            )}

            {section === 'campaigns' && (
              <CampaignsSection
                campaigns={filtered}
                total={campaigns.length}
                isLoading={isLoading}
                error={error}
                onRefresh={refresh}
                searchQuery={searchQuery}
                onSearchQuery={setSearchQuery}
                statusFilter={statusFilter}
                onStatusFilter={setStatusFilter}
                viewMode={viewMode}
                onViewMode={setViewMode}
                onRowAction={handleAction}
                isProcessing={busy || isContractLoading}
              />
            )}

            {section === 'preview' && (
              <PreviewSection address={address ?? undefined} campaigns={campaigns} />
            )}

            {section === 'analytics' && (
              <AnalyticsSection
                campaigns={campaigns}
                analyticsCampaign={analyticsCampaign}
                onPick={setAnalyticsCampaign}
                statsDays={statsDays}
                onStatsDays={setStatsDays}
                stats={stats}
                daily={daily}
                isLoading={statsLoading}
                error={statsError}
                onRefresh={() => analyticsCampaign && loadStats(analyticsCampaign.id, statsDays)}
              />
            )}

            {section === 'billing' && (
              <BillingSection
                campaigns={campaigns}
                balance={balance}
                onFund={setFundCampaign}
              />
            )}

            {section === 'settings' && (
              <SettingsSection address={address ?? ''} campaignCount={campaigns.length} activeCount={globalStats.activeCampaigns} />
            )}
          </main>
        </div>
      </div>

      {/* Modals */}
      {previewCampaign && (
        <CampaignPreviewModal campaign={previewCampaign} onClose={() => setPreviewCampaign(null)} />
      )}
      {editCampaign && (
        <EditCampaignModal
          campaign={editCampaign}
          ownerAddress={address ?? undefined}
          onClose={() => setEditCampaign(null)}
          onSaved={refresh}
        />
      )}
      <TopUpModal
        open={fundCampaign !== null}
        campaign={fundCampaign as never}
        onClose={() => setFundCampaign(null)}
        onSuccess={refresh}
      />
      {extendTarget && (
        <ExtendDialog
          campaign={extendTarget}
          days={extendDays}
          onDays={setExtendDays}
          isExtending={isExtending}
          onSubmit={handleExtendSubmit}
          onCancel={() => { setExtendTarget(null); setExtendDays('') }}
        />
      )}
    </div>
  )
}

// ─── Section: Overview ────────────────────────────────────────────────────

function OverviewSection({
  campaigns,
  globalStats,
  balance,
  isLoading,
  onJumpToCampaigns,
  onRowAction,
}: {
  campaigns: Campaign[]
  globalStats: ReturnType<typeof useAdvertiserCampaigns>['globalStats']
  balance: number | null
  isLoading: boolean
  onJumpToCampaigns: () => void
  onRowAction: (action: 'stats', c: Campaign) => void
}) {
  const top = useMemo(() => {
    return [...campaigns]
      .filter((c) => c.spent > 0 || (c.active && !c.paused))
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 5)
  }, [campaigns])

  return (
    <div className="space-y-5">
      {/* KPI hero strip */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          accent="hero"
          label="G$ balance"
          value={balance != null ? formatNumber(Number(balance.toFixed(2))) : '—'}
          hint="Wallet (top-up to fund campaigns)"
          loading={balance == null}
        />
        <Metric label="Total spent" value={formatNumber(Number(globalStats.totalSpent.toFixed(2)))} loading={isLoading} />
        <Metric
          label="Impressions"
          value={globalStats.totalImpressions > 0 ? formatNumber(globalStats.totalImpressions) : '—'}
          loading={isLoading}
        />
        <Metric
          label="Avg CTR"
          value={globalStats.totalImpressions > 0 ? formatPct(globalStats.avgCtr, 2) : '—'}
          loading={isLoading}
        />
      </div>

      {/* Status snapshot */}
      <Section title="Status" description="What changed in your account">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        ) : (
          <ul className="divide-y divide-[#EFEFEF] text-[13px]">
            <li className="flex items-center justify-between py-2">
              <span className="text-[#444]">Total campaigns</span>
              <span className="font-semibold text-[#2D2D2D]">{campaigns.length}</span>
            </li>
            <li className="flex items-center justify-between py-2">
              <span className="text-[#444]">Active campaigns</span>
              <span className="font-semibold text-[#2D2D2D]">{globalStats.activeCampaigns}</span>
            </li>
            <li className="flex items-center justify-between py-2">
              <span className="text-[#444]">Drafts</span>
              <span className="font-semibold text-[#2D2D2D]">{campaigns.filter((c) => c.status === 'draft').length}</span>
            </li>
            <li className="flex items-center justify-between py-2">
              <span className="text-[#444]">Paused</span>
              <span className="font-semibold text-[#2D2D2D]">{campaigns.filter((c) => c.paused).length}</span>
            </li>
            <li className="flex items-center justify-between py-2">
              <span className="text-[#444]">Inactive / ended</span>
              <span className="font-semibold text-[#2D2D2D]">{campaigns.filter((c) => !c.active && c.status !== 'draft').length}</span>
            </li>
          </ul>
        )}
      </Section>

      {/* Top performers */}
      <Section
        title="Top campaigns by spend"
        description="Highest-spend campaigns across all time"
        actions={
          campaigns.length > 0 && (
            <Button intent="ghost" size="sm" onClick={onJumpToCampaigns}>
              View all →
            </Button>
          )
        }
      >
        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : top.length === 0 ? (
          <EmptyState
            title="No campaign activity yet"
            description="Create a campaign to start collecting impressions and spend data."
            action={
              <Link
                href="/create-campaign"
                className="inline-flex items-center gap-1.5 border border-[#2D2D2D] bg-[#2D2D2D] px-3 py-2 text-[12px] font-semibold text-white"
              >
                Create campaign
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto border border-[#EFEFEF]">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-[#FAFAF8] text-[11px] font-semibold uppercase tracking-wide text-[#666]">
                  <th className="px-3 py-2 text-left">Campaign</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Spent</th>
                  <th className="px-3 py-2 text-right">Budget</th>
                  <th className="px-3 py-2 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {top.map((c, i) => {
                  const { label: statusLabel, tone } = getCampaignStatusDisplay(c)
                  return (
                    <tr key={c.id} className={`border-t border-[#EFEFEF] ${i % 2 === 1 ? 'bg-[#FCFCFB]' : 'bg-white'}`}>
                      <td className="px-3 py-2 font-medium text-[#2D2D2D]">{c.name}</td>
                      <td className="px-3 py-2"><StatusBadge tone={tone}>{statusLabel}</StatusBadge></td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(c.spent)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-[#666]">{formatNumber(c.budget)}</td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" intent="ghost" onClick={() => onRowAction('stats', c)}>Stats</Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  )
}

// ─── Section: Campaigns ──────────────────────────────────────────────────

function CampaignsSection({
  campaigns,
  total,
  isLoading,
  error,
  onRefresh,
  searchQuery,
  onSearchQuery,
  statusFilter,
  onStatusFilter,
  viewMode,
  onViewMode,
  onRowAction,
  isProcessing,
}: {
  campaigns: Campaign[]
  total: number
  isLoading: boolean
  error: string | null
  onRefresh: () => void
  searchQuery: string
  onSearchQuery: (v: string) => void
  statusFilter: StatusFilter
  onStatusFilter: (v: StatusFilter) => void
  viewMode: ViewMode
  onViewMode: (v: ViewMode) => void
  onRowAction: (action: 'preview' | 'stats' | 'fund' | 'pause' | 'edit' | 'extend' | 'publish' | 'discard', c: Campaign) => void
  isProcessing: boolean
}) {
  return (
    <Section
      title="Campaigns"
      description={total > 0 ? `${total} total · showing ${campaigns.length}` : 'No campaigns yet'}
      actions={
        <>
          <Button intent="ghost" size="sm" onClick={onRefresh} disabled={isLoading}>
            {isLoading ? 'Loading…' : 'Refresh'}
          </Button>
          <Link
            href="/create-campaign"
            className="inline-flex items-center gap-1.5 border border-[#2D2D2D] bg-[#2D2D2D] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#1F1F1F]"
          >
            New campaign
          </Link>
        </>
      }
    >
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchQuery(e.target.value)}
          placeholder="Search campaigns…"
          className="min-w-[200px] flex-1 border border-[#D4D4D2] bg-white px-3 py-1.5 text-[13px] focus:border-[#2D2D2D] focus:outline-none"
        />
        <div className="flex">
          {(['all', 'active', 'paused', 'inactive'] as const).map((f, i) => (
            <button
              key={f}
              type="button"
              onClick={() => onStatusFilter(f)}
              className={[
                'border px-2.5 py-1.5 text-[12px] font-medium capitalize transition-colors',
                i > 0 && '-ml-px',
                statusFilter === f
                  ? 'z-10 border-[#2D2D2D] bg-[#2D2D2D] text-white'
                  : 'border-[#D4D4D2] bg-white text-[#444] hover:bg-[#F4F4F2]',
              ].filter(Boolean).join(' ')}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex">
          <ViewToggleBtn active={viewMode === 'table'} onClick={() => onViewMode('table')} label="Table" />
          <ViewToggleBtn active={viewMode === 'cards'} onClick={() => onViewMode('cards')} label="Cards" first={false} />
        </div>
      </div>

      {error && <div className="mb-4"><Alert tone="error">{error}</Alert></div>}

      {isLoading && campaigns.length === 0 ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : campaigns.length === 0 ? (
        total === 0 ? (
          <EmptyState
            title="No campaigns yet"
            description="Create your first campaign to start getting verified impressions across the publisher network."
            action={
              <Link
                href="/create-campaign"
                className="inline-flex items-center gap-1.5 border border-[#2D2D2D] bg-[#2D2D2D] px-3 py-2 text-[12px] font-semibold text-white"
              >
                Create campaign
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="No campaigns match"
            description="Try clearing the search or changing the status filter."
          />
        )
      ) : viewMode === 'table' ? (
        <CampaignTable campaigns={campaigns} onAction={onRowAction} isProcessing={isProcessing} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {campaigns.map((c) => (
            <CampaignCard
              key={c.id}
              campaign={c}
              onPreview={(x) => onRowAction('preview', x)}
              onStats={(x) => onRowAction('stats', x)}
              onFund={(x) => onRowAction('fund', x)}
              onEdit={(x) => onRowAction('edit', x)}
              onPublish={(x) => onRowAction('publish', x)}
              onDiscard={(x) => onRowAction('discard', x)}
            />
          ))}
        </div>
      )}
    </Section>
  )
}

function ViewToggleBtn({ active, onClick, label, first = true }: { active: boolean; onClick: () => void; label: string; first?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'border px-2.5 py-1.5 text-[12px] font-medium transition-colors',
        !first && '-ml-px',
        active ? 'z-10 border-[#2D2D2D] bg-[#2D2D2D] text-white' : 'border-[#D4D4D2] bg-white text-[#444] hover:bg-[#F4F4F2]',
      ].filter(Boolean).join(' ')}
    >
      {label}
    </button>
  )
}

// ─── Section: Analytics ──────────────────────────────────────────────────

function AnalyticsSection({
  campaigns,
  analyticsCampaign,
  onPick,
  statsDays,
  onStatsDays,
  stats,
  daily,
  isLoading,
  error,
  onRefresh,
}: {
  campaigns: Campaign[]
  analyticsCampaign: Campaign | null
  onPick: (c: Campaign | null) => void
  statsDays: '7' | '30' | '90' | 'all'
  onStatsDays: (d: '7' | '30' | '90' | 'all') => void
  stats: { impressions: number; clicks: number; ctr: number; totalSpent: number } | null
  daily: DailyEntry[]
  isLoading: boolean
  error: string | null
  onRefresh: () => void
}) {
  if (campaigns.length === 0) {
    return (
      <Section title="Analytics">
        <EmptyState
          title="No campaigns"
          description="Create a campaign first to see analytics."
          action={
            <Link
              href="/create-campaign"
              className="inline-flex items-center gap-1.5 border border-[#2D2D2D] bg-[#2D2D2D] px-3 py-2 text-[12px] font-semibold text-white"
            >
              Create campaign
            </Link>
          }
        />
      </Section>
    )
  }

  return (
    <Section
      title="Analytics"
      description={analyticsCampaign ? `Performance for ${analyticsCampaign.name}` : 'Pick a campaign to view performance'}
      actions={
        analyticsCampaign && (
          <>
            <div className="flex">
              {(['7', '30', '90', 'all'] as const).map((d, i) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => onStatsDays(d)}
                  className={[
                    'border px-2.5 py-1.5 text-[12px] font-medium transition-colors',
                    i > 0 && '-ml-px',
                    statsDays === d
                      ? 'z-10 border-[#2D2D2D] bg-[#2D2D2D] text-white'
                      : 'border-[#D4D4D2] bg-white text-[#444] hover:bg-[#F4F4F2]',
                  ].filter(Boolean).join(' ')}
                >
                  {d === 'all' ? 'All' : `${d}d`}
                </button>
              ))}
            </div>
            <Button intent="ghost" size="sm" onClick={onRefresh} disabled={isLoading}>
              {isLoading ? 'Loading…' : 'Refresh'}
            </Button>
          </>
        )
      }
    >
      {!analyticsCampaign ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {campaigns.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onPick(c)}
              className="flex items-center gap-3 border border-[#E5E5E5] bg-white p-3 text-left hover:border-[#2D2D2D]"
            >
              <AdvertiserIcon name="campaign" className="h-4 w-4 flex-shrink-0 text-[#444]" />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-[#2D2D2D]">{c.name}</p>
                <p className="text-[11px] text-[#888]">{getCampaignStatusDisplay(c).label}</p>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {error && (
            <Alert tone="error">
              {error}{' '}
              <button type="button" onClick={onRefresh} className="ml-2 underline">Retry</button>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Impressions" value={stats ? formatNumber(stats.impressions) : '—'} loading={isLoading} />
            <Metric label="Clicks" value={stats ? formatNumber(stats.clicks) : '—'} loading={isLoading} />
            <Metric label="CTR" value={stats ? formatPct(stats.ctr, 2) : '—'} loading={isLoading} />
            <Metric label="Total spent" value={stats ? stats.totalSpent.toFixed(4) : '—'} loading={isLoading} />
          </div>

          {/* Daily breakdown */}
          {isLoading ? (
            <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : daily.length === 0 ? (
            <EmptyState title="No activity in this range" description="No impressions or clicks recorded yet." />
          ) : (
            <div className="overflow-x-auto border border-[#E5E5E5]">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-[#FAFAF8] text-[11px] font-semibold uppercase tracking-wide text-[#666]">
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-right">Impressions</th>
                    <th className="px-3 py-2 text-right">Clicks</th>
                    <th className="px-3 py-2 text-right">CTR</th>
                    <th className="px-3 py-2 text-right">Spend</th>
                  </tr>
                </thead>
                <tbody>
                  {daily.map((row, i) => {
                    const ctr = row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0
                    return (
                      <tr key={row.date} className={`border-t border-[#EFEFEF] ${i % 2 === 1 ? 'bg-[#FCFCFB]' : 'bg-white'}`}>
                        <td className="px-3 py-2 text-[#444]">{formatDate(row.date)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.impressions)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.clicks)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-[#666]">{formatPct(ctr, 2)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-[#146C2E]">{row.revenue.toFixed(4)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div>
            <Button intent="ghost" size="sm" onClick={() => onPick(null)}>← Pick a different campaign</Button>
          </div>
        </div>
      )}
    </Section>
  )
}

// ─── Section: Preview ────────────────────────────────────────────────────

type PreviewSurface = 'banner' | 'sidebar' | 'bottombar' | 'native' | 'popup'
type PreviewMode = 'campaign' | 'live'

const PREVIEW_SURFACES: { id: PreviewSurface; label: string; hint: string }[] = [
  { id: 'banner', label: 'Banner', hint: 'Leaderboard / mobile banner.' },
  { id: 'sidebar', label: 'Sidebar', hint: 'Half-page rail next to content.' },
  { id: 'bottombar', label: 'Bottom bar', hint: 'Sticky footer strip.' },
  { id: 'native', label: 'Native card', hint: 'Inline feed card.' },
  { id: 'popup', label: 'Popup', hint: 'Centered modal overlay.' },
]

function PreviewSection({
  address,
  campaigns,
}: {
  address?: string
  campaigns: Campaign[]
}) {
  // Default to the advertiser's own campaign — the user complained the live
  // SDK was serving someone else's expired ad. The "Live SDK" toggle is still
  // available as a secondary path for those who want to see real serving.
  const [mode, setMode] = useState<PreviewMode>('campaign')
  const [campaignId, setCampaignId] = useState<string>(() => campaigns[0]?.id ?? '')
  const [surface, setSurface] = useState<PreviewSurface>('banner')
  const [device, setDevice] = useState<PreviewDevice>('desktop')
  const [popupOpen, setPopupOpen] = useState(false)
  const [useWallet, setUseWallet] = useState(true)
  const [slotEpoch, setSlotEpoch] = useState(0)
  const [livePopupKey, setLivePopupKey] = useState(0)

  // Adopt the first campaign as soon as the list loads / changes.
  useEffect(() => {
    if (!campaignId && campaigns[0]) {
      setCampaignId(campaigns[0].id)
    }
  }, [campaigns, campaignId])

  const selected = campaigns.find((c) => c.id === campaignId) ?? null

  const previewCampaign: PreviewCampaign | null = selected
    ? {
        name: selected.name,
        description: selected.description,
        bannerUrl: selected.bannerUrl,
        mediaType: selected.mediaType,
        targetUrl: selected.targetUrl,
        cpc: selected.cpc,
      }
    : null

  const consumerId = useWallet ? address : undefined
  const slotKey = `${surface}-${slotEpoch}-${consumerId ?? 'any'}`

  return (
    <div className="space-y-5">
      <Section
        title="Ad preview"
        description="See exactly how your campaign will render across every SovAds surface. Pick a campaign — no real ads are served, no impressions are tracked."
      >
        <div className="space-y-3">
          <div className="inline-flex border border-[#E5E5E5] bg-white">
            <button
              type="button"
              onClick={() => setMode('campaign')}
              className={[
                'px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider',
                mode === 'campaign' ? 'bg-[#2D2D2D] text-white' : 'text-[#444] hover:bg-[#F4F4F2]',
              ].join(' ')}
            >
              My campaign
            </button>
            <button
              type="button"
              onClick={() => setMode('live')}
              className={[
                'px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider',
                mode === 'live' ? 'bg-[#2D2D2D] text-white' : 'text-[#444] hover:bg-[#F4F4F2]',
              ].join(' ')}
            >
              Live SDK render
            </button>
          </div>

          {mode === 'campaign' && (
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <Field label="Campaign">
                {campaigns.length === 0 ? (
                  <p className="border border-dashed border-[#E5E5E5] bg-[#FAFAF8] px-3 py-2 text-[12px] text-[#888]">
                    Create a campaign to preview it here.
                  </p>
                ) : (
                  <select
                    value={campaignId}
                    onChange={(e) => setCampaignId(e.target.value)}
                    className="w-full border border-[#E5E5E5] bg-white px-3 py-2 text-[13px] text-[#2D2D2D]"
                  >
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} · #{c.onChainId ?? '—'}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Device">
                <div className="inline-flex border border-[#E5E5E5] bg-white">
                  {(['desktop', 'mobile'] as PreviewDevice[]).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDevice(d)}
                      className={[
                        'px-3 py-2 text-[11px] font-semibold uppercase tracking-wider',
                        device === d ? 'bg-[#2D2D2D] text-white' : 'text-[#444] hover:bg-[#F4F4F2]',
                      ].join(' ')}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          )}

          {mode === 'live' && (
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 text-[12px] text-[#2D2D2D]">
                <input
                  type="checkbox"
                  checked={useWallet}
                  disabled={!address}
                  onChange={(e) => setUseWallet(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[#2D2D2D]"
                />
                <span>
                  Target my wallet
                  {address ? (
                    <span className="ml-1 font-mono text-[11px] text-[#888]">
                      ({address.slice(0, 6)}…{address.slice(-4)})
                    </span>
                  ) : (
                    <span className="ml-1 text-[11px] text-[#888]">(connect a wallet)</span>
                  )}
                </span>
              </label>
              <Button
                intent="secondary"
                size="sm"
                onClick={() => {
                  setSlotEpoch((n) => n + 1)
                  setLivePopupKey((n) => n + 1)
                }}
              >
                Reload ad
              </Button>
              <p className="text-[11px] text-[#999]">
                Note: live mode serves whatever ad the network selects — could be any active campaign.
              </p>
            </div>
          )}

          {/* Surface tabs (apply to both modes) */}
          <div className="flex flex-wrap gap-1 border-t border-[#EFEFEF] pt-3">
            {PREVIEW_SURFACES.map((s) => {
              const active = s.id === surface
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSurface(s.id)}
                  className={[
                    'inline-flex items-center gap-1.5 border px-3 py-1.5 text-[12px] font-semibold transition-colors',
                    active
                      ? 'border-[#2D2D2D] bg-[#2D2D2D] text-white'
                      : 'border-[#E5E5E5] bg-white text-[#2D2D2D] hover:bg-[#F4F4F2]',
                  ].join(' ')}
                >
                  {s.label}
                </button>
              )
            })}
            <span className="ml-1 self-center text-[11px] text-[#888]">
              {PREVIEW_SURFACES.find((s) => s.id === surface)?.hint}
            </span>
          </div>
        </div>
      </Section>

      <Section title="Preview surface">
        <div className="border border-dashed border-[#CFCFCF] bg-[#FAFAF8] p-4">
          {mode === 'campaign' && previewCampaign ? (
            <>
              {surface === 'banner' && (
                <div className="flex justify-center overflow-auto">
                  <BannerPreview device={device} campaign={previewCampaign} />
                </div>
              )}
              {surface === 'sidebar' && (
                <div className="overflow-auto">
                  <SidebarPreview campaign={previewCampaign} />
                </div>
              )}
              {surface === 'bottombar' && (
                <div className="flex justify-center overflow-auto">
                  <BottomBarPreview device={device} campaign={previewCampaign} />
                </div>
              )}
              {surface === 'native' && (
                <div className="flex justify-center overflow-auto">
                  <NativeCardPreview device={device} campaign={previewCampaign} />
                </div>
              )}
              {surface === 'popup' && (
                <div className="space-y-3">
                  <p className="text-[12px] text-[#666]">
                    The popup mounts as a centered modal at runtime. Click below to launch a true
                    in-page popup with your creative — close with the × or Esc.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button intent="primary" size="sm" onClick={() => setPopupOpen(true)}>
                      Launch popup preview
                    </Button>
                    <span className="text-[11px] text-[#888]">Inline preview below for layout review.</span>
                  </div>
                  <div className="overflow-auto pt-2">
                    <PopupPreview campaign={previewCampaign} />
                  </div>
                </div>
              )}
            </>
          ) : mode === 'campaign' && !previewCampaign ? (
            <EmptyState
              title="No campaign selected"
              description="Pick a campaign from the dropdown above to preview it."
            />
          ) : null}

          {mode === 'live' && (
            <>
              {surface === 'banner' && (
                <div key={slotKey} className="mx-auto flex w-full max-w-[970px] justify-center">
                  <BannerAd consumerId={consumerId} />
                </div>
              )}
              {surface === 'sidebar' && (
                <div key={slotKey} className="grid gap-4 lg:grid-cols-[1fr_320px]">
                  <div className="border border-[#E5E5E5] bg-white p-4 text-[12px] text-[#666]">
                    <p className="font-semibold text-[#2D2D2D]">Main content placeholder</p>
                    <p className="mt-1">
                      This column simulates the publisher article body. The sidebar unit on the right
                      is the live SDK render.
                    </p>
                  </div>
                  <div className="flex justify-center">
                    <SidebarAd consumerId={consumerId} />
                  </div>
                </div>
              )}
              {surface === 'popup' && (
                <div className="space-y-3">
                  <p className="text-[12px] text-[#666]">
                    Note: the live popup is subject to the SDK&apos;s session frequency cap and may not
                    show again immediately. Use the My-campaign tab for a deterministic preview.
                  </p>
                  <Button intent="primary" size="sm" onClick={() => setLivePopupKey((n) => n + 1)}>
                    Show live popup
                  </Button>
                  <PopupAd key={livePopupKey} consumerId={consumerId} delay={500} />
                </div>
              )}
              {(surface === 'bottombar' || surface === 'native') && (
                <EmptyState
                  title="Not available in live mode"
                  description="Bottom bar and Native surfaces don't have a standalone SDK component yet. Use My-campaign mode to preview them."
                />
              )}
            </>
          )}
        </div>
      </Section>

      {/* True popup overlay launched from the My-campaign tab. Reuses the
       *  full CampaignPreviewModal with the chosen campaign so the advertiser
       *  can review every surface from the same launcher. */}
      {popupOpen && previewCampaign && (
        <CampaignPreviewModal
          campaign={previewCampaign}
          onClose={() => setPopupOpen(false)}
        />
      )}
    </div>
  )
}

// ─── Section: Billing ────────────────────────────────────────────────────

function BillingSection({
  campaigns,
  balance,
  onFund,
}: {
  campaigns: Campaign[]
  balance: number | null
  onFund: (c: Campaign) => void
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric
          accent="hero"
          label="G$ balance"
          value={balance != null ? formatNumber(Number(balance.toFixed(2))) : '—'}
          loading={balance == null}
        />
        <Metric label="Total spent" value={formatNumber(Number(campaigns.reduce((s, c) => s + c.spent, 0).toFixed(2)))} />
        <Metric label="Funded campaigns" value={String(campaigns.filter((c) => c.onChainId != null).length)} />
      </div>

      <Section title="Fund campaigns" description="Top up individual campaigns on-chain to extend their reach.">
        {campaigns.length === 0 ? (
          <EmptyState
            title="No campaigns to fund"
            description="Create a campaign first."
            action={
              <Link
                href="/create-campaign"
                className="inline-flex items-center gap-1.5 border border-[#2D2D2D] bg-[#2D2D2D] px-3 py-2 text-[12px] font-semibold text-white"
              >
                Create campaign
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-[#EFEFEF] border border-[#E5E5E5]">
            {campaigns.map((c) => {
              const usedPct = c.budget > 0 ? Math.min(100, (c.spent / c.budget) * 100) : 0
              const budgetExhausted = c.budget > 0 && c.spent >= c.budget
              const { label: statusLabel, tone } = getCampaignStatusDisplay(c)
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 bg-white px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-[13px] font-semibold text-[#2D2D2D]">{c.name}</p>
                      <StatusBadge tone={tone}>{statusLabel}</StatusBadge>
                      {budgetExhausted && <StatusBadge tone="warning">Out of budget</StatusBadge>}
                    </div>
                    <p className="mt-0.5 text-[11px] text-[#888]">
                      Budget {formatNumber(c.budget)} · Spent {formatNumber(c.spent)} ({formatPct(usedPct)})
                    </p>
                    {budgetExhausted && (
                      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#8A1F1F]">
                        Viewers earning SovPoints instead of tokens — fund to resume on-chain payouts.
                      </p>
                    )}
                    <div className="mt-1 h-1 w-full max-w-xs bg-[#EFEFEF]">
                      <div className="h-full bg-[#2D2D2D]" style={{ width: `${usedPct}%` }} />
                    </div>
                  </div>
                  {c.onChainId != null ? (
                    <Button intent="primary" size="sm" onClick={() => onFund(c)}>Fund</Button>
                  ) : (
                    <span className="text-[11px] italic text-[#999]">No on-chain ID</span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Section>
    </div>
  )
}

// ─── Section: Settings ───────────────────────────────────────────────────

function SettingsSection({
  address,
  campaignCount,
  activeCount,
}: {
  address: string
  campaignCount: number
  activeCount: number
}) {
  return (
    <div className="space-y-5">
      <Section title="Connected wallet">
        <div className="space-y-3">
          <p className="break-all rounded-none border border-[#E5E5E5] bg-[#FAFAF8] px-3 py-2 font-mono text-[12px] text-[#2D2D2D]">
            {address || 'Not connected'}
          </p>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="success">Wallet connected</StatusBadge>
            <StatusBadge tone={campaignCount > 0 ? 'success' : 'neutral'}>
              {campaignCount} campaign{campaignCount === 1 ? '' : 's'}
            </StatusBadge>
            <StatusBadge tone={activeCount > 0 ? 'success' : 'neutral'}>{activeCount} active</StatusBadge>
          </div>
          <div className="pt-1"><WalletButton /></div>
        </div>
      </Section>

      <Section title="Shortcuts">
        <div className="flex flex-wrap gap-2">
          <Link
            href="/create-campaign"
            className="inline-flex items-center gap-1.5 border border-[#2D2D2D] bg-[#2D2D2D] px-3 py-2 text-[12px] font-semibold text-white"
          >
            New campaign
          </Link>
          <Link href="/advertiser/ctas" className="inline-flex items-center gap-1.5 border border-[#2D2D2D] bg-white px-3 py-2 text-[12px] font-semibold text-[#2D2D2D] hover:bg-[#F4F4F2]">
            Manage CTAs
          </Link>
          <Link href="/publisher" className="inline-flex items-center gap-1.5 border border-[#2D2D2D] bg-white px-3 py-2 text-[12px] font-semibold text-[#2D2D2D] hover:bg-[#F4F4F2]">
            Publisher dashboard
          </Link>
        </div>
      </Section>
    </div>
  )
}

// ─── Misc ────────────────────────────────────────────────────────────────

function BalancePill({ balance }: { balance: number | null }) {
  return (
    <div className="hidden items-center gap-2 border border-[#E5E5E5] bg-white px-3 py-1.5 text-[12px] sm:inline-flex">
      <AdvertiserIcon name="wallet" className="h-3.5 w-3.5 text-[#666]" />
      <span className="font-semibold tabular-nums text-[#2D2D2D]">
        {balance != null ? formatNumber(Number(balance.toFixed(2))) : '—'}
      </span>
      <span className="text-[#888]">G$</span>
    </div>
  )
}

function ExtendDialog({
  campaign,
  days,
  onDays,
  isExtending,
  onSubmit,
  onCancel,
}: {
  campaign: Campaign
  days: string
  onDays: (v: string) => void
  isExtending: boolean
  onSubmit: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-md bg-white border border-[#2D2D2D] shadow-[6px_6px_0_0_#2D2D2D]">
        <header className="border-b border-[#E5E5E5] px-5 py-3">
          <p className="text-[11px] font-semibold text-[#888]">Extend duration</p>
          <h3 className="truncate text-[15px] font-bold text-[#2D2D2D]">{campaign.name}</h3>
        </header>
        <div className="space-y-4 p-5">
          <Field label="Days to add" required>
            <TextInput
              type="number"
              min="1"
              value={days}
              onChange={(e) => onDays(e.target.value)}
              placeholder="14"
            />
          </Field>
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-[#E5E5E5] bg-[#FAFAF8] px-5 py-3">
          <Button intent="ghost" onClick={onCancel}>Cancel</Button>
          <Button intent="primary" disabled={isExtending || !days} onClick={onSubmit}>
            {isExtending ? 'Extending…' : 'Extend'}
          </Button>
        </footer>
      </div>
    </div>
  )
}
