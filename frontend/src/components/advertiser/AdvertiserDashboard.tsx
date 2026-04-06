'use client'
/* eslint-disable react/no-unescaped-entities */

import { useState, useEffect, useCallback, type ReactNode } from 'react'
import Link from 'next/link'
import { useAccount, useReadContract } from 'wagmi'
import { formatUnits } from 'viem'
import WalletButton from '@/components/WalletButton'
import { getTokenSymbol } from '@/lib/tokens'
import { useAds } from '@/hooks/useAds'
import { useStreamingAds } from '@/hooks/useStreamingAds'
import { GOODDOLLAR_ADDRESS, chainId } from '@/lib/chain-config'

const ERC20_BALANCE_ABI = [{
  name: 'balanceOf',
  type: 'function',
  stateMutability: 'view',
  inputs: [{ name: 'owner', type: 'address' }],
  outputs: [{ type: 'uint256' }],
}] as const
import TopUpModal from '@/components/TopUpModal'
import AdvertiserIcon from './AdvertiserIcon'
import AdvertiserSidebar from './AdvertiserSidebar'
import CampaignPreviewModal from './CampaignPreviewModal'
import { advertiserSidebarItems } from './advertiser-config'
import type { AdvertiserSectionId } from './advertiser-config'
import type { AdvertiserIconName } from './models'

// ─── Data Types ─────────────────────────────────────────────────────────────

interface Campaign {
  id: string
  name: string
  description: string
  bannerUrl: string
  targetUrl: string
  budget: number
  spent: number
  cpc: number
  active: boolean
  tokenAddress?: string
  onChainId?: number
  paused?: boolean
  mediaType?: 'image' | 'video'
  tags?: string[]
  targetLocations?: string[]
  metadata?: Record<string, unknown>
  startDate?: string | null
  endDate?: string | null
  verificationStatus?: 'pending' | 'approved' | 'rejected'
}

interface CampaignStats {
  impressions: number
  clicks: number
  ctr: number
  totalSpent: number
}

interface DailyStatEntry {
  date: string
  impressions: number
  clicks: number
  revenue: number
}

interface GlobalStats {
  totalImpressions: number
  totalClicks: number
  avgCtr: number
  totalSpent: number
  activeCampaigns: number
}

// ─── Shared Components ───────────────────────────────────────────────────────

function DashboardCard({
  id,
  title,
  eyebrow,
  children,
  action,
}: {
  id?: string
  title: string
  eyebrow?: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <section id={id} className="bg-white p-5 scroll-mt-24">
      <div className="flex flex-col gap-3 border-b border-[#e5e5e5] pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {eyebrow && (
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#666666]">{eyebrow}</p>
          )}
          <h2 className="mt-1 text-[16px] font-black uppercase tracking-tight text-[#141414]">{title}</h2>
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function MetricCard({
  icon,
  label,
  value,
  accent,
  loading,
}: {
  icon: AdvertiserIconName
  label: string
  value: string
  accent?: 'primary' | 'success'
  loading?: boolean
}) {
  return (
    <div className="rounded-lg border border-[#e5e5e5] bg-white p-4 transition-shadow duration-100 hover:shadow-sm">
      <span
        className={[
          'flex h-9 w-9 items-center justify-center rounded-md',
          accent === 'success' ? 'bg-[#22c55e] text-white' : 'bg-black text-white',
        ].join(' ')}
      >
        <AdvertiserIcon name={icon} className="h-4 w-4" />
      </span>
      {loading ? (
        <div className="mt-4 h-7 w-16 animate-pulse rounded bg-[#e5e5e5]" />
      ) : (
        <p className="mt-4 text-[20px] font-black text-[#141414]">{value}</p>
      )}
      <p className="mt-1 text-[10px] font-black uppercase tracking-[0.2em] text-[#666666]">{label}</p>
    </div>
  )
}

function StatusPill({
  tone,
  children,
}: {
  tone: 'neutral' | 'success' | 'warning' | 'danger'
  children: ReactNode
}) {
  const toneClass = {
    neutral: 'border border-black bg-[#F5F3F0] text-[#141414]',
    success: 'border border-black bg-[#22c55e] text-white',
    warning: 'border border-black bg-yellow-400 text-black',
    danger: 'border border-black bg-[#ef4444] text-white',
  }[tone]
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${toneClass}`}
    >
      {children}
    </span>
  )
}

function formatDateLabel(value: string) {
  try {
    return new Intl.DateTimeFormat('en', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(value))
  } catch {
    return value
  }
}

const MIN_BUDGET_GD = 1 // no minimum enforced

// ─── Create Campaign Section ─────────────────────────────────────────────────

function CreateCampaignSection({
  address,
  onSuccess,
}: {
  address: string
  onSuccess: () => void
}) {
  const { createStreamingCampaign, isLoading: isCreating } = useStreamingAds()

  const { data: gdollarBalanceRaw } = useReadContract({
    address: GOODDOLLAR_ADDRESS as `0x${string}`,
    abi: ERC20_BALANCE_ABI,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
    chainId,
    query: { refetchInterval: 15_000 },
  })
  const gdollarBalance = gdollarBalanceRaw != null
    ? parseFloat(formatUnits(gdollarBalanceRaw as bigint, 18)).toFixed(2)
    : null

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [targetUrl, setTargetUrl] = useState('')
  const [bannerUrl, setBannerUrl] = useState('')
  const [tags, setTags] = useState('')
  const [locations, setLocations] = useState('')
  const [budget, setBudget] = useState('')
  const [durationDays, setDurationDays] = useState('30')
  const [cpc, setCpc] = useState('0.01')
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image')

  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const previewUrl = bannerUrl.startsWith('http') ? bannerUrl : ''
  const previewIsVideo = mediaType === 'video' || /\.(mp4|webm|ogv|mov)/i.test(bannerUrl)

  const handleUpload = async (file: File) => {
    setUploading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('image', file)
      const res = await fetch('/api/uploads/image', { method: 'POST', body: form })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Upload failed')
      }
      const d = await res.json()
      setBannerUrl(d.url)
      if (d.mediaType) setMediaType(d.mediaType)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = async () => {
    setError(null)

    // ── Form validation (all checks before any chain interaction) ──────
    if (!name.trim()) return setError('Campaign name is required.')
    if (!targetUrl.trim()) return setError('Target URL is required.')
    try { new URL(targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`) }
    catch { return setError('Target URL must be a valid URL (e.g. https://example.com).') }
    if (!bannerUrl.trim()) return setError('Creative URL is required.')
    if (!/^https?:\/\/.+/i.test(bannerUrl)) return setError('Creative must be a valid https:// URL.')
    const budgetNum = Number(budget)
    if (!budget || isNaN(budgetNum) || budgetNum <= 0) return setError('Budget must be greater than 0.')
    if (gdollarBalance !== null && budgetNum > Number(gdollarBalance))
      return setError(`Insufficient balance. You have ${Number(gdollarBalance).toLocaleString()} G$ but entered ${budgetNum.toLocaleString()} G$.`)
    const durationDaysNum = Number(durationDays)
    if (!durationDays || isNaN(durationDaysNum) || durationDaysNum < 1)
      return setError('Duration must be at least 1 day.')
    if (durationDaysNum > 365) return setError('Duration cannot exceed 365 days.')
    const cpcNum = Number(cpc)
    if (isNaN(cpcNum) || cpcNum < 0) return setError('CPC must be 0 or greater.')
    // ── All good — proceed ──────────────────────────────────────────────

    const durationSeconds = Math.floor(durationDaysNum) * 24 * 60 * 60

    const metadata = JSON.stringify({
      name: name.trim(),
      description: description.trim(),
      bannerUrl,
      targetUrl: targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`,
      cpc: cpcNum,
      mediaType,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      targetLocations: locations.split(',').map((l) => l.trim()).filter(Boolean),
    })

    try {
      const { hash, id: onChainId } = await createStreamingCampaign(budget, durationSeconds, metadata)

      const res = await fetch('/api/campaigns/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: address,
          transactionHash: hash,
          contractCampaignId: `chain-${onChainId}`,
          onChainId,
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + durationSeconds * 1000).toISOString(),
          campaignData: {
            name: name.trim(),
            description: description.trim(),
            bannerUrl,
            targetUrl: targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`,
            budget: String(budgetNum),
            tokenAddress: GOODDOLLAR_ADDRESS,
            cpc: String(cpcNum),
            mediaType,
            tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
            targetLocations: locations.split(',').map((l) => l.trim()).filter(Boolean),
          },
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Failed to save campaign')
      }

      setSuccess('Campaign created! Redirecting to your campaigns…')
      setTimeout(onSuccess, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Campaign creation failed')
    }
  }

  return (
    <DashboardCard id="create" title="New campaign" eyebrow="Create">
      <div className="grid gap-8 lg:grid-cols-[1fr_260px]">
        {/* Form column */}
        <div className="space-y-5">
          {/* Name + Target URL */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-1.5">
                Campaign Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Web3 Campaign"
                className="w-full border border-[#e5e5e5] rounded px-3 py-2.5 text-[13px] font-medium focus:outline-none focus:border-black bg-white transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-1.5">
                Target URL *
              </label>
              <input
                type="url"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://yourproject.com"
                className="w-full border border-[#e5e5e5] rounded px-3 py-2.5 text-[13px] font-medium focus:outline-none focus:border-black bg-white transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Brief description of your campaign"
              className="w-full border border-[#e5e5e5] rounded px-3 py-2.5 text-[13px] font-medium focus:outline-none focus:border-black bg-white resize-none transition-colors"
            />
          </div>

          {/* Creative */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-1.5">
              Creative URL (Image or Video)
            </label>
            <input
              type="url"
              value={bannerUrl}
              onChange={(e) => setBannerUrl(e.target.value)}
              placeholder="https://cdn.example.com/banner.png"
              className="w-full border border-[#e5e5e5] rounded px-3 py-2.5 text-[13px] font-medium focus:outline-none focus:border-black bg-white mb-2 transition-colors"
            />
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#999999] mb-1.5">
              — or upload a file —
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/ogg,video/quicktime"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f) }}
              className="block w-full text-[11px] text-[#666666]"
              disabled={uploading}
            />
            {uploading && (
              <p className="text-[10px] font-black uppercase tracking-wider text-[#999999] mt-1">Uploading…</p>
            )}
            <p className="text-[9px] text-[#aaaaaa] mt-1">JPG, PNG, WEBP, GIF up to 10 MB · MP4, WEBM, MOV up to 25 MB</p>
          </div>

          {/* Tags + Locations */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-1.5">
                Tags
              </label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="defi, web3, nft"
                className="w-full border border-[#e5e5e5] rounded px-3 py-2.5 text-[13px] font-medium focus:outline-none focus:border-black bg-white transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-1.5">
                Target Locations
              </label>
              <input
                type="text"
                value={locations}
                onChange={(e) => setLocations(e.target.value)}
                placeholder="US, EU, NG"
                className="w-full border border-[#e5e5e5] rounded px-3 py-2.5 text-[13px] font-medium focus:outline-none focus:border-black bg-white transition-colors"
              />
            </div>
          </div>

          {/* Budget + Duration + CPC */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-1.5">
                Budget (G$) *
                {gdollarBalance !== null && (
                  <span className="ml-2 normal-case tracking-normal font-medium text-[#888]">
                    — Balance:{' '}
                    <span className="text-[#141414] font-black">{Number(gdollarBalance).toLocaleString()} G$</span>
                  </span>
                )}
              </label>
              <input
                type="number"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                min={MIN_BUDGET_GD}
                step="1"
                placeholder={String(MIN_BUDGET_GD)}
                className="w-full border border-[#e5e5e5] rounded px-3 py-2.5 text-[13px] font-medium focus:outline-none focus:border-black bg-white transition-colors"
              />
              <p className="text-[9px] text-[#aaaaaa] mt-1">Any amount of G$ accepted</p>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-1.5">
                Duration (days) *
              </label>
              <input
                type="number"
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
                min="1"
                step="1"
                placeholder="30"
                className="w-full border border-[#e5e5e5] rounded px-3 py-2.5 text-[13px] font-medium focus:outline-none focus:border-black bg-white transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-1.5">
                CPC (G$ / click)
              </label>
              <input
                type="number"
                value={cpc}
                onChange={(e) => setCpc(e.target.value)}
                min="0"
                step="0.001"
                placeholder="0.002"
                className="w-full border border-[#e5e5e5] rounded px-3 py-2.5 text-[13px] font-medium focus:outline-none focus:border-black bg-white transition-colors"
              />
            </div>
          </div>

          {/* Payment token note */}
          <div className="flex items-center gap-2 bg-[#F5F3F0] rounded px-3 py-2.5">
            <span className="text-[13px]">💡</span>
            <p className="text-[11px] text-[#666666]">
              Paid in <span className="font-bold text-[#141414]">GoodDollar (G$)</span> on Celo.
            </p>
          </div>

          {/* Error / Success */}
          {error && (
            <div className="flex items-center gap-3 rounded bg-[#fef2f2] border border-[#fca5a5] px-3 py-2.5">
              <span className="flex-1 text-[12px] font-bold text-[#ef4444]">{error}</span>
              <button type="button" onClick={() => setError(null)} className="text-[11px] text-[#999999] hover:text-black">✕</button>
            </div>
          )}
          {success && (
            <div className="flex items-center gap-3 rounded bg-[#f0fdf4] border border-[#86efac] px-3 py-2.5">
              <span className="flex-1 text-[12px] font-bold text-[#22c55e]">{success}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isCreating || uploading || !!success}
            className="w-full bg-black text-white py-3 rounded text-[11px] font-black uppercase tracking-wider hover:bg-[#222222] disabled:opacity-50 transition-colors"
          >
            {isCreating ? 'Creating on-chain…' : 'Launch Campaign'}
          </button>
        </div>

        {/* Preview column */}
        <div className="hidden lg:block">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#999999] mb-3">
            Preview
          </p>
          <div className="rounded overflow-hidden bg-[#141414]" style={{ height: '160px' }}>
            {previewUrl ? (
              previewIsVideo ? (
                <video src={previewUrl} className="w-full h-full object-contain" muted playsInline />
              ) : (
                <img src={previewUrl} alt="Creative preview" className="w-full h-full object-contain" />
              )
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-[#555555]">
                <AdvertiserIcon name="campaign" className="h-8 w-8 mb-2" />
                <p className="text-[9px] font-black uppercase tracking-widest">No creative yet</p>
              </div>
            )}
          </div>

          {name && (
            <div className="mt-3 rounded bg-[#F5F3F0] px-3 py-2.5">
              <p className="text-[12px] font-bold text-[#141414] mb-0.5">{name}</p>
              {description && <p className="text-[10px] text-[#666666] line-clamp-2">{description}</p>}
              {budget && <p className="text-[10px] text-[#999999] mt-1">{Number(budget).toLocaleString()} G$ · {durationDays}d</p>}
            </div>
          )}
        </div>
      </div>
    </DashboardCard>
  )
}

// ─── Edit Campaign Modal ─────────────────────────────────────────────────────

function EditCampaignModal({
  campaign,
  onClose,
  onSaved,
  ownerAddress,
}: {
  campaign: Campaign
  onClose: () => void
  onSaved: () => void
  ownerAddress?: string
}) {
  const [name, setName] = useState(campaign.name)
  const [description, setDescription] = useState(campaign.description)
  const [targetUrl, setTargetUrl] = useState(campaign.targetUrl)
  const [bannerUrl, setBannerUrl] = useState(campaign.bannerUrl)
  const [tags, setTags] = useState((campaign.tags ?? []).join(', '))
  const [targetLocations, setTargetLocations] = useState((campaign.targetLocations ?? []).join(', '))
  const [cpc, setCpc] = useState(String(campaign.cpc))
  const [uploading, setUploading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // live preview: show banner whenever it looks like a valid URL
  const previewUrl = bannerUrl.startsWith('http') ? bannerUrl : ''
  const previewIsVideo = campaign.mediaType === 'video' ||
    /\.(mp4|webm|ogv|mov)/i.test(bannerUrl)

  const handleUpload = async (file: File) => {
    setUploading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('image', file)
      const res = await fetch('/api/uploads/image', { method: 'POST', body: form })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Upload failed')
      }
      const data = await res.json()
      setBannerUrl(data.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    if (!ownerAddress) {
      setError('Connect your wallet to save changes.')
      return
    }
    if (!name.trim() || !targetUrl.trim()) {
      setError('Name and Target URL are required.')
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/campaigns/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: ownerAddress,
          id: campaign.id,
          updates: {
            name,
            description,
            targetUrl,
            bannerUrl,
            cpc: Number(cpc),
            tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
            targetLocations: targetLocations.split(',').map((l) => l.trim()).filter(Boolean),
          },
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to update campaign')
      }
      setSuccess('Campaign updated! Creative changes will be re-reviewed by moderation.')
      setTimeout(() => {
        onSaved()
        onClose()
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white border-2 border-black w-full max-w-lg max-h-[90vh] overflow-auto z-10 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b-2 border-black p-4 flex justify-between items-center">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#666666]">Edit Campaign</p>
            <h3 className="text-[14px] font-black uppercase tracking-tight text-[#141414]">{campaign.name}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider hover:bg-[#F5F3F0] px-2 py-1 border border-black"
          >
            <AdvertiserIcon name="delete" className="h-3 w-3" />
            Close
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Live creative preview */}
          {previewUrl && (
            <div className="border-2 border-black bg-black overflow-hidden" style={{ height: '100px' }}>
              {previewIsVideo ? (
                <video src={previewUrl} className="w-full h-full object-contain" muted playsInline />
              ) : (
                <img src={previewUrl} alt="Creative preview" className="w-full h-full object-contain" />
              )}
            </div>
          )}

          <div>
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-1">
              Campaign Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border-2 border-black px-3 py-2 text-[13px] font-medium focus:outline-none focus:border-black bg-white"
              placeholder="My Campaign"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full border-2 border-black px-3 py-2 text-[13px] font-medium focus:outline-none focus:border-black bg-white resize-none"
              placeholder="Brief description of your campaign"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-1">
              Target URL *
            </label>
            <input
              type="url"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              className="w-full border-2 border-black px-3 py-2 text-[13px] font-medium focus:outline-none focus:border-black bg-white"
              placeholder="https://yoursite.com"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-1">
              Creative (Image or Video)
            </label>
            <input
              type="url"
              value={bannerUrl}
              onChange={(e) => setBannerUrl(e.target.value)}
              className="w-full border-2 border-black px-3 py-2 text-[13px] font-medium focus:outline-none focus:border-black bg-white mb-2"
              placeholder="https://cdn.example.com/banner.png"
            />
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-1">
              — or upload a new file —
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/ogg,video/quicktime"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f) }}
              className="block w-full text-[11px]"
              disabled={uploading}
            />
            {uploading && (
              <p className="text-[10px] font-black uppercase tracking-wider text-[#666666] mt-1">Uploading…</p>
            )}
            <p className="text-[9px] text-[#999999] mt-1">Images: JPG, PNG, WEBP, GIF (max 10 MB). Videos: MP4, WEBM, MOV (max 25 MB, 30 s).</p>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-1">
              CPC (Cost per Click)
            </label>
            <input
              type="number"
              value={cpc}
              onChange={(e) => setCpc(e.target.value)}
              min="0"
              step="0.001"
              className="w-full border-2 border-black px-3 py-2 text-[13px] font-medium focus:outline-none focus:border-black bg-white"
              placeholder="0.002"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-1">
              Tags (comma-separated)
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full border-2 border-black px-3 py-2 text-[13px] font-medium focus:outline-none focus:border-black bg-white"
              placeholder="defi, web3, nft"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-1">
              Target Locations (comma-separated)
            </label>
            <input
              type="text"
              value={targetLocations}
              onChange={(e) => setTargetLocations(e.target.value)}
              className="w-full border-2 border-black px-3 py-2 text-[13px] font-medium focus:outline-none focus:border-black bg-white"
              placeholder="US, EU, NG"
            />
          </div>

          {error && (
            <div className="flex items-center gap-3 border-2 border-black bg-[#fef2f2] p-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
              <span className="text-[12px] font-black uppercase text-[#ef4444]">{error}</span>
            </div>
          )}
          {success && (
            <div className="flex items-center gap-3 border-2 border-black bg-[#f0fdf4] p-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
              <span className="text-[12px] font-black uppercase text-[#22c55e]">{success}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={isSubmitting || uploading}
            className="w-full bg-black text-white py-3 text-[11px] font-black uppercase tracking-wider hover:bg-[#222222] disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Campaign Card ───────────────────────────────────────────────────────────

function CampaignCard({
  campaign,
  onPreview,
  onEdit,
  onFund,
  onTogglePause,
  onExtend,
  onViewAnalytics,
  isProcessing,
}: {
  campaign: Campaign
  onPreview: (c: Campaign) => void
  onEdit: (c: Campaign) => void
  onFund: (c: Campaign) => void
  onTogglePause: (c: Campaign) => void
  onExtend: (c: Campaign) => void
  onViewAnalytics: (c: Campaign) => void
  isProcessing: boolean
}) {
  const tokenSymbol = getTokenSymbol(campaign.tokenAddress)
  const budgetUsedPct =
    campaign.budget > 0 ? Math.min(100, (campaign.spent / campaign.budget) * 100) : 0

  const statusTone: 'success' | 'warning' | 'danger' | 'neutral' = campaign.active && !campaign.paused
    ? 'success'
    : campaign.paused
    ? 'warning'
    : 'danger'
  const statusLabel = campaign.active
    ? campaign.paused
      ? 'Paused'
      : 'Active'
    : 'Inactive'

  const verificationTone: 'success' | 'warning' | 'danger' | 'neutral' =
    campaign.verificationStatus === 'approved'
      ? 'success'
      : campaign.verificationStatus === 'rejected'
      ? 'danger'
      : 'warning'

  return (
    <div className="border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-0.5 hover:translate-y-0.5 transition-all">
      {/* Banner preview strip */}
      <div className="border-b-2 border-black overflow-hidden bg-black" style={{ height: '120px' }}>
        {campaign.mediaType === 'video' ? (
          <video
            src={campaign.bannerUrl}
            className="w-full h-full object-cover opacity-80"
            muted
            playsInline
          />
        ) : campaign.bannerUrl ? (
          <img
            src={campaign.bannerUrl}
            alt={campaign.name}
            className="w-full h-full object-cover opacity-90"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <AdvertiserIcon name="campaign" className="h-12 w-12 text-[#333333]" />
          </div>
        )}
      </div>

      <div className="p-4">
        {/* Title row */}
        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-black text-[#141414] truncate">{campaign.name}</p>
            <p className="text-[11px] text-[#666666] mt-0.5 line-clamp-1">{campaign.description}</p>
          </div>
          <div className="flex flex-wrap gap-1.5 flex-shrink-0">
            <StatusPill tone={statusTone}>{statusLabel}</StatusPill>
            {campaign.verificationStatus && campaign.verificationStatus !== 'approved' && (
              <StatusPill tone={verificationTone}>{campaign.verificationStatus}</StatusPill>
            )}
          </div>
        </div>

        {/* Mini stats */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="border border-[#e5e5e5] bg-[#F5F3F0] p-2 text-center">
            <p className="text-[13px] font-black text-[#141414]">
              {campaign.budget.toLocaleString()}
            </p>
            <p className="text-[9px] font-black uppercase tracking-widest text-[#666666]">
              {tokenSymbol} Budget
            </p>
          </div>
          <div className="border border-[#e5e5e5] bg-[#F5F3F0] p-2 text-center">
            <p className="text-[13px] font-black text-[#141414]">
              {campaign.spent.toLocaleString()}
            </p>
            <p className="text-[9px] font-black uppercase tracking-widest text-[#666666]">
              {tokenSymbol} Spent
            </p>
          </div>
          <div className="border border-[#e5e5e5] bg-[#F5F3F0] p-2 text-center">
            <p className="text-[13px] font-black text-[#141414]">{budgetUsedPct.toFixed(1)}%</p>
            <p className="text-[9px] font-black uppercase tracking-widest text-[#666666]">Used</p>
          </div>
        </div>

        {/* Budget progress bar */}
        <div className="mb-4">
          <div className="h-1.5 w-full bg-[#e5e5e5] border border-[#000000]">
            <div
              className="h-full bg-black transition-all"
              style={{ width: `${budgetUsedPct}%` }}
            />
          </div>
        </div>

        {/* Meta info */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[#666666] mb-4">
          <span>CPC: {campaign.cpc} {tokenSymbol}</span>
          <span>Media: {campaign.mediaType === 'video' ? 'Video' : 'Image'}</span>
          {campaign.onChainId != null && <span>ID: {campaign.onChainId}</span>}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onPreview(campaign)}
            className="flex items-center gap-1.5 border-2 border-black bg-[#F5F3F0] px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider hover:bg-[#e8e6e3] transition-colors"
          >
            <AdvertiserIcon name="preview" className="h-3 w-3" />
            Preview
          </button>
          <button
            type="button"
            onClick={() => onViewAnalytics(campaign)}
            className="flex items-center gap-1.5 border-2 border-black bg-[#F5F3F0] px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider hover:bg-[#e8e6e3] transition-colors"
          >
            <AdvertiserIcon name="analytics" className="h-3 w-3" />
            Stats
          </button>
          {(campaign.onChainId != null) && (
            <>
              <button
                type="button"
                onClick={() => onFund(campaign)}
                className="flex items-center gap-1.5 border-2 border-black bg-black text-white px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider hover:bg-[#222222] transition-colors"
              >
                <AdvertiserIcon name="wallet" className="h-3 w-3" />
                Fund
              </button>
              <button
                type="button"
                onClick={() => onTogglePause(campaign)}
                disabled={isProcessing}
                className={[
                  'flex items-center gap-1.5 border-2 border-black px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider transition-colors disabled:opacity-50',
                  campaign.paused
                    ? 'bg-[#22c55e] text-white hover:bg-[#16a34a]'
                    : 'bg-yellow-400 text-black hover:bg-yellow-300',
                ].join(' ')}
              >
                <AdvertiserIcon name="activate" className="h-3 w-3" />
                {campaign.paused ? 'Resume' : 'Pause'}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => onEdit(campaign)}
            className="flex items-center gap-1.5 border-2 border-black bg-[#F5F3F0] px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider hover:bg-[#e8e6e3] transition-colors"
          >
            <AdvertiserIcon name="settings" className="h-3 w-3" />
            Edit
          </button>
          {(campaign.onChainId != null) && (
            <button
              type="button"
              onClick={() => onExtend(campaign)}
              className="flex items-center gap-1.5 border-2 border-black bg-[#F5F3F0] px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider hover:bg-[#e8e6e3] transition-colors"
            >
              <AdvertiserIcon name="rotate" className="h-3 w-3" />
              Extend
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────

export default function AdvertiserDashboard() {
  const { address, isConnected } = useAccount()
  const { toggleCampaignPause, extendCampaignDuration, isLoading: isContractLoading } = useAds()

  const [activeSection, setActiveSection] = useState<AdvertiserSectionId>('dashboard')

  // Campaigns
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(false)
  const [campaignsError, setCampaignsError] = useState<string | null>(null)

  // Analytics
  const [analyticsCampaign, setAnalyticsCampaign] = useState<Campaign | null>(null)
  const [campaignStats, setCampaignStats] = useState<CampaignStats>({
    impressions: 0,
    clicks: 0,
    ctr: 0,
    totalSpent: 0,
  })
  const [dailyStats, setDailyStats] = useState<DailyStatEntry[]>([])
  const [statsDays, setStatsDays] = useState<'7' | '30' | '90' | 'all'>('30')
  const [isStatsLoading, setIsStatsLoading] = useState(false)
  const [statsError, setStatsError] = useState<string | null>(null)

  // Global aggregated stats for dashboard overview
  const [globalStats, setGlobalStats] = useState<GlobalStats>({
    totalImpressions: 0,
    totalClicks: 0,
    avgCtr: 0,
    totalSpent: 0,
    activeCampaigns: 0,
  })

  // Modals & interactions
  const [previewCampaign, setPreviewCampaign] = useState<Campaign | null>(null)
  const [editCampaign, setEditCampaign] = useState<Campaign | null>(null)
  const [topUpCampaign, setTopUpCampaign] = useState<Campaign | null>(null)
  const [extendCampaign, setExtendCampaign] = useState<Campaign | null>(null)
  const [extendAmount, setExtendAmount] = useState('')
  const [isExtending, setIsExtending] = useState(false)

  const [isProcessing, setIsProcessing] = useState(false)
  const [msgError, setMsgError] = useState<string | null>(null)
  const [msgSuccess, setMsgSuccess] = useState<string | null>(null)

  // Campaign search
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'inactive'>('all')

  // ── Load Campaigns ────────────────────────────────────────────────────────

  const loadCampaigns = useCallback(async (walletAddress: string) => {
    setIsLoadingCampaigns(true)
    setCampaignsError(null)
    try {
      const res = await fetch(`/api/campaigns/list?wallet=${walletAddress}`)
      if (!res.ok) throw new Error('Failed to load campaigns')
      const data = await res.json()
      const list = data.campaigns as Campaign[]
      setCampaigns(list)
      // compute basic global stats from campaign list
      const active = list.filter((c) => c.active && !c.paused).length
      const totalSpent = list.reduce((s, c) => s + c.spent, 0)
      setGlobalStats((prev) => ({ ...prev, activeCampaigns: active, totalSpent }))
      // fetch aggregate impressions across all campaigns
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
      setCampaignsError(err instanceof Error ? err.message : 'Failed to load campaigns')
    } finally {
      setIsLoadingCampaigns(false)
    }
  }, [])

  useEffect(() => {
    if (isConnected && address) {
      loadCampaigns(address)
    }
  }, [isConnected, address, loadCampaigns])

  // ── Load Campaign Analytics ───────────────────────────────────────────────

  const loadCampaignStats = useCallback(async (campaignId: string, days: string) => {
    setIsStatsLoading(true)
    setStatsError(null)
    try {
      const daysParam = days === 'all' ? '365' : days
      const res = await fetch(`/api/analytics?campaignId=${campaignId}&days=${daysParam}`)
      if (!res.ok) throw new Error('Failed to load analytics')
      const data = await res.json()
      setCampaignStats({
        impressions: data.impressions ?? 0,
        clicks: data.clicks ?? 0,
        ctr: data.ctr ?? 0,
        totalSpent: data.totalRevenue ?? 0,
      })
      setDailyStats(data.daily ?? [])
      // update global impressions/clicks
      setGlobalStats((prev) => ({
        ...prev,
        totalImpressions: data.impressions ?? 0,
        totalClicks: data.clicks ?? 0,
        avgCtr: data.ctr ?? 0,
      }))
    } catch (err) {
      setStatsError(err instanceof Error ? err.message : 'Analytics load failed')
    } finally {
      setIsStatsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (analyticsCampaign) {
      loadCampaignStats(analyticsCampaign.id, statsDays)
    }
  }, [analyticsCampaign, statsDays, loadCampaignStats])

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleViewAnalytics = (campaign: Campaign) => {
    setAnalyticsCampaign(campaign)
    setActiveSection('analytics')
  }

  const handleTogglePause = async (campaign: Campaign) => {
    if (campaign.onChainId == null) return
    setIsProcessing(true)
    setMsgError(null)
    setMsgSuccess(null)
    try {
      await toggleCampaignPause(Number(campaign.onChainId))
      setMsgSuccess(`Campaign ${campaign.paused ? 'resumed' : 'paused'} successfully!`)
      if (address) loadCampaigns(address)
    } catch (err) {
      setMsgError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleExtend = async () => {
    if (!extendCampaign || !extendAmount || extendCampaign.onChainId == null) return
    setIsExtending(true)
    setMsgError(null)
    setMsgSuccess(null)
    try {
      const additionalSeconds = Number(extendAmount) * 24 * 60 * 60
      await extendCampaignDuration(Number(extendCampaign.onChainId), additionalSeconds)
      setMsgSuccess('Campaign duration extended!')
      setExtendCampaign(null)
      setExtendAmount('')
      if (address) loadCampaigns(address)
    } catch (err) {
      setMsgError(err instanceof Error ? err.message : 'Extension failed')
    } finally {
      setIsExtending(false)
    }
  }

  // ── Filtered campaigns ────────────────────────────────────────────────────

  const filteredCampaigns = campaigns.filter((c) => {
    const matchSearch =
      !searchQuery ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.description.toLowerCase().includes(searchQuery.toLowerCase())
    const matchStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && c.active && !c.paused) ||
      (statusFilter === 'paused' && c.paused) ||
      (statusFilter === 'inactive' && !c.active)
    return matchSearch && matchStatus
  })

  // ── Not Connected State ───────────────────────────────────────────────────

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[#F5F3F0] flex items-center justify-center p-6">
        <div className="max-w-md w-full border-2 border-black bg-white p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] text-center">
          <div className="flex h-14 w-14 items-center justify-center bg-black mx-auto mb-5">
            <AdvertiserIcon name="campaign" className="h-7 w-7 text-white" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#666666] mb-2">
            Advertiser Workspace
          </p>
          <h1 className="text-[22px] font-black uppercase tracking-tight text-[#141414] mb-2">
            Launch campaigns that convert.
          </h1>
          <p className="text-[13px] text-[#666666] leading-5 mb-6">
            Connect your wallet to manage campaigns, track impressions, and reach real human
            audiences across the publisher network.
          </p>
          <WalletButton />
        </div>
      </div>
    )
  }

  // ── Sections ──────────────────────────────────────────────────────────────

  const renderDashboard = () => (
    <DashboardCard
      id="dashboard"
      title="Advertiser control center"
      eyebrow="Overview"
    >
      {/* Quick metric cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon="campaign" label="Total Campaigns" value={String(campaigns.length)} />
        <MetricCard icon="activate" label="Active Campaigns" value={String(globalStats.activeCampaigns)} accent="success" />
        <MetricCard icon="revenue" label="Total Spent" value={`${globalStats.totalSpent.toFixed(2)}`} />
        <MetricCard icon="impressions" label="Impressions" value={globalStats.totalImpressions > 0 ? globalStats.totalImpressions.toLocaleString() : '—'} />
      </div>

      {/* Quick actions */}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => setActiveSection('campaigns')}
          className="flex items-center gap-3 border-2 border-black bg-[#F5F3F0] p-4 hover:bg-[#e8e6e3] transition-colors text-left"
        >
          <div className="flex h-9 w-9 items-center justify-center bg-black flex-shrink-0">
            <AdvertiserIcon name="campaign" className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-wider text-[#141414]">Manage Campaigns</p>
            <p className="text-[10px] text-[#666666] mt-0.5">View, edit, pause, fund</p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('analytics')}
          className="flex items-center gap-3 border-2 border-black bg-[#F5F3F0] p-4 hover:bg-[#e8e6e3] transition-colors text-left"
        >
          <div className="flex h-9 w-9 items-center justify-center bg-black flex-shrink-0">
            <AdvertiserIcon name="analytics" className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-wider text-[#141414]">Analytics</p>
            <p className="text-[10px] text-[#666666] mt-0.5">Impressions, clicks, CTR</p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('create')}
          className="flex items-center gap-3 border-2 border-black bg-black text-white p-4 hover:bg-[#222222] transition-colors text-left"
        >
          <div className="flex h-9 w-9 items-center justify-center border border-white flex-shrink-0">
            <AdvertiserIcon name="activate" className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-wider">New Campaign</p>
            <p className="text-[10px] text-[#cccccc] mt-0.5">Launch a new ad</p>
          </div>
        </button>
      </div>

      {/* Global feedback */}
      {msgError && (
        <div className="mt-4 flex items-center gap-3 border-2 border-black bg-[#fef2f2] p-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
          <span className="flex-1 text-[12px] font-black uppercase text-[#ef4444]">{msgError}</span>
          <button type="button" onClick={() => setMsgError(null)} className="text-[10px] font-black uppercase">✕</button>
        </div>
      )}
      {msgSuccess && (
        <div className="mt-4 flex items-center gap-3 border-2 border-black bg-[#f0fdf4] p-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
          <span className="flex-1 text-[12px] font-black uppercase text-[#22c55e]">{msgSuccess}</span>
          <button type="button" onClick={() => setMsgSuccess(null)} className="text-[10px] font-black uppercase">✕</button>
        </div>
      )}
    </DashboardCard>
  )

  const renderCampaigns = () => (
    <DashboardCard
      id="campaigns"
      title="Your campaigns"
      eyebrow="Campaigns"
      action={
        <button
          type="button"
          onClick={() => setActiveSection('create')}
          className="flex items-center gap-2 border-2 border-black bg-black text-white px-3 py-2 text-[10px] font-black uppercase tracking-wider hover:bg-[#222222] transition-colors"
        >
          <AdvertiserIcon name="activate" className="h-3 w-3" />
          New Campaign
        </button>
      }
    >
      {/* Search & filter bar */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search campaigns…"
            className="w-full border-2 border-black px-3 py-2 text-[12px] font-medium focus:outline-none bg-white"
          />
        </div>
        <div className="flex gap-1.5">
          {(['all', 'active', 'paused', 'inactive'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setStatusFilter(f)}
              className={[
                'border-2 border-black px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition-colors',
                statusFilter === f ? 'bg-black text-white' : 'bg-white text-[#141414] hover:bg-[#F5F3F0]',
              ].join(' ')}
            >
              {f}
            </button>
          ))}
        </div>
        {address && (
          <button
            type="button"
            onClick={() => loadCampaigns(address)}
            disabled={isLoadingCampaigns}
            className="border-2 border-black px-2.5 py-1 text-[10px] font-black uppercase tracking-wider bg-[#F5F3F0] hover:bg-[#e8e6e3] transition-colors disabled:opacity-50"
          >
            {isLoadingCampaigns ? 'Loading…' : 'Refresh'}
          </button>
        )}
      </div>

      {/* Error state */}
      {campaignsError && (
        <div className="mb-4 flex items-center gap-3 border-2 border-black bg-[#fef2f2] p-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
          <span className="flex-1 text-[12px] font-black uppercase text-[#ef4444]">{campaignsError}</span>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoadingCampaigns && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="border-2 border-black animate-pulse">
              <div className="h-[120px] bg-[#e5e5e5]" />
              <div className="p-4 space-y-3">
                <div className="h-4 bg-[#e5e5e5] rounded w-3/4" />
                <div className="h-3 bg-[#e5e5e5] rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoadingCampaigns && filteredCampaigns.length === 0 && (
        <div className="flex flex-col items-center justify-center border-2 border-black bg-[#F5F3F0] p-10 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-center">
          <div className="flex h-14 w-14 items-center justify-center bg-black mb-4">
            <AdvertiserIcon name="campaign" className="h-7 w-7 text-white" />
          </div>
          <p className="text-[13px] font-black uppercase tracking-wider text-[#141414] mb-2">
            {searchQuery || statusFilter !== 'all' ? 'No matching campaigns' : 'No campaigns yet'}
          </p>
          <p className="text-[12px] text-[#666666] mb-5 max-w-sm">
            {searchQuery || statusFilter !== 'all'
              ? 'Try adjusting your search or filter.'
              : 'Create your first campaign to start getting verified ad impressions across our publisher network.'}
          </p>
          {(!searchQuery && statusFilter === 'all') && (
            <button
              type="button"
              onClick={() => setActiveSection('create')}
              className="border-2 border-black bg-black text-white px-5 py-2.5 text-[11px] font-black uppercase tracking-wider hover:bg-[#222222] transition-colors"
            >
              Create First Campaign
            </button>
          )}
        </div>
      )}

      {/* Campaign grid */}
      {!isLoadingCampaigns && filteredCampaigns.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filteredCampaigns.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              onPreview={setPreviewCampaign}
              onEdit={setEditCampaign}
              onFund={setTopUpCampaign}
              onTogglePause={handleTogglePause}
              onExtend={setExtendCampaign}
              onViewAnalytics={handleViewAnalytics}
              isProcessing={isProcessing || isContractLoading}
            />
          ))}
        </div>
      )}

      {/* Extend duration panel */}
      {extendCampaign && (
        <div className="mt-5 border-2 border-black bg-[#F5F3F0] p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-3">
            Extend duration — {extendCampaign.name}
          </p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={extendAmount}
              onChange={(e) => setExtendAmount(e.target.value)}
              placeholder="Days to extend"
              min="1"
              className="border-2 border-black px-3 py-2 text-[12px] font-medium focus:outline-none bg-white w-40"
            />
            <button
              type="button"
              onClick={handleExtend}
              disabled={isExtending || !extendAmount}
              className="border-2 border-black bg-black text-white px-4 py-2 text-[10px] font-black uppercase tracking-wider hover:bg-[#222222] transition-colors disabled:opacity-50"
            >
              {isExtending ? 'Extending…' : 'Extend'}
            </button>
            <button
              type="button"
              onClick={() => { setExtendCampaign(null); setExtendAmount('') }}
              className="border-2 border-black bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wider hover:bg-[#F5F3F0] transition-colors"
            >
              Cancel
            </button>
          </div>
          {msgError && (
            <p className="mt-2 text-[11px] font-black uppercase text-[#ef4444] border-l-2 border-[#ef4444] pl-2">{msgError}</p>
          )}
          {msgSuccess && (
            <p className="mt-2 text-[11px] font-black uppercase text-[#22c55e] border-l-2 border-[#22c55e] pl-2">{msgSuccess}</p>
          )}
        </div>
      )}
    </DashboardCard>
  )

  const renderAnalytics = () => (
    <DashboardCard
      id="analytics"
      title="Performance snapshot"
      eyebrow="Analytics"
      action={
        <div className="flex flex-wrap items-center gap-2">
          {analyticsCampaign && (
            <span className="text-[10px] font-black uppercase tracking-wider text-[#666666] border border-[#e5e5e5] px-2 py-1">
              {analyticsCampaign.name}
            </span>
          )}
          {(['7', '30', '90', 'all'] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setStatsDays(d)}
              className={[
                'border-2 border-black px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition-colors',
                statsDays === d ? 'bg-black text-white' : 'bg-white text-[#141414] hover:bg-[#F5F3F0]',
              ].join(' ')}
            >
              {d === 'all' ? 'All time' : `${d}d`}
            </button>
          ))}
          {analyticsCampaign && (
            <button
              type="button"
              onClick={() => loadCampaignStats(analyticsCampaign.id, statsDays)}
              disabled={isStatsLoading}
              className="border-2 border-black px-2.5 py-1 text-[10px] font-black uppercase tracking-wider bg-[#F5F3F0] hover:bg-[#e8e6e3] transition-colors disabled:opacity-50"
            >
              {isStatsLoading ? 'Loading…' : 'Refresh'}
            </button>
          )}
        </div>
      }
    >
      {/* Campaign picker */}
      {!analyticsCampaign && campaigns.length > 0 && (
        <div className="mb-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-3">
            Select a campaign to view analytics
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {campaigns.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setAnalyticsCampaign(c)}
                className="flex items-center gap-3 border-2 border-black bg-[#F5F3F0] p-3 hover:bg-[#e8e6e3] transition-colors text-left"
              >
                <AdvertiserIcon name="campaign" className="h-4 w-4 text-[#141414] flex-shrink-0" />
                <div>
                  <p className="text-[12px] font-black text-[#141414]">{c.name}</p>
                  <p className="text-[10px] text-[#666666]">
                    {c.active && !c.paused ? 'Active' : c.paused ? 'Paused' : 'Inactive'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {campaigns.length === 0 && (
        <div className="flex flex-col items-center justify-center border-2 border-black bg-[#F5F3F0] p-10 text-center">
          <p className="text-[12px] font-black uppercase text-[#141414] mb-2">No campaigns</p>
          <p className="text-[11px] text-[#666666]">Create a campaign first to see analytics.</p>
        </div>
      )}

      {analyticsCampaign && (
        <>
          {statsError && (
            <div className="mb-4 flex items-center gap-3 border-2 border-black bg-[#fef2f2] p-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
              <span className="flex-1 text-[12px] font-black uppercase text-[#ef4444]">{statsError}</span>
              <button
                type="button"
                onClick={() => loadCampaignStats(analyticsCampaign.id, statsDays)}
                className="border border-black px-2 py-0.5 text-[10px] font-black uppercase"
              >
                Retry
              </button>
            </div>
          )}

          {/* Ad creative preview */}
          <div className="mb-5 border-2 border-black overflow-hidden bg-black" style={{ maxHeight: '220px' }}>
            {analyticsCampaign.mediaType === 'video' ? (
              <video
                src={analyticsCampaign.bannerUrl}
                className="w-full h-[220px] object-contain"
                controls
                playsInline
                muted
              />
            ) : (
              <img
                src={analyticsCampaign.bannerUrl}
                alt={analyticsCampaign.description}
                className="w-full h-[220px] object-contain"
              />
            )}
          </div>

          {/* Metric cards */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-6">
            <MetricCard icon="impressions" label="Impressions" value={campaignStats.impressions.toLocaleString()} loading={isStatsLoading} />
            <MetricCard icon="clicks" label="Clicks" value={campaignStats.clicks.toLocaleString()} loading={isStatsLoading} />
            <MetricCard icon="ctr" label="CTR" value={`${campaignStats.ctr.toFixed(2)}%`} loading={isStatsLoading} />
            <MetricCard icon="revenue" label="Total Spent" value={campaignStats.totalSpent.toFixed(4)} accent="success" loading={isStatsLoading} />
          </div>

          {/* Daily breakdown table */}
          {isStatsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-9 animate-pulse rounded bg-[#e5e5e5]" />
              ))}
            </div>
          ) : dailyStats.length > 0 ? (
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-3">
                Daily Breakdown
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-black text-white">
                      <th className="px-3 py-2 text-left font-black uppercase tracking-wider">Date</th>
                      <th className="px-3 py-2 text-right font-black uppercase tracking-wider">Impr.</th>
                      <th className="px-3 py-2 text-right font-black uppercase tracking-wider">Clicks</th>
                      <th className="px-3 py-2 text-right font-black uppercase tracking-wider">CTR</th>
                      <th className="px-3 py-2 text-right font-black uppercase tracking-wider">Spent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyStats.map((row, idx) => {
                      const ctr = row.impressions > 0 ? ((row.clicks / row.impressions) * 100).toFixed(2) : '0.00'
                      return (
                        <tr
                          key={row.date}
                          className={idx % 2 === 0 ? 'bg-white' : 'bg-[#F5F3F0]'}
                        >
                          <td className="px-3 py-2 font-medium text-[#141414]">{formatDateLabel(row.date)}</td>
                          <td className="px-3 py-2 text-right text-[#141414]">{row.impressions.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right text-[#141414]">{row.clicks.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right text-[#141414]">{ctr}%</td>
                          <td className="px-3 py-2 text-right text-[#22c55e] font-bold">{row.revenue.toFixed(4)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            !statsError && (
              <div className="flex items-start gap-3 border-2 border-black bg-[#F5F3F0] p-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <span className="mt-0.5 text-[14px]">📡</span>
                <div>
                  <p className="text-[12px] font-black uppercase tracking-wide text-[#141414]">No activity yet</p>
                  <p className="mt-0.5 text-[12px] text-[#666666]">
                    This campaign has no recorded activity in the selected time range.
                  </p>
                </div>
              </div>
            )
          )}

          <div className="mt-4">
            <button
              type="button"
              onClick={() => setAnalyticsCampaign(null)}
              className="border-2 border-black px-3 py-1.5 text-[10px] font-black uppercase tracking-wider bg-[#F5F3F0] hover:bg-[#e8e6e3] transition-colors"
            >
              ← Select different campaign
            </button>
          </div>
        </>
      )}
    </DashboardCard>
  )

  const renderBilling = () => (
    <DashboardCard id="billing" title="Billing & funding" eyebrow="Billing">
      <div className="space-y-5">
        <div className="flex items-start gap-3 border-2 border-black bg-[#F5F3F0] p-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
          <span className="mt-0.5 text-[14px]">💡</span>
          <p className="text-[12px] text-[#666666]">
            Fund individual campaigns on-chain to increase their ad budget. Select a campaign below and
            specify the amount to top up.
          </p>
        </div>

        {campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center border-2 border-black bg-[#F5F3F0] p-10 text-center">
            <p className="text-[12px] font-black uppercase text-[#141414] mb-2">No campaigns to fund</p>
            <p className="text-[11px] text-[#666666] mb-4">Create a campaign first.</p>
            <button
              type="button"
              onClick={() => setActiveSection('create')}
              className="border-2 border-black bg-black text-white px-4 py-2 text-[10px] font-black uppercase tracking-wider hover:bg-[#222222] transition-colors"
            >
              Create Campaign
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#666666]">
              Select a campaign to fund
            </p>
            {campaigns.map((c) => {
              const tokenSymbol = getTokenSymbol(c.tokenAddress)
              const budgetUsedPct =
                c.budget > 0 ? Math.min(100, (c.spent / c.budget) * 100) : 0
              return (
                <div key={c.id} className="border-2 border-black bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div>
                      <p className="text-[13px] font-bold text-[#141414]">{c.name}</p>
                      <p className="text-[10px] text-[#666666]">
                        Budget: {c.budget} {tokenSymbol} — Spent: {c.spent} {tokenSymbol} ({budgetUsedPct.toFixed(1)}%)
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <StatusPill
                        tone={c.active && !c.paused ? 'success' : c.paused ? 'warning' : 'danger'}
                      >
                        {c.active ? (c.paused ? 'Paused' : 'Active') : 'Inactive'}
                      </StatusPill>
                    </div>
                  </div>
                  <div className="h-1.5 w-full bg-[#e5e5e5] border border-black mb-3">
                    <div className="h-full bg-black" style={{ width: `${budgetUsedPct}%` }} />
                  </div>
                  {c.onChainId != null ? (
                    <button
                      type="button"
                      onClick={() => setTopUpCampaign(c)}
                      className="flex items-center gap-2 border-2 border-black bg-black text-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider hover:bg-[#222222] transition-colors"
                    >
                      <AdvertiserIcon name="wallet" className="h-3 w-3" />
                      Fund this campaign
                    </button>
                  ) : (
                    <p className="text-[10px] text-[#999999] italic">No on-chain ID — cannot fund</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </DashboardCard>
  )

  const renderSettings = () => (
    <DashboardCard id="settings" title="Account settings" eyebrow="Settings">
      <div className="space-y-5">
        <div className="border-2 border-black bg-white p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-2">
            Connected Wallet
          </p>
          <p className="break-all text-[13px] font-bold text-[#141414]">{address}</p>
          <div className="mt-3">
            <WalletButton />
          </div>
        </div>

        <div className="border-2 border-black bg-white p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-3">
            Account Status
          </p>
          <div className="flex flex-wrap gap-2">
            <StatusPill tone="success">Wallet connected</StatusPill>
            <StatusPill tone={campaigns.length > 0 ? 'success' : 'neutral'}>
              {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}
            </StatusPill>
            <StatusPill tone={globalStats.activeCampaigns > 0 ? 'success' : 'neutral'}>
              {globalStats.activeCampaigns} active
            </StatusPill>
          </div>
        </div>

        <div className="border-2 border-black bg-[#F5F3F0] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-2">
            Quick links
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setActiveSection('create')}
              className="border-2 border-black bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider hover:bg-[#e8e6e3] transition-colors"
            >
              Create Campaign
            </button>
            <Link
              href="/publisher"
              className="border-2 border-black bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider hover:bg-[#e8e6e3] transition-colors"
            >
              Publisher Dashboard
            </Link>
          </div>
        </div>
      </div>
    </DashboardCard>
  )

  // ── Layout ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#F5F3F0]">
      {/* Body: sidebar + main content */}
      <div className="mx-auto max-w-screen-xl px-4 py-6">
        <div className="flex gap-6 lg:gap-8">
          {/* Sidebar */}
          <div className="hidden lg:block w-[220px] flex-shrink-0">
            <AdvertiserSidebar
              items={advertiserSidebarItems}
              activeSection={activeSection}
              onSelect={setActiveSection}
            />
          </div>

          {/* Mobile nav tabs */}
          <div className="lg:hidden w-full overflow-x-auto pb-1 mb-2">
            <div className="flex gap-1 min-w-max">
              {advertiserSidebarItems.map((item) => {
                if (!item.sectionId) return null
                const isActive = item.sectionId === activeSection
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => setActiveSection(item.sectionId!)}
                    className={[
                      'flex items-center gap-2 px-3 py-2 text-[10px] font-black uppercase tracking-wider border-2 border-black whitespace-nowrap transition-colors',
                      isActive ? 'bg-black text-white' : 'bg-white text-[#141414] hover:bg-[#F5F3F0]',
                    ].join(' ')}
                  >
                    <AdvertiserIcon name={item.icon} className="h-3 w-3" />
                    {item.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Main content */}
          <main className="flex-1 min-w-0 space-y-5">
            {activeSection === 'dashboard' && renderDashboard()}
            {activeSection === 'campaigns' && renderCampaigns()}
            {activeSection === 'create' && address && (
              <CreateCampaignSection
                address={address}
                onSuccess={() => {
                  loadCampaigns(address)
                  setActiveSection('campaigns')
                }}
              />
            )}
            {activeSection === 'analytics' && renderAnalytics()}
            {activeSection === 'billing' && renderBilling()}
            {activeSection === 'settings' && renderSettings()}
          </main>
        </div>
      </div>

      {/* Modals */}
      {previewCampaign && (
        <CampaignPreviewModal
          campaign={previewCampaign}
          onClose={() => setPreviewCampaign(null)}
        />
      )}

      {editCampaign && (
        <EditCampaignModal
          campaign={editCampaign}
          ownerAddress={address ?? undefined}
          onClose={() => setEditCampaign(null)}
          onSaved={() => { if (address) loadCampaigns(address) }}
        />
      )}

      <TopUpModal
        open={topUpCampaign !== null}
        campaign={topUpCampaign}
        onClose={() => setTopUpCampaign(null)}
        onSuccess={() => { if (address) loadCampaigns(address) }}
      />
    </div>
  )
}
