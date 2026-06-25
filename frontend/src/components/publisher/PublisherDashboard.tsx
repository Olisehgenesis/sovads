'use client'
/* eslint-disable react/no-unescaped-entities */

/**
 * Publisher workspace.
 *
 * Mirrors the advertiser shell: a quiet top bar (workspace eyebrow + title +
 * status pills + wallet), a left sidebar, and section-scoped main content.
 * All primitives come from `advertiser/ui` so the two workspaces read as one
 * product. Heavy in-page concerns (websites, integration, earnings, rewards,
 * settings) are pulled out into sub-section components further down this file.
 */

import { useEffect, useState } from 'react'
import { encodeFunctionData, parseUnits } from 'viem'
import { useAccount, useSignMessage, useWalletClient, useWriteContract } from 'wagmi'

import WalletButton from '@/components/WalletButton'
import { useAds } from '@/hooks/useAds'
import { buildPublisherAuthMessage } from '@/lib/publisher-auth'
import { TREASURY_ADDRESS, SUPPORTED_EXCHANGE_TOKENS, ERC20_TRANSFER_ABI } from '@/lib/treasury-tokens'
import { getTokenInfo } from '@/lib/tokens'
import { sovAdsStreamingAbi } from '@/contract/sovAdsStreamingAbi'

import AdvertiserIcon from '../advertiser/AdvertiserIcon'
import AdvertiserSidebar from '../advertiser/AdvertiserSidebar'
import CodeSnippet from '../CodeSnippet'
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
  TextInput,
  formatDate,
  formatNumber,
  formatPct,
} from '../advertiser/ui'
import PublisherPreviewModal from './PublisherPreviewModal'
import { publisherSidebarItems } from './publisher-config'
import type {
  CampaignVaultSummary,
  DailyStatEntry,
  ExchangeHistoryEntry,
  PublisherSectionId,
  PublisherSite,
  PublisherStats,
} from './models'

const GOOD_DOLLAR_ADDRESS = '0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A'

type RedeemMessage = { type: 'success' | 'error' | 'info'; text: string } | null
type SignedRedeemTx = {
  to: string
  args: { recipient: string; amount: string; claimRef: string; nonce: string; deadline: string; signature: string }
} | null
type SyncStatus = 'idle' | 'syncing' | 'registering' | 'ok' | 'error'

function truncateAddress(address: string) {
  if (!address) return ''
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

// Renders a relative age like "2m ago" / "5h ago" for the SDK heartbeat
// column. Capped at "1d+" — anything older than 24h is already shown as
// "Stale" so finer-grained labels would just clutter the table.
function formatHeartbeatAge(ageMs: number): string {
  if (!isFinite(ageMs) || ageMs < 0) return ''
  const seconds = Math.floor(ageMs / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return '1d+ ago'
}

function formatVaultAmount(value: bigint | string | number, tokenAddress: string) {
  try {
    const info = getTokenInfo(tokenAddress)
    const decimals = info?.decimals ?? 18
    const normalized = typeof value === 'bigint' ? value : BigInt(value)
    const base = BigInt(10) ** BigInt(decimals)
    const whole = normalized / base
    const fraction = normalized % base
    const fractionValue = fraction.toString().padStart(decimals, '0').slice(0, Math.min(4, decimals))
    return `${whole.toString()}.${fractionValue}`
  } catch {
    return String(value)
  }
}

function validateUrl(url: string): { valid: boolean; domain: string | null; error: string | null } {
  if (!url || url.trim() === '') {
    return { valid: false, domain: null, error: 'Website URL is required.' }
  }
  try {
    const trimmed = url.trim()
    const normalized = trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`
    const parsed = new URL(normalized)
    const domain = parsed.hostname.replace(/^www\./, '')
    if (domain === 'localhost' || domain === '127.0.0.1') return { valid: true, domain, error: null }
    const re = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/
    if (!re.test(domain)) return { valid: false, domain: null, error: 'Enter a valid domain like example.com.' }
    return { valid: true, domain, error: null }
  } catch {
    return { valid: false, domain: null, error: 'Enter a valid domain like example.com.' }
  }
}

// ─── Component ───────────────────────────────────────────────────────────

export default function PublisherDashboard() {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const { writeContractAsync: writeTransfer } = useWriteContract()
  const { data: walletClient } = useWalletClient()
  const { subscribePublisher, addSite, isPublisher, topUpCampaign, campaignCount, getCampaignVault } = useAds()

  // ── State ────────────────────────────────────────────────────────────────
  const [stats, setStats] = useState<PublisherStats>({ impressions: 0, clicks: 0, ctr: 0, totalRevenue: 0 })
  const [wallet, setWallet] = useState('')
  const [newDomain, setNewDomain] = useState('')
  const [sites, setSites] = useState<PublisherSite[]>([])
  const [isRegistered, setIsRegistered] = useState(false)
  const [isRegisteredOnChain, setIsRegisteredOnChain] = useState(false)
  const [onChainSyncStatus, setOnChainSyncStatus] = useState<SyncStatus>('idle')
  const [onChainSyncError, setOnChainSyncError] = useState<string | null>(null)
  const [onChainLastSyncedAt, setOnChainLastSyncedAt] = useState<number | null>(null)
  const [isRegisteringOnChain, setIsRegisteringOnChain] = useState(false)
  const [isAddingSite, setIsAddingSite] = useState(false)
  const [registrationError, setRegistrationError] = useState<string | null>(null)
  const [registrationSuccess, setRegistrationSuccess] = useState<string | null>(null)
  const [selectedSite, setSelectedSite] = useState<PublisherSite | null>(null)
  const [showApiSecret, setShowApiSecret] = useState<Record<string, boolean>>({})
  const [newApiSecrets, setNewApiSecrets] = useState<Record<string, string>>({})
  const [publisherId, setPublisherId] = useState<string | null>(null)
  const [isWithdrawing, setIsWithdrawing] = useState(false)
  const [withdrawError, setWithdrawError] = useState<string | null>(null)
  const [withdrawSuccess, setWithdrawSuccess] = useState<string | null>(null)
  const [availableBalance, setAvailableBalance] = useState(0)
  const [topupAmount, setTopupAmount] = useState('')
  const [topupToken, setTopupToken] = useState<string>('cUSD')
  const [exchangeHistory, setExchangeHistory] = useState<ExchangeHistoryEntry[]>([])
  const [isToppingUp, setIsToppingUp] = useState(false)
  const [topupError, setTopupError] = useState<string | null>(null)
  const [topupSuccess, setTopupSuccess] = useState<string | null>(null)
  const [fundCampaignId, setFundCampaignId] = useState('')
  const [fundAmount, setFundAmount] = useState('')
  const [isFunding, setIsFunding] = useState(false)
  const [fundError, setFundError] = useState<string | null>(null)
  const [fundSuccess, setFundSuccess] = useState<string | null>(null)
  const [selectedCampaignVault, setSelectedCampaignVault] = useState<CampaignVaultSummary | null>(null)
  const [previewSiteId, setPreviewSiteId] = useState<string | null>(null)
  const [sovPoints, setSovPoints] = useState(0)
  const [isUrlValid, setIsUrlValid] = useState(false)
  const [urlError, setUrlError] = useState<string | null>(null)
  const [authCache, setAuthCache] = useState<{ wallet: string; signature: string; timestamp: number } | null>(null)
  const [activeSection, setActiveSection] = useState<PublisherSectionId>('dashboard')
  const [isStatsLoading, setIsStatsLoading] = useState(false)
  const [statsError, setStatsError] = useState<string | null>(null)
  const [dailyStats, setDailyStats] = useState<DailyStatEntry[]>([])
  const [statsDays, setStatsDays] = useState<'7' | '30' | '90' | 'all'>('30')
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)
  const [fundConfirmPending, setFundConfirmPending] = useState(false)
  const [statsLastRefresh, setStatsLastRefresh] = useState<Date | null>(null)
  const [siteStats, setSiteStats] = useState<Record<string, PublisherStats>>({})
  const [siteDailyStats, setSiteDailyStats] = useState<Record<string, DailyStatEntry[]>>({})

  // Rewards / Redeem state
  const [redeemAvailable, setRedeemAvailable] = useState(0)
  const [redeemTotalRedeemed, setRedeemTotalRedeemed] = useState(0)
  const [redeemMinimum, setRedeemMinimum] = useState<number | null>(null)
  const [redeemAmount, setRedeemAmount] = useState('')
  const [redeemMessage, setRedeemMessage] = useState<RedeemMessage>(null)
  const [isSigningRedeem, setIsSigningRedeem] = useState(false)
  const [isSubmittingRedeem, setIsSubmittingRedeem] = useState(false)
  const [pendingRedeemCashoutId, setPendingRedeemCashoutId] = useState<string | null>(null)
  const [signedRedeemTx, setSignedRedeemTx] = useState<SignedRedeemTx>(null)

  // ── Auth helper ──────────────────────────────────────────────────────────
  const getPublisherAuthHeaders = async (walletAddress: string): Promise<Record<string, string>> => {
    const now = Date.now()
    const normalizedWallet = walletAddress.toLowerCase()
    if (authCache && authCache.wallet === normalizedWallet && now - authCache.timestamp < 4 * 60 * 1000) {
      return {
        'x-wallet-address': authCache.wallet,
        'x-wallet-signature': authCache.signature,
        'x-wallet-timestamp': String(authCache.timestamp),
      }
    }
    const timestamp = Date.now()
    const message = buildPublisherAuthMessage(normalizedWallet, timestamp)
    const signature = await signMessageAsync({ message })
    const nextCache = { wallet: normalizedWallet, signature, timestamp }
    setAuthCache(nextCache)
    return {
      'x-wallet-address': nextCache.wallet,
      'x-wallet-signature': nextCache.signature,
      'x-wallet-timestamp': String(nextCache.timestamp),
    }
  }

  // ── Data loaders ─────────────────────────────────────────────────────────
  const loadStats = async (nextPublisherId: string, days: '7' | '30' | '90' | 'all' = 'all') => {
    setIsStatsLoading(true)
    setStatsError(null)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20_000)
    try {
      const response = await fetch(
        `/api/analytics?publisherId=${encodeURIComponent(nextPublisherId)}&days=${days}`,
        { signal: controller.signal }
      )
      if (!response.ok) {
        setStatsError(`Failed to load analytics (${response.status}). Click retry to try again.`)
        return
      }
      const data = await response.json()
      setStats({
        impressions: data.impressions ?? 0,
        clicks: data.clicks ?? 0,
        ctr: data.ctr ?? 0,
        totalRevenue: data.totalRevenue ?? 0,
      })
      setDailyStats(data.dailyStats ?? [])
      setStatsLastRefresh(new Date())
      setStatsError(null)
    } catch (error) {
      const isAbort = error instanceof DOMException && error.name === 'AbortError'
      setStatsError(isAbort ? 'Analytics request timed out. Click retry.' : 'Could not load analytics. Click retry.')
      console.error('Error loading stats:', error)
    } finally {
      clearTimeout(timer)
      setIsStatsLoading(false)
    }
  }

  const loadSiteStats = async (siteId: string, days: '7' | '30' | '90' | 'all' = 'all') => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20_000)
    try {
      const response = await fetch(
        `/api/analytics?siteId=${encodeURIComponent(siteId)}&days=${days}`,
        { signal: controller.signal }
      )
      if (!response.ok) return
      const data = await response.json()
      setSiteStats((prev) => ({
        ...prev,
        [siteId]: {
          impressions: data.impressions ?? 0,
          clicks: data.clicks ?? 0,
          ctr: data.ctr ?? 0,
          totalRevenue: data.totalRevenue ?? 0,
        },
      }))
      setSiteDailyStats((prev) => ({ ...prev, [siteId]: data.dailyStats ?? [] }))
    } catch (error) {
      console.error('Error loading site stats:', error)
    } finally {
      clearTimeout(timer)
    }
  }

  const loadAllSiteStats = async (sitesToLoad: PublisherSite[], days: '7' | '30' | '90' | 'all' = 'all') => {
    await Promise.all(sitesToLoad.map((site) => loadSiteStats(site.siteId, days)))
  }

  const loadBalance = async (walletAddress: string) => {
    try {
      const response = await fetch(`/api/publishers/balance?wallet=${walletAddress}`)
      if (!response.ok) {
        setAvailableBalance(0)
        return
      }
      const data = await response.json()
      setAvailableBalance(data.available ?? 0)
    } catch {
      setAvailableBalance(0)
    }
  }

  const loadExchangeHistory = async (walletAddress: string) => {
    try {
      const response = await fetch(`/api/publishers/exchange?wallet=${walletAddress}`)
      if (!response.ok) {
        setExchangeHistory([])
        return
      }
      const data = await response.json()
      setExchangeHistory(data.exchanges ?? [])
    } catch {
      setExchangeHistory([])
    }
  }

  const loadSovPoints = async (walletAddress: string) => {
    try {
      const response = await fetch(`/api/viewers/points?wallet=${walletAddress.toLowerCase()}`)
      if (!response.ok) {
        setSovPoints(0)
        return
      }
      const data = await response.json()
      setSovPoints(data.totalPoints ?? 0)
    } catch (error) {
      console.error('Error loading SovPoints:', error)
    }
  }

  const loadRedeemState = async (walletAddress: string) => {
    try {
      const res = await fetch(`/api/viewers/redeem?wallet=${walletAddress.toLowerCase()}`)
      if (!res.ok) return
      const data = await res.json()
      setRedeemAvailable(typeof data.availablePoints === 'number' ? data.availablePoints : 0)
      setRedeemTotalRedeemed(typeof data.totalRedeemed === 'number' ? data.totalRedeemed : 0)
      if (typeof data.minimumCashout === 'number') setRedeemMinimum(data.minimumCashout)
    } catch (error) {
      console.error('Error loading redeem state:', error)
    }
  }

  /** Sign an EIP-712 cashout claim from the API. User submits the tx in step 2. */
  const redeemPointsForGs = async () => {
    setRedeemMessage(null)
    const amt = parseFloat(redeemAmount)
    if (!address) return setRedeemMessage({ type: 'error', text: 'Connect your wallet to redeem.' })
    if (!Number.isFinite(amt) || amt <= 0) return setRedeemMessage({ type: 'error', text: 'Enter a valid amount.' })
    if (redeemMinimum !== null && amt < redeemMinimum) {
      return setRedeemMessage({ type: 'error', text: `Minimum redemption is ${redeemMinimum} G$.` })
    }
    if (amt > redeemAvailable) {
      return setRedeemMessage({ type: 'error', text: `Insufficient points. Available: ${redeemAvailable}.` })
    }
    setIsSigningRedeem(true)
    setSignedRedeemTx(null)
    setPendingRedeemCashoutId(null)
    try {
      const res = await fetch('/api/viewers/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: address.toLowerCase(), amount: amt }),
      })
      const data = await res.json()
      if (res.ok && data.transaction) {
        setSignedRedeemTx({ to: data.transaction.to, args: data.transaction.args })
        setPendingRedeemCashoutId(data.cashoutId)
        setRedeemMessage({
          type: 'success',
          text: `Signed claim for ${amt} G$. Submit the transaction below to receive your tokens.`,
        })
        setRedeemAmount('')
        await loadRedeemState(address)
      } else {
        setRedeemMessage({ type: 'error', text: data.error || 'Redemption failed.' })
      }
    } catch {
      setRedeemMessage({ type: 'error', text: 'Network error. Please try again.' })
    } finally {
      setIsSigningRedeem(false)
    }
  }

  const submitSignedRedeemTx = async () => {
    if (!signedRedeemTx || !walletClient || !address || !pendingRedeemCashoutId) return
    setIsSubmittingRedeem(true)
    setRedeemMessage(null)
    try {
      const { args } = signedRedeemTx
      const txHash = await walletClient.sendTransaction({
        to: signedRedeemTx.to as `0x${string}`,
        data: encodeFunctionData({
          abi: sovAdsStreamingAbi,
          functionName: 'claimWithSignature',
          args: [
            args.recipient as `0x${string}`,
            BigInt(args.amount),
            args.claimRef as `0x${string}`,
            BigInt(args.nonce),
            BigInt(args.deadline),
            args.signature as `0x${string}`,
          ],
        }),
      })
      await fetch('/api/viewers/redeem', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cashoutId: pendingRedeemCashoutId, txHash }),
      })
      setRedeemMessage({ type: 'success', text: `G$ redeemed. Tx: ${txHash.slice(0, 10)}…` })
      setSignedRedeemTx(null)
      setPendingRedeemCashoutId(null)
      await loadRedeemState(address)
      await loadSovPoints(address)
      await loadExchangeHistory(address)
    } catch (err) {
      setRedeemMessage({
        type: 'error',
        text: `Transaction failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      })
    } finally {
      setIsSubmittingRedeem(false)
    }
  }

  const checkOnChainRegistration = async (walletAddress: string) => {
    try {
      const result = await isPublisher(walletAddress)
      setIsRegisteredOnChain(result === true)
    } catch (error) {
      console.error('Error checking on-chain registration:', error)
      setIsRegisteredOnChain(false)
    }
  }

  /**
   * Re-reads on-chain registration with retries. If the chain disagrees with
   * the DB (sites exist locally but the contract says not-a-publisher) and the
   * caller opts in, register on-chain so state lines up.
   */
  const syncOnChain = async (opts?: { autoRegister?: boolean }) => {
    if (!address) return
    setOnChainSyncStatus('syncing')
    setOnChainSyncError(null)
    let confirmed: boolean | undefined
    let lastErr: unknown = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await isPublisher(address)
        if (typeof result === 'boolean') {
          confirmed = result
          break
        }
      } catch (err) {
        lastErr = err
      }
      if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
    }
    if (confirmed === undefined) {
      setOnChainSyncStatus('error')
      setOnChainSyncError(lastErr instanceof Error ? lastErr.message : 'RPC unavailable — try again in a moment.')
      return
    }
    setIsRegisteredOnChain(confirmed)
    setOnChainLastSyncedAt(Date.now())
    if (!confirmed && opts?.autoRegister && sites.length > 0) {
      try {
        setOnChainSyncStatus('registering')
        const domains = sites.map((s) => s.domain).filter(Boolean) as string[]
        if (domains.length === 0) throw new Error('No registered websites to subscribe with.')
        await subscribePublisher(domains)
        setIsRegisteredOnChain(true)
        setOnChainLastSyncedAt(Date.now())
        setOnChainSyncStatus('ok')
        return
      } catch (err) {
        setOnChainSyncStatus('error')
        setOnChainSyncError(err instanceof Error ? err.message : 'On-chain registration failed.')
        return
      }
    }
    setOnChainSyncStatus('ok')
  }

  const loadPublisherData = async (walletAddress: string) => {
    let nextPublisherId: string | null = null
    try {
      const publisherResponse = await fetch(`/api/publishers/register?wallet=${walletAddress}`)
      if (publisherResponse.ok) {
        const publisherData = await publisherResponse.json()
        nextPublisherId = publisherData.id as string
        setIsRegistered(true)
        setPublisherId(nextPublisherId)
        void loadBalance(walletAddress)
        void loadExchangeHistory(walletAddress)
        void loadSovPoints(walletAddress)
      } else {
        setIsRegistered(false)
        setPublisherId(null)
      }
    } catch (error) {
      console.error('Error loading publisher:', error)
      setIsRegistered(false)
      setPublisherId(null)
    }
    if (!nextPublisherId) return
    try {
      const sitesResponse = await fetch(`/api/publishers/sites?wallet=${walletAddress}`)
      if (sitesResponse.ok) {
        const sitesData = await sitesResponse.json()
        const dbSites = (sitesData.sites ?? []).map((site: PublisherSite) => ({
          ...site,
          apiSecret: site.apiSecret ?? undefined,
        }))
        setSites(dbSites)
        void loadAllSiteStats(dbSites, statsDays)
      } else {
        setSites([])
      }
    } catch (error) {
      console.error('Error loading sites:', error)
    }
  }

  // ── Effects ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!newDomain.trim()) {
      setIsUrlValid(false)
      setUrlError(null)
      return
    }
    const validation = validateUrl(newDomain)
    setIsUrlValid(validation.valid)
    setUrlError(validation.error)
  }, [newDomain])

  useEffect(() => {
    if (isConnected && address) {
      setWallet(address)
      void checkOnChainRegistration(address)
      void loadPublisherData(address)
      void loadRedeemState(address)
      return
    }
    setWallet('')
    setSites([])
    setSelectedSite(null)
    setIsRegistered(false)
    setIsRegisteredOnChain(false)
    setOnChainSyncStatus('idle')
    setOnChainSyncError(null)
    setOnChainLastSyncedAt(null)
    setPublisherId(null)
    setAvailableBalance(0)
    setExchangeHistory([])
    setSovPoints(0)
    setRedeemAvailable(0)
    setRedeemTotalRedeemed(0)
    setRedeemAmount('')
    setRedeemMessage(null)
    setSignedRedeemTx(null)
    setPendingRedeemCashoutId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, isConnected])

  useEffect(() => {
    if (!publisherId) return
    void loadStats(publisherId, statsDays)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publisherId, statsDays])

  useEffect(() => {
    if (!sites.length) {
      setSelectedSite(null)
      return
    }
    setSelectedSite((current) => sites.find((site) => site.id === current?.id) ?? sites[0])
  }, [sites])

  // ── Handlers ────────────────────────────────────────────────────────────
  const copyToClipboard = async (text: string, label?: string) => {
    if (!text || !navigator.clipboard) return
    await navigator.clipboard.writeText(text)
    setCopyFeedback(label ?? 'Copied!')
    setTimeout(() => setCopyFeedback(null), 2000)
  }

  const registerPublisher = async () => {
    if (!wallet || !address) return
    const validation = validateUrl(newDomain)
    if (!validation.valid || !validation.domain) {
      setRegistrationError(validation.error || 'Enter a valid website URL.')
      return
    }
    setRegistrationError(null)
    setRegistrationSuccess(null)
    setIsRegisteringOnChain(true)
    try {
      if (!isRegisteredOnChain) {
        await subscribePublisher([validation.domain])
        setIsRegisteredOnChain(true)
      } else {
        await addSite(validation.domain)
      }
      const authHeaders = await getPublisherAuthHeaders(address)
      const response = await fetch('/api/publishers/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ wallet: address, domain: validation.domain }),
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to save publisher website.')
      }
      const data = await response.json()
      if (data.site?.apiSecret) {
        setNewApiSecrets((current) => ({ ...current, [data.site.id]: data.site.apiSecret }))
        setShowApiSecret((current) => ({ ...current, [data.site.id]: true }))
      }
      await loadPublisherData(address)
      setRegistrationSuccess(`Registered ${validation.domain}.`)
      setNewDomain('')
      setActiveSection('websites')
    } catch (error) {
      console.error('Error registering publisher:', error)
      setRegistrationError(error instanceof Error ? error.message : 'Registration failed.')
    } finally {
      setIsRegisteringOnChain(false)
    }
  }

  const addNewSite = async () => {
    if (!address) return
    const validation = validateUrl(newDomain)
    if (!validation.valid || !validation.domain) {
      setRegistrationError(validation.error || 'Enter a valid website URL.')
      return
    }
    setIsAddingSite(true)
    setRegistrationError(null)
    setRegistrationSuccess(null)
    try {
      if (isRegisteredOnChain) await addSite(validation.domain)
      const authHeaders = await getPublisherAuthHeaders(address)
      const response = await fetch('/api/publishers/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ wallet: address, domain: validation.domain }),
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to add website.')
      }
      const data = await response.json()
      if (data.site?.apiSecret) {
        setNewApiSecrets((current) => ({ ...current, [data.site.id]: data.site.apiSecret }))
        setShowApiSecret((current) => ({ ...current, [data.site.id]: true }))
      }
      await loadPublisherData(address)
      setRegistrationSuccess(`Added ${validation.domain}.`)
      setNewDomain('')
    } catch (error) {
      setRegistrationError(error instanceof Error ? error.message : 'Failed to add website.')
    } finally {
      setIsAddingSite(false)
    }
  }

  const removeSiteFromDB = async (siteId: string) => {
    if (!address) return
    try {
      const authHeaders = await getPublisherAuthHeaders(address)
      const response = await fetch(`/api/publishers/sites?siteId=${siteId}&wallet=${address}`, {
        method: 'DELETE',
        headers: authHeaders,
      })
      if (response.ok) await loadPublisherData(address)
    } catch (error) {
      console.error('Error removing site:', error)
    }
  }

  const rotateSiteCredentials = async (site: PublisherSite) => {
    if (!address) return
    try {
      const authHeaders = await getPublisherAuthHeaders(address)
      const response = await fetch('/api/publishers/sites', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ wallet: address, siteId: site.id }),
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to rotate credentials.')
      }
      const data = await response.json()
      if (data.site?.apiSecret) {
        setNewApiSecrets((current) => ({ ...current, [site.id]: data.site.apiSecret }))
        setShowApiSecret((current) => ({ ...current, [site.id]: true }))
      }
      await loadPublisherData(address)
      setRegistrationSuccess(`Rotated credentials for ${site.domain}.`)
    } catch (error) {
      setRegistrationError(error instanceof Error ? error.message : 'Failed to rotate credentials.')
    }
  }

  const handleTopupSubmit = async () => {
    if (!address || !topupAmount) return
    const token = SUPPORTED_EXCHANGE_TOKENS.find((item) => item.symbol === topupToken)
    if (!token) return
    setIsToppingUp(true)
    setTopupError(null)
    setTopupSuccess(null)
    try {
      const amountWei = parseUnits(topupAmount, token.decimals)
      const txHash = await writeTransfer({
        address: token.address,
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [TREASURY_ADDRESS, amountWei],
      })
      const response = await fetch('/api/publishers/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: address,
          amount: Number(topupAmount),
          token: topupToken,
          txHash,
        }),
      })
      if (!response.ok) throw new Error('Failed to sync exchange with backend.')
      setTopupSuccess('Exchange successful. Your G$ balance will refresh shortly.')
      setTopupAmount('')
      await loadBalance(address)
      await loadExchangeHistory(address)
    } catch (error) {
      setTopupError(error instanceof Error ? error.message : 'Exchange failed.')
    } finally {
      setIsToppingUp(false)
    }
  }

  const handleCampaignSelect = async (value: string) => {
    setFundCampaignId(value)
    if (!value) {
      setSelectedCampaignVault(null)
      return
    }
    try {
      const vault = await getCampaignVault(Number(value))
      setSelectedCampaignVault(vault as CampaignVaultSummary)
    } catch {
      setSelectedCampaignVault(null)
    }
  }

  const handleFundCampaign = async () => {
    if (!address || !fundCampaignId || !fundAmount) return
    if (!fundConfirmPending) {
      setFundConfirmPending(true)
      return
    }
    setFundConfirmPending(false)
    setIsFunding(true)
    setFundError(null)
    setFundSuccess(null)
    try {
      const txHash = await topUpCampaign(Number(fundCampaignId), fundAmount, GOOD_DOLLAR_ADDRESS)
      setFundSuccess(txHash ? `Campaign funded. Tx: ${txHash}` : 'Campaign funded successfully.')
      setFundCampaignId('')
      setFundAmount('')
      setSelectedCampaignVault(null)
    } catch (error) {
      setFundError(error instanceof Error ? error.message : 'Funding failed.')
    } finally {
      setIsFunding(false)
    }
  }

  const handleWithdraw = async () => {
    if (!address || availableBalance <= 0) return
    setIsWithdrawing(true)
    setWithdrawError(null)
    setWithdrawSuccess(null)
    try {
      const response = await fetch('/api/publishers/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: address, amount: availableBalance }),
      })
      if (!response.ok) throw new Error('Withdrawal failed.')
      const data = await response.json()
      setWithdrawSuccess(`Withdrawn ${data.amount} G$.`)
      await loadBalance(address)
    } catch (error) {
      setWithdrawError(error instanceof Error ? error.message : 'Withdrawal failed.')
    } finally {
      setIsWithdrawing(false)
    }
  }

  const envBlock = selectedSite
    ? `NEXT_PUBLIC_SOVADS_API_URL=https://ads.sovseas.xyz\nNEXT_PUBLIC_SOVADS_SITE_ID=${selectedSite.siteId}`
    : ''
  const exchangeEstimate = topupAmount
    ? Number(topupAmount) * (SUPPORTED_EXCHANGE_TOKENS.find((item) => item.symbol === topupToken)?.gsPerUnit || 10000)
    : 0

  // ── Connect gate ─────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[#F5F3F0] flex items-center justify-center p-6">
        <div className="w-full max-w-md border border-[#2D2D2D] bg-white p-8 shadow-[6px_6px_0_0_#2D2D2D] text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center bg-[#2D2D2D]">
            <AdvertiserIcon name="websites" className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-[22px] font-bold tracking-tight text-[#2D2D2D]">Publisher workspace</h1>
          <p className="mt-2 text-[13px] text-[#666] leading-5">
            Connect a wallet to register a site, manage SDK credentials, fund campaigns, and withdraw G$.
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
            <h1 className="truncate text-[15px] font-bold text-[#2D2D2D]">Publisher</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden flex-wrap items-center gap-1.5 sm:flex">
              <StatusBadge tone={isRegistered ? 'success' : 'warning'}>
                {isRegistered ? 'Publisher active' : 'Onboarding'}
              </StatusBadge>
              <StatusBadge tone={isRegisteredOnChain ? 'success' : 'neutral'}>
                {isRegisteredOnChain ? 'On-chain ready' : 'Awaiting on-chain'}
              </StatusBadge>
            </div>
            <WalletButton />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-screen-xl px-4 py-6">
        <div className="flex gap-6 lg:gap-8">
          {/* Desktop sidebar — the advertiser sidebar's section types are
              advertiser-specific. Runtime shape is identical, so cast at the
              boundary instead of widening the shared component. */}
          <div className="hidden w-[200px] flex-shrink-0 lg:block">
            <AdvertiserSidebar
              items={publisherSidebarItems as unknown as Parameters<typeof AdvertiserSidebar>[0]['items']}
              activeSection={activeSection as unknown as Parameters<typeof AdvertiserSidebar>[0]['activeSection']}
              onSelect={(id) => setActiveSection(id as unknown as PublisherSectionId)}
            />
          </div>

          {/* Mobile section tabs */}
          <div className="mb-4 w-full overflow-x-auto pb-1 lg:hidden">
            <div className="flex min-w-max gap-1">
              {publisherSidebarItems.map((item) => {
                const key = item.id ?? item.sectionId ?? item.href ?? item.label
                const isActive = !!item.sectionId && item.sectionId === activeSection
                const cls = [
                  'inline-flex items-center gap-1.5 whitespace-nowrap border px-3 py-1.5 text-[12px] font-medium transition-colors',
                  isActive ? 'border-[#2D2D2D] bg-[#2D2D2D] text-white' : 'border-[#E5E5E5] bg-white text-[#444] hover:bg-[#F4F4F2]',
                ].join(' ')
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => item.sectionId && setActiveSection(item.sectionId as PublisherSectionId)}
                    className={cls}
                  >
                    <AdvertiserIcon name={item.icon} className="h-3.5 w-3.5" />
                    {item.label}
                  </button>
                )
              })}
            </div>
          </div>

          <main className="min-w-0 flex-1 space-y-5">
            {!isRegistered ? (
              <OnboardingSection
                newDomain={newDomain}
                onDomain={setNewDomain}
                onSubmit={() => void registerPublisher()}
                isSubmitting={isRegisteringOnChain}
                isUrlValid={isUrlValid}
                urlError={urlError}
                registrationError={registrationError}
                registrationSuccess={registrationSuccess}
              />
            ) : (
              <>
                {activeSection === 'dashboard' && (
                  <OverviewSection
                    wallet={wallet}
                    publisherId={publisherId}
                    sites={sites}
                    stats={stats}
                    sovPoints={sovPoints}
                    availableBalance={availableBalance}
                    onChainSyncStatus={onChainSyncStatus}
                    onChainSyncError={onChainSyncError}
                    onChainLastSyncedAt={onChainLastSyncedAt}
                    isRegisteredOnChain={isRegisteredOnChain}
                    onSyncOnChain={() =>
                      void syncOnChain({ autoRegister: !isRegisteredOnChain && sites.length > 0 })
                    }
                    onJumpToIntegration={() => setActiveSection('integration')}
                  />
                )}

                {activeSection === 'analytics' && (
                  <AnalyticsSection
                    stats={stats}
                    sovPoints={sovPoints}
                    dailyStats={dailyStats}
                    statsDays={statsDays}
                    onStatsDays={setStatsDays}
                    isLoading={isStatsLoading}
                    error={statsError}
                    lastRefresh={statsLastRefresh}
                    onRefresh={() => publisherId && void loadStats(publisherId, statsDays)}
                    sitesCount={sites.length}
                  />
                )}

                {activeSection === 'websites' && (
                  <WebsitesSection
                    newDomain={newDomain}
                    onDomain={setNewDomain}
                    isAddingSite={isAddingSite}
                    isUrlValid={isUrlValid}
                    urlError={urlError}
                    registrationError={registrationError}
                    registrationSuccess={registrationSuccess}
                    onAddSite={() => void addNewSite()}
                    sites={sites}
                    selectedSite={selectedSite}
                    onSelectSite={setSelectedSite}
                    onPreview={(id) => setPreviewSiteId(id)}
                    onRotate={(site) => void rotateSiteCredentials(site)}
                    onRemove={(id) => void removeSiteFromDB(id)}
                    siteStats={siteStats}
                    onRefreshSiteStats={(id) => void loadSiteStats(id, statsDays)}
                    onCopy={(text, label) => void copyToClipboard(text, label)}
                  />
                )}

                {activeSection === 'integration' && (
                  <IntegrationSection
                    selectedSite={selectedSite}
                    sites={sites}
                    stats={stats}
                    showApiSecret={showApiSecret}
                    setShowApiSecret={setShowApiSecret}
                    newApiSecrets={newApiSecrets}
                    envBlock={envBlock}
                    onCopy={(text, label) => void copyToClipboard(text, label)}
                    onPreview={(id) => setPreviewSiteId(id)}
                  />
                )}

                {activeSection === 'earnings' && (
                  <EarningsSection
                    availableBalance={availableBalance}
                    topupToken={topupToken}
                    onTopupToken={setTopupToken}
                    topupAmount={topupAmount}
                    onTopupAmount={setTopupAmount}
                    exchangeEstimate={exchangeEstimate}
                    isToppingUp={isToppingUp}
                    onTopupSubmit={() => void handleTopupSubmit()}
                    topupError={topupError}
                    topupSuccess={topupSuccess}
                    campaignCount={Number(campaignCount ?? 0)}
                    fundCampaignId={fundCampaignId}
                    onFundCampaignSelect={(v) => void handleCampaignSelect(v)}
                    fundAmount={fundAmount}
                    onFundAmount={setFundAmount}
                    selectedCampaignVault={selectedCampaignVault}
                    fundConfirmPending={fundConfirmPending}
                    onCancelFundConfirm={() => setFundConfirmPending(false)}
                    isFunding={isFunding}
                    onFundCampaign={() => void handleFundCampaign()}
                    fundError={fundError}
                    fundSuccess={fundSuccess}
                    isWithdrawing={isWithdrawing}
                    onWithdraw={() => void handleWithdraw()}
                    withdrawError={withdrawError}
                    withdrawSuccess={withdrawSuccess}
                  />
                )}

                {activeSection === 'rewards' && (
                  <RewardsSection
                    isConnected={isConnected}
                    sovPoints={sovPoints}
                    redeemAvailable={redeemAvailable}
                    redeemTotalRedeemed={redeemTotalRedeemed}
                    redeemMinimum={redeemMinimum}
                    redeemAmount={redeemAmount}
                    onRedeemAmount={setRedeemAmount}
                    isSigningRedeem={isSigningRedeem}
                    isSubmittingRedeem={isSubmittingRedeem}
                    signedRedeemTx={signedRedeemTx}
                    onSign={() => void redeemPointsForGs()}
                    onSubmitClaim={() => void submitSignedRedeemTx()}
                    onCancelClaim={() => {
                      setSignedRedeemTx(null)
                      setPendingRedeemCashoutId(null)
                      setRedeemMessage(null)
                    }}
                    redeemMessage={redeemMessage}
                    exchangeHistory={exchangeHistory}
                    onRefresh={() => {
                      if (!address) return
                      void loadRedeemState(address)
                      void loadSovPoints(address)
                      void loadExchangeHistory(address)
                    }}
                  />
                )}

                {activeSection === 'settings' && (
                  <SettingsSection
                    wallet={wallet}
                    publisherId={publisherId}
                    isRegisteredOnChain={isRegisteredOnChain}
                    onRefresh={() => address && void loadPublisherData(address)}
                  />
                )}
              </>
            )}
          </main>
        </div>
      </div>

      <PublisherPreviewModal siteId={previewSiteId} onClose={() => setPreviewSiteId(null)} />

      {copyFeedback ? (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 border border-[#2D2D2D] bg-[#2D2D2D] px-3 py-2 text-[12px] font-semibold text-white shadow-[3px_3px_0_0_#2D2D2D]">
          <AdvertiserIcon name="copy" className="h-3.5 w-3.5" />
          {copyFeedback}
        </div>
      ) : null}
    </div>
  )
}

// ─── Section: Onboarding ─────────────────────────────────────────────────

function OnboardingSection({
  newDomain,
  onDomain,
  onSubmit,
  isSubmitting,
  isUrlValid,
  urlError,
  registrationError,
  registrationSuccess,
}: {
  newDomain: string
  onDomain: (v: string) => void
  onSubmit: () => void
  isSubmitting: boolean
  isUrlValid: boolean
  urlError: string | null
  registrationError: string | null
  registrationSuccess: string | null
}) {
  return (
    <Section
      title="Register your first website"
      description="We'll generate a Site ID and API key for every approved domain. Secrets stay server-side."
      emphasis="hero"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.9fr)]">
        <div className="space-y-3">
          <Field label="Website URL" required hint="Localhost is allowed for testing, but live payouts need a production domain." error={urlError ?? registrationError ?? null}>
            <TextInput
              value={newDomain}
              onChange={(e) => onDomain(e.target.value)}
              placeholder="example.com"
            />
          </Field>
          {registrationSuccess ? <Alert tone="success">{registrationSuccess}</Alert> : null}
          <div>
            <Button intent="primary" onClick={onSubmit} disabled={isSubmitting || !isUrlValid}>
              {isSubmitting ? 'Registering…' : 'Register publisher'}
            </Button>
          </div>
        </div>

        <div className="space-y-3 border border-[#E5E5E5] bg-[#FAFAF8] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#888]">Checklist</p>
          <ChecklistItem icon="websites" title="Use a production domain" body="Localhost is fine for testing, but real payouts should run on a live site." />
          <ChecklistItem icon="copy" title="Save your credentials" body="A rotated API secret is only shown once. Keep it off the client." />
          <ChecklistItem icon="earnings" title="Withdraw when ready" body="Exchange supported tokens to G$ and withdraw accrued publisher earnings." />
        </div>
      </div>
    </Section>
  )
}

function ChecklistItem({ icon, title, body }: { icon: 'websites' | 'copy' | 'earnings'; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center bg-[#2D2D2D] text-white">
        <AdvertiserIcon name={icon} className="h-3.5 w-3.5" />
      </span>
      <div>
        <p className="text-[13px] font-semibold text-[#2D2D2D]">{title}</p>
        <p className="text-[12px] leading-5 text-[#666]">{body}</p>
      </div>
    </div>
  )
}

// ─── Section: Overview ──────────────────────────────────────────────────

function OverviewSection({
  wallet,
  publisherId,
  sites,
  stats,
  sovPoints,
  availableBalance,
  onChainSyncStatus,
  onChainSyncError,
  onChainLastSyncedAt,
  isRegisteredOnChain,
  onSyncOnChain,
  onJumpToIntegration,
}: {
  wallet: string
  publisherId: string | null
  sites: PublisherSite[]
  stats: PublisherStats
  sovPoints: number
  availableBalance: number
  onChainSyncStatus: SyncStatus
  onChainSyncError: string | null
  onChainLastSyncedAt: number | null
  isRegisteredOnChain: boolean
  onSyncOnChain: () => void
  onJumpToIntegration: () => void
}) {
  const isSyncing = onChainSyncStatus === 'syncing' || onChainSyncStatus === 'registering'
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          accent="hero"
          label="Available G$"
          value={formatNumber(Number(availableBalance.toFixed(2)))}
          hint="Withdrawable publisher balance"
        />
        <Metric label="Impressions" value={stats.impressions > 0 ? formatNumber(stats.impressions) : '—'} />
        <Metric label="CTR" value={stats.impressions > 0 ? formatPct(stats.ctr, 2) : '—'} />
        <Metric label="SovPoints" value={formatNumber(sovPoints)} />
      </div>

      <Section
        title="Account"
        description="Wallet, publisher ID, and registered sites at a glance"
        actions={
          <Button intent="secondary" size="sm" icon="rotate" onClick={onSyncOnChain} disabled={isSyncing}>
            {onChainSyncStatus === 'syncing'
              ? 'Syncing…'
              : onChainSyncStatus === 'registering'
              ? 'Registering…'
              : isRegisteredOnChain
              ? 'Sync on-chain'
              : sites.length > 0
              ? 'Register on-chain'
              : 'Sync on-chain'}
          </Button>
        }
      >
        <ul className="divide-y divide-[#EFEFEF] text-[13px]">
          <li className="flex items-center justify-between gap-3 py-2">
            <span className="text-[#444]">Wallet</span>
            <span className="break-all font-mono text-[12px] text-[#2D2D2D]">{wallet ? truncateAddress(wallet) : 'Not connected'}</span>
          </li>
          <li className="flex items-center justify-between gap-3 py-2">
            <span className="text-[#444]">Publisher ID</span>
            <span className="break-all font-mono text-[12px] text-[#2D2D2D]">{publisherId ?? 'Pending'}</span>
          </li>
          <li className="flex items-center justify-between gap-3 py-2">
            <span className="text-[#444]">Registered sites</span>
            <span className="font-semibold text-[#2D2D2D]">{sites.length}</span>
          </li>
        </ul>
        {onChainSyncError ? (
          <div className="mt-3"><Alert tone="error">{onChainSyncError}</Alert></div>
        ) : onChainSyncStatus === 'ok' && onChainLastSyncedAt ? (
          <p className="mt-3 text-[11px] text-[#888]">Last synced {new Date(onChainLastSyncedAt).toLocaleTimeString()}</p>
        ) : null}
      </Section>

      <Section
        title="Next steps"
        actions={
          <Button intent="ghost" size="sm" onClick={onJumpToIntegration}>
            Open integration →
          </Button>
        }
      >
        <p className="text-[13px] text-[#444] leading-5">
          Once your domain is registered, copy the SDK snippet from the Integration section and deploy it on your site
          to start serving ads and earning G$.
        </p>
      </Section>
    </div>
  )
}

// ─── Section: Analytics ─────────────────────────────────────────────────

function AnalyticsSection({
  stats,
  sovPoints,
  dailyStats,
  statsDays,
  onStatsDays,
  isLoading,
  error,
  lastRefresh,
  onRefresh,
  sitesCount,
}: {
  stats: PublisherStats
  sovPoints: number
  dailyStats: DailyStatEntry[]
  statsDays: '7' | '30' | '90' | 'all'
  onStatsDays: (d: '7' | '30' | '90' | 'all') => void
  isLoading: boolean
  error: string | null
  lastRefresh: Date | null
  onRefresh: () => void
  sitesCount: number
}) {
  return (
    <Section
      title="Performance"
      description={lastRefresh ? `Updated ${lastRefresh.toLocaleTimeString()}` : 'Live publisher analytics'}
      actions={
        <div className="flex flex-wrap items-center gap-1.5">
          {(['7', '30', '90', 'all'] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onStatsDays(d)}
              className={[
                'border px-2.5 py-1 text-[12px] font-medium transition-colors',
                statsDays === d
                  ? 'border-[#2D2D2D] bg-[#2D2D2D] text-white'
                  : 'border-[#E5E5E5] bg-white text-[#444] hover:bg-[#F4F4F2]',
              ].join(' ')}
            >
              {d === 'all' ? 'All time' : `${d}d`}
            </button>
          ))}
          <Button intent="secondary" size="sm" icon="rotate" onClick={onRefresh} disabled={isLoading}>
            {isLoading ? 'Loading…' : 'Refresh'}
          </Button>
        </div>
      }
    >
      {error ? <div className="mb-4"><Alert tone="error">{error}</Alert></div> : null}

      {!isLoading && !error && stats.impressions === 0 && stats.clicks === 0 && sitesCount > 0 ? (
        <div className="mb-4">
          <Alert tone="info">
            Your sites are registered but no impressions have been tracked yet. Deploy the SDK snippet from the
            Integration section to start serving ads.
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Impressions" value={formatNumber(stats.impressions)} loading={isLoading} />
        <Metric label="Clicks" value={formatNumber(stats.clicks)} loading={isLoading} />
        <Metric label="CTR" value={formatPct(stats.ctr, 2)} loading={isLoading} />
        <Metric label="Revenue (G$)" value={stats.totalRevenue.toFixed(2)} loading={isLoading} />
        <Metric label="SovPoints" value={formatNumber(sovPoints)} loading={isLoading} />
      </div>

      {isLoading ? (
        <div className="mt-5 space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      ) : dailyStats.length > 0 ? (
        <div className="mt-5 overflow-x-auto border border-[#EFEFEF]">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[#FAFAF8] text-[11px] font-semibold uppercase tracking-wide text-[#666]">
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-right">Impressions</th>
                <th className="px-3 py-2 text-right">Clicks</th>
                <th className="px-3 py-2 text-right">CTR</th>
                <th className="px-3 py-2 text-right">Revenue (G$)</th>
              </tr>
            </thead>
            <tbody>
              {[...dailyStats]
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, 30)
                .map((row, i) => {
                  const rowCtr = row.impressions > 0 ? ((row.clicks / row.impressions) * 100).toFixed(2) : '0.00'
                  return (
                    <tr key={row.date} className={`border-t border-[#EFEFEF] ${i % 2 === 1 ? 'bg-[#FCFCFB]' : 'bg-white'}`}>
                      <td className="px-3 py-2 font-medium text-[#2D2D2D]">{formatDate(row.date)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.impressions)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.clicks)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-[#666]">{rowCtr}%</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-[#146C2E]">{row.revenue.toFixed(4)}</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      ) : !error && stats.impressions > 0 ? (
        <p className="mt-4 text-[12px] text-[#666]">No day-by-day breakdown available for this period.</p>
      ) : null}
    </Section>
  )
}

// ─── Section: Websites ──────────────────────────────────────────────────

function WebsitesSection({
  newDomain,
  onDomain,
  isAddingSite,
  isUrlValid,
  urlError,
  registrationError,
  registrationSuccess,
  onAddSite,
  sites,
  selectedSite,
  onSelectSite,
  onPreview,
  onRotate,
  onRemove,
  siteStats,
  onRefreshSiteStats,
  onCopy,
}: {
  newDomain: string
  onDomain: (v: string) => void
  isAddingSite: boolean
  isUrlValid: boolean
  urlError: string | null
  registrationError: string | null
  registrationSuccess: string | null
  onAddSite: () => void
  sites: PublisherSite[]
  selectedSite: PublisherSite | null
  onSelectSite: (site: PublisherSite) => void
  onPreview: (siteId: string) => void
  onRotate: (site: PublisherSite) => void
  onRemove: (id: string) => void
  siteStats: Record<string, PublisherStats>
  onRefreshSiteStats: (siteId: string) => void
  onCopy: (text: string, label?: string) => void
}) {
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({})
  const toggleReveal = (id: string) =>
    setRevealedKeys((prev) => ({ ...prev, [id]: !prev[id] }))
  return (
    <div className="space-y-5">
      <Section title="Add a website" description="Each domain gets its own Site ID and API key.">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <Field label="Domain" error={urlError ?? registrationError ?? null}>
            <TextInput value={newDomain} onChange={(e) => onDomain(e.target.value)} placeholder="another-site.com" />
          </Field>
          <Button intent="primary" onClick={onAddSite} disabled={isAddingSite || !isUrlValid}>
            {isAddingSite ? 'Adding…' : 'Add site'}
          </Button>
        </div>
        {registrationSuccess ? <div className="mt-3"><Alert tone="success">{registrationSuccess}</Alert></div> : null}
      </Section>

      <Section title="Registered websites" description={`${sites.length} site${sites.length === 1 ? '' : 's'}`}>
        {sites.length === 0 ? (
          <EmptyState
            icon="websites"
            title="No websites registered yet"
            description="Add your first domain above. Once approved, deploy the SDK snippet and start serving ads."
          />
        ) : (
          <div className="overflow-x-auto border border-[#E5E5E5]">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-[#E5E5E5] bg-[#FAFAF8] text-[11px] font-semibold uppercase tracking-wide text-[#666]">
                  <th className="px-3 py-2 text-left">Domain</th>
                  <th className="px-3 py-2 text-left">Site ID</th>
                  <th className="px-3 py-2 text-left">API Key</th>
                  <th className="px-3 py-2 text-left">Integration</th>
                  <th className="px-3 py-2 text-left">Activity</th>
                  <th className="px-3 py-2 text-left">Created</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((site) => {
                  const siteStat = siteStats[site.siteId]
                  const hasImpressions = !!siteStat && siteStat.impressions > 0
                  // SDK heartbeat freshness: anything within 24h means the
                  // snippet has actually loaded in a real browser recently.
                  // This is the primary "Integrated" signal — impressions
                  // only land if a campaign happens to target this domain.
                  const lastSeenMs = site.lastSeenAt ? new Date(site.lastSeenAt).getTime() : 0
                  const heartbeatAgeMs = lastSeenMs ? Date.now() - lastSeenMs : Infinity
                  const heartbeatFresh = heartbeatAgeMs < 24 * 60 * 60 * 1000
                  const heartbeatStale = lastSeenMs > 0 && !heartbeatFresh
                  const integrated = heartbeatFresh || hasImpressions
                  const isSelected = selectedSite?.id === site.id
                  return (
                    <tr
                      key={site.id}
                      className={`border-t border-[#EFEFEF] align-top ${isSelected ? 'bg-[#FAFAF8]' : 'bg-white'}`}
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[13px] font-semibold text-[#2D2D2D]">{site.domain}</span>
                          <StatusBadge tone={site.verified ? 'success' : 'warning'}>
                            {site.verified ? 'Verified' : 'Pending'}
                          </StatusBadge>
                          {isSelected ? <StatusBadge tone="info">Selected</StatusBadge> : null}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onCopy(site.siteId, 'Site ID copied')}
                            className="inline-flex h-5 w-5 items-center justify-center rounded border border-[#E5E5E5] text-[#666] transition hover:border-[#2D2D2D] hover:text-[#2D2D2D]"
                            title="Copy Site ID"
                            aria-label="Copy Site ID"
                          >
                            <AdvertiserIcon name="copy" className="h-3 w-3" />
                          </button>
                          <span className="font-mono text-[11px] text-[#2D2D2D]" title={site.siteId}>
                            {`${site.siteId.slice(0, 10)}…${site.siteId.slice(-6)}`}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => site.apiKey && onCopy(site.apiKey, 'API key copied')}
                            disabled={!site.apiKey}
                            className="inline-flex h-5 w-5 items-center justify-center rounded border border-[#E5E5E5] text-[#666] transition hover:border-[#2D2D2D] hover:text-[#2D2D2D] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#E5E5E5] disabled:hover:text-[#666]"
                            title="Copy API key"
                            aria-label="Copy API key"
                          >
                            <AdvertiserIcon name="copy" className="h-3 w-3" />
                          </button>
                          <span className="font-mono text-[11px] text-[#2D2D2D]">
                            {site.apiKey
                              ? revealedKeys[site.id]
                                ? site.apiKey
                                : `••••${site.apiKey.slice(-4)}`
                              : '—'}
                          </span>
                          {site.apiKey ? (
                            <button
                              type="button"
                              onClick={() => toggleReveal(site.id)}
                              className="text-[10px] font-semibold uppercase tracking-wide text-[#666] underline-offset-2 transition hover:text-[#2D2D2D] hover:underline"
                            >
                              {revealedKeys[site.id] ? 'Hide' : 'Show'}
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {integrated ? (
                          <div className="flex flex-col gap-0.5">
                            <StatusBadge tone="success">SDK detected</StatusBadge>
                            {lastSeenMs > 0 ? (
                              <span
                                className="text-[10px] text-[#888]"
                                title={`Last heartbeat: ${new Date(lastSeenMs).toLocaleString()}${site.lastSdkVersion ? ` · SDK ${site.lastSdkVersion}` : ''}`}
                              >
                                {formatHeartbeatAge(heartbeatAgeMs)}
                                {site.lastSdkVersion ? ` · v${site.lastSdkVersion}` : ''}
                              </span>
                            ) : (
                              <span className="text-[10px] text-[#888]">via impressions</span>
                            )}
                          </div>
                        ) : heartbeatStale ? (
                          <div className="flex flex-col gap-0.5">
                            <StatusBadge tone="warning">Stale</StatusBadge>
                            <span
                              className="text-[10px] text-[#888]"
                              title={`Last heartbeat: ${new Date(lastSeenMs).toLocaleString()}`}
                            >
                              {formatHeartbeatAge(heartbeatAgeMs)}
                            </span>
                          </div>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1.5 text-[11px] text-[#888]"
                            title="We haven't received a heartbeat or impression from this site yet. Paste the SDK snippet on a page that's actually being visited, then click Refresh."
                          >
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#C0C0C0]" />
                            Not detected
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {siteStat ? (
                          <div className="flex flex-col gap-0.5 text-[11px] text-[#666] tabular-nums">
                            <span>
                              <span className="font-semibold text-[#2D2D2D]">{formatNumber(siteStat.impressions)}</span> impr ·{' '}
                              <span className="font-semibold text-[#2D2D2D]">{formatNumber(siteStat.clicks)}</span> clicks
                            </span>
                            <span>
                              CTR {siteStat.ctr.toFixed(1)}% ·{' '}
                              <span className="font-semibold text-[#146C2E]">{siteStat.totalRevenue.toFixed(2)}</span> rev
                            </span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onRefreshSiteStats(site.siteId)}
                            className="text-[11px] font-semibold text-[#2D2D2D] underline"
                          >
                            Refresh
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-[#666] whitespace-nowrap">{formatDate(site.createdAt)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button intent="secondary" size="sm" icon="preview" onClick={() => onPreview(site.siteId)}>Preview</Button>
                          <Button intent="secondary" size="sm" onClick={() => onSelectSite(site)}>Select</Button>
                          <Button intent="secondary" size="sm" icon="rotate" onClick={() => onRotate(site)}>Rotate</Button>
                          <Button intent="danger" size="sm" icon="delete" onClick={() => onRemove(site.id)}>Remove</Button>
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
    </div>
  )
}

// ─── Section: Integration ───────────────────────────────────────────────

function IntegrationSection({
  selectedSite,
  sites,
  stats,
  showApiSecret,
  setShowApiSecret,
  newApiSecrets,
  envBlock,
  onCopy,
  onPreview,
}: {
  selectedSite: PublisherSite | null
  sites: PublisherSite[]
  stats: PublisherStats
  showApiSecret: Record<string, boolean>
  setShowApiSecret: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  newApiSecrets: Record<string, string>
  envBlock: string
  onCopy: (text: string, label?: string) => void
  onPreview: (id: string) => void
}) {
  const snippet = selectedSite
    ? `import { SovAds, Banner } from 'sovads-sdk'

const ads = new SovAds({
  siteId: '${selectedSite.siteId}',
  apiUrl: 'https://ads.sovseas.xyz'
})

const banner = new Banner(ads, 'ad-container')
await banner.render()`
    : `// Select a site to reveal the SDK snippet.`

  return (
    <Section
      title={selectedSite ? `Integration — ${selectedSite.domain}` : 'Integration'}
      description="SDK snippet, credentials, and live preview"
      actions={
        selectedSite ? (
          <Button intent="secondary" size="sm" icon="preview" onClick={() => onPreview(selectedSite.siteId)}>
            Preview
          </Button>
        ) : null
      }
    >
      {!selectedSite ? (
        <EmptyState
          icon="websites"
          title="No site selected"
          description={sites.length === 0
            ? 'Register a website first to get a Site ID and SDK snippet.'
            : 'Pick a site from the Websites section to load its credentials.'}
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.85fr)]">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button intent="secondary" size="sm" icon="copy" onClick={() => onCopy(selectedSite.siteId, 'Site ID copied')}>
                Copy Site ID
              </Button>
              <Button intent="secondary" size="sm" icon="copy" onClick={() => onCopy(selectedSite.apiKey || '', 'API key copied')} disabled={!selectedSite.apiKey}>
                Copy API key
              </Button>
              <Button intent="secondary" size="sm" icon="copy" onClick={() => onCopy(envBlock, '.env block copied')}>
                Copy .env
              </Button>
              <Button intent="primary" size="sm" icon="copy" onClick={() => onCopy(snippet, 'Snippet copied')}>
                Copy snippet
              </Button>
            </div>

            <ul className="divide-y divide-[#EFEFEF] border border-[#EFEFEF] text-[12px]">
              <li className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-[#666]">API Key</span>
                <span className="break-all font-mono text-[#2D2D2D]">{selectedSite.apiKey || '—'}</span>
              </li>
              <li className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-[#666]">API Secret</span>
                <span className="flex items-center gap-2">
                  <span className="break-all font-mono text-[#2D2D2D]">
                    {showApiSecret[selectedSite.id]
                      ? newApiSecrets[selectedSite.id] || selectedSite.apiSecret || 'Not available'
                      : '••••••••'}
                  </span>
                  {!showApiSecret[selectedSite.id] ? (
                    <button
                      type="button"
                      onClick={() => setShowApiSecret((prev) => ({ ...prev, [selectedSite.id]: true }))}
                      className="text-[11px] font-semibold text-[#2D2D2D] underline"
                    >
                      Show
                    </button>
                  ) : null}
                </span>
              </li>
            </ul>
            <p className="text-[11px] text-[#888]">API Secret must stay server-side. Never expose it in NEXT_PUBLIC variables.</p>

            <CodeSnippet code={snippet} onCopy={(c) => onCopy(c, 'Snippet copied')} />
          </div>

          <div className="space-y-3">
            <div className="border border-[#E5E5E5] bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#888]">Live status</p>
              <ul className="mt-3 divide-y divide-[#EFEFEF] text-[12px]">
                <li className="flex items-center justify-between gap-3 py-2">
                  <span className="text-[#666]">Selected site</span>
                  <span className="font-semibold text-[#2D2D2D]">{selectedSite.domain}</span>
                </li>
                <li className="flex items-center justify-between gap-3 py-2">
                  <span className="text-[#666]">Publisher CTR</span>
                  <span className="font-semibold text-[#2D2D2D]">{stats.ctr.toFixed(2)}%</span>
                </li>
                <li className="flex items-center justify-between gap-3 py-2">
                  <span className="text-[#666]">Verified sites</span>
                  <span className="font-semibold text-[#2D2D2D]">{sites.filter((s) => s.verified).length}</span>
                </li>
              </ul>
            </div>
            <div className="border border-[#E5E5E5] bg-[#FAFAF8] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#888]">Next step</p>
              <p className="mt-2 text-[13px] font-semibold text-[#2D2D2D]">Preview before shipping</p>
              <p className="mt-1 text-[12px] leading-5 text-[#666]">
                Open the live preview to verify the site ID resolves and an active banner renders against your placement.
              </p>
            </div>
          </div>
        </div>
      )}
    </Section>
  )
}

// ─── Section: Earnings ──────────────────────────────────────────────────

function EarningsSection({
  availableBalance,
  topupToken,
  onTopupToken,
  topupAmount,
  onTopupAmount,
  exchangeEstimate,
  isToppingUp,
  onTopupSubmit,
  topupError,
  topupSuccess,
  campaignCount,
  fundCampaignId,
  onFundCampaignSelect,
  fundAmount,
  onFundAmount,
  selectedCampaignVault,
  fundConfirmPending,
  onCancelFundConfirm,
  isFunding,
  onFundCampaign,
  fundError,
  fundSuccess,
  isWithdrawing,
  onWithdraw,
  withdrawError,
  withdrawSuccess,
}: {
  availableBalance: number
  topupToken: string
  onTopupToken: (v: string) => void
  topupAmount: string
  onTopupAmount: (v: string) => void
  exchangeEstimate: number
  isToppingUp: boolean
  onTopupSubmit: () => void
  topupError: string | null
  topupSuccess: string | null
  campaignCount: number
  fundCampaignId: string
  onFundCampaignSelect: (v: string) => void
  fundAmount: string
  onFundAmount: (v: string) => void
  selectedCampaignVault: CampaignVaultSummary | null
  fundConfirmPending: boolean
  onCancelFundConfirm: () => void
  isFunding: boolean
  onFundCampaign: () => void
  fundError: string | null
  fundSuccess: string | null
  isWithdrawing: boolean
  onWithdraw: () => void
  withdrawError: string | null
  withdrawSuccess: string | null
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Section title="Token exchange" description="Convert supported tokens into publisher G$ credit.">
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[130px_minmax(0,1fr)]">
              <Field label="Token">
                <Select value={topupToken} onChange={(e) => onTopupToken(e.target.value)}>
                  {SUPPORTED_EXCHANGE_TOKENS.map((token) => (
                    <option key={token.symbol} value={token.symbol}>{token.symbol}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Amount">
                <TextInput
                  type="number"
                  value={topupAmount}
                  onChange={(e) => onTopupAmount(e.target.value)}
                  placeholder="0.00"
                />
              </Field>
            </div>
            <p className="text-[12px] text-[#666]">
              Est. receive: <span className="font-semibold text-[#2D2D2D]">{formatNumber(exchangeEstimate)} G$</span>
            </p>
            <Button intent="primary" icon="exchange" onClick={onTopupSubmit} disabled={isToppingUp || !topupAmount}>
              {isToppingUp ? 'Processing…' : `Exchange ${topupToken}`}
            </Button>
            {topupSuccess ? <Alert tone="success">{topupSuccess}</Alert> : null}
            {topupError ? <Alert tone="error">{topupError}</Alert> : null}
          </div>
        </Section>

        <Section title="Fund a campaign" description="Top up an on-chain campaign vault with G$.">
          <div className="space-y-3">
            <Field label="Campaign ID">
              {campaignCount > 0 ? (
                <Select value={fundCampaignId} onChange={(e) => onFundCampaignSelect(e.target.value)}>
                  <option value="">Select</option>
                  {Array.from({ length: campaignCount }).map((_, index) => (
                    <option key={index + 1} value={index + 1}>#{index + 1}</option>
                  ))}
                </Select>
              ) : (
                <TextInput
                  type="number"
                  value={fundCampaignId}
                  onChange={(e) => onFundCampaignSelect(e.target.value)}
                  placeholder="Campaign ID"
                />
              )}
            </Field>
            <Field label="Amount (G$)">
              <TextInput
                type="number"
                value={fundAmount}
                onChange={(e) => onFundAmount(e.target.value)}
                placeholder="0.00"
              />
            </Field>
            {selectedCampaignVault ? (
              <div className="border border-[#E5E5E5] bg-[#FAFAF8] p-3 text-[12px]">
                <VaultRow label="Token" value={getTokenInfo(selectedCampaignVault.token)?.symbol ?? selectedCampaignVault.token} />
                <VaultRow label="Funded" value={formatVaultAmount(selectedCampaignVault.totalFunded, selectedCampaignVault.token)} />
                <VaultRow label="Locked" value={formatVaultAmount(selectedCampaignVault.locked, selectedCampaignVault.token)} />
                <VaultRow label="Claimed" value={formatVaultAmount(selectedCampaignVault.claimed, selectedCampaignVault.token)} />
              </div>
            ) : null}
            {fundConfirmPending ? (
              <Alert tone="warning">
                <div className="flex flex-col gap-2">
                  <span>Fund campaign #{fundCampaignId} with {fundAmount} G$?</span>
                  <div className="flex gap-2">
                    <Button intent="primary" size="sm" onClick={onFundCampaign} disabled={isFunding}>
                      {isFunding ? 'Funding…' : 'Confirm'}
                    </Button>
                    <Button intent="secondary" size="sm" onClick={onCancelFundConfirm}>Cancel</Button>
                  </div>
                </div>
              </Alert>
            ) : (
              <Button intent="primary" icon="activate" onClick={onFundCampaign} disabled={isFunding || !fundCampaignId || !fundAmount}>
                Fund campaign
              </Button>
            )}
            {fundSuccess ? <Alert tone="success">{fundSuccess}</Alert> : null}
            {fundError ? <Alert tone="error">{fundError}</Alert> : null}
          </div>
        </Section>

        <Section title="Withdraw earnings" description="Send accrued publisher G$ to your wallet.">
          <div className="space-y-3">
            <div className="border border-[#E5E5E5] bg-[#FAFAF8] p-3">
              <p className="text-[11px] text-[#666]">Available balance</p>
              <p className="mt-1 text-[22px] font-bold tabular-nums text-[#2D2D2D]">{availableBalance.toFixed(2)} G$</p>
            </div>
            <Button intent="primary" icon="withdraw" onClick={onWithdraw} disabled={isWithdrawing || availableBalance <= 0}>
              {isWithdrawing ? 'Processing…' : 'Withdraw all'}
            </Button>
            {withdrawSuccess ? <Alert tone="success">{withdrawSuccess}</Alert> : null}
            {withdrawError ? <Alert tone="error">{withdrawError}</Alert> : null}
          </div>
        </Section>
      </div>
    </div>
  )
}

function VaultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <span className="text-[#666]">{label}</span>
      <span className="font-mono text-[#2D2D2D]">{value}</span>
    </div>
  )
}

// ─── Section: Rewards ───────────────────────────────────────────────────

function RewardsSection({
  isConnected,
  sovPoints,
  redeemAvailable,
  redeemTotalRedeemed,
  redeemMinimum,
  redeemAmount,
  onRedeemAmount,
  isSigningRedeem,
  isSubmittingRedeem,
  signedRedeemTx,
  onSign,
  onSubmitClaim,
  onCancelClaim,
  redeemMessage,
  exchangeHistory,
  onRefresh,
}: {
  isConnected: boolean
  sovPoints: number
  redeemAvailable: number
  redeemTotalRedeemed: number
  redeemMinimum: number | null
  redeemAmount: string
  onRedeemAmount: (v: string) => void
  isSigningRedeem: boolean
  isSubmittingRedeem: boolean
  signedRedeemTx: SignedRedeemTx
  onSign: () => void
  onSubmitClaim: () => void
  onCancelClaim: () => void
  redeemMessage: RedeemMessage
  exchangeHistory: ExchangeHistoryEntry[]
  onRefresh: () => void
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <Section
        title="SovPoints & redeem"
        description="Convert earned points to G$ via on-chain claim."
        actions={
          <Button intent="secondary" size="sm" icon="rotate" onClick={onRefresh}>
            Refresh
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Metric label="SovPoints" value={formatNumber(sovPoints)} />
            <Metric label="Available G$" value={formatNumber(redeemAvailable)} />
            <Metric label="Redeemed" value={formatNumber(redeemTotalRedeemed)} />
          </div>

          {!isConnected ? (
            <Alert tone="info">Connect a wallet to redeem.</Alert>
          ) : (
            <div className="space-y-3">
              <Field
                label="Amount to redeem"
                hint={`${redeemMinimum !== null ? `Minimum ${redeemMinimum} G$` : 'Loading minimum…'} · 1 SovPoint = 1 G$`}
              >
                <div className="flex gap-2">
                  <TextInput
                    type="number"
                    min={redeemMinimum ?? 0}
                    max={redeemAvailable}
                    step="0.01"
                    value={redeemAmount}
                    onChange={(e) => onRedeemAmount(e.target.value)}
                    placeholder={redeemMinimum !== null ? `Min ${redeemMinimum}` : 'Amount'}
                    disabled={isSigningRedeem || !!signedRedeemTx}
                  />
                  <Button
                    intent="secondary"
                    onClick={() => onRedeemAmount(String(redeemAvailable))}
                    disabled={redeemAvailable <= 0 || isSigningRedeem || !!signedRedeemTx}
                  >
                    Max
                  </Button>
                </div>
              </Field>

              {!signedRedeemTx ? (
                <Button
                  intent="primary"
                  onClick={onSign}
                  disabled={
                    isSigningRedeem ||
                    redeemAvailable <= 0 ||
                    !redeemAmount ||
                    (redeemMinimum !== null && parseFloat(redeemAmount) < redeemMinimum)
                  }
                >
                  {isSigningRedeem ? 'Signing…' : 'Sign claim'}
                </Button>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button intent="primary" onClick={onSubmitClaim} disabled={isSubmittingRedeem}>
                    {isSubmittingRedeem ? 'Submitting…' : 'Submit claim on-chain'}
                  </Button>
                  <Button intent="secondary" onClick={onCancelClaim} disabled={isSubmittingRedeem}>
                    Cancel
                  </Button>
                </div>
              )}

              {redeemMessage ? (
                <Alert tone={redeemMessage.type === 'success' ? 'success' : redeemMessage.type === 'error' ? 'error' : 'info'}>
                  {redeemMessage.text}
                </Alert>
              ) : null}
            </div>
          )}
        </div>
      </Section>

      <Section title="Recent exchanges" description="Last 6 token-to-G$ exchanges">
        {exchangeHistory.length === 0 ? (
          <EmptyState
            icon="exchange"
            title="No exchanges yet"
            description="Exchanges between supported tokens and G$ will appear here."
          />
        ) : (
          <ul className="divide-y divide-[#EFEFEF]">
            {exchangeHistory.slice(0, 6).map((entry) => (
              <li
                key={`${entry.createdAt}-${entry.fromToken}-${entry.fromAmount}`}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-[#2D2D2D]">
                    {entry.fromAmount} {entry.fromToken} → {formatNumber(entry.gsReceived)} G$
                  </p>
                  <p className="text-[11px] text-[#888]">{formatDate(entry.createdAt)}</p>
                </div>
                <StatusBadge tone={entry.txHash ? 'success' : 'neutral'}>
                  {entry.txHash ? 'Synced' : 'Pending'}
                </StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

// ─── Section: Settings ──────────────────────────────────────────────────

function SettingsSection({
  wallet,
  publisherId,
  isRegisteredOnChain,
  onRefresh,
}: {
  wallet: string
  publisherId: string | null
  isRegisteredOnChain: boolean
  onRefresh: () => void
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Section
        title="Account"
        actions={
          <Button intent="secondary" size="sm" icon="rotate" onClick={onRefresh}>
            Refresh
          </Button>
        }
      >
        <ul className="divide-y divide-[#EFEFEF] text-[13px]">
          <li className="flex items-center justify-between gap-3 py-2">
            <span className="text-[#444]">Wallet</span>
            <span className="break-all font-mono text-[12px] text-[#2D2D2D]">{wallet || 'Not connected'}</span>
          </li>
          <li className="flex items-center justify-between gap-3 py-2">
            <span className="text-[#444]">Publisher ID</span>
            <span className="break-all font-mono text-[12px] text-[#2D2D2D]">{publisherId ?? 'Pending'}</span>
          </li>
          <li className="flex items-center justify-between gap-3 py-2">
            <span className="text-[#444]">On-chain registration</span>
            <StatusBadge tone={isRegisteredOnChain ? 'success' : 'neutral'}>
              {isRegisteredOnChain ? 'Enabled' : 'Not yet'}
            </StatusBadge>
          </li>
        </ul>
      </Section>

      <Section title="Security">
        <ul className="space-y-2 text-[13px] leading-5 text-[#444]">
          <li>Rotate API keys whenever a server secret may have been exposed.</li>
          <li>Keep secrets server-side. Only Site IDs belong in browser-facing SDK config.</li>
          <li>Withdrawals use your connected wallet — verify the active account before submitting transactions.</li>
        </ul>
      </Section>
    </div>
  )
}

