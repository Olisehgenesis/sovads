'use client'
/* eslint-disable react/no-unescaped-entities */

import { useEffect, useState, type ReactNode } from 'react'
import { parseUnits } from 'viem'
import { useAccount, useSignMessage, useWriteContract } from 'wagmi'

import WalletButton from '@/components/WalletButton'
import { useAds } from '@/hooks/useAds'
import { buildPublisherAuthMessage } from '@/lib/publisher-auth'
import { TREASURY_ADDRESS, SUPPORTED_EXCHANGE_TOKENS, ERC20_TRANSFER_ABI } from '@/lib/treasury-tokens'
import { getTokenInfo } from '@/lib/tokens'

import PublisherIcon from './PublisherIcon'
import PublisherPreviewModal from './PublisherPreviewModal'
import PublisherSidebar from './PublisherSidebar'
import { publisherSidebarItems, publisherTheme } from './publisher-config'
import type {
  CampaignVaultSummary,
  DailyStatEntry,
  ExchangeHistoryEntry,
  PublisherSectionId,
  PublisherSite,
  PublisherStats,
} from './models'

const GOOD_DOLLAR_ADDRESS = '0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A'

const inputClass = 'w-full'

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
    <section
      id={id}
      className="bg-white p-5 scroll-mt-24"
    >
      <div className="flex flex-col gap-3 border-b border-[#e5e5e5] pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {eyebrow ? <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#666666]">{eyebrow}</p> : null}
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
  icon: Parameters<typeof PublisherIcon>[0]['name']
  label: string
  value: string
  accent?: 'primary' | 'success'
  loading?: boolean
}) {
  return (
    <div className="rounded-lg border border-[#e5e5e5] bg-white p-4 transition-shadow duration-100 hover:shadow-sm">
      <span className={[
        'flex h-9 w-9 items-center justify-center rounded-md',
        accent === 'success' ? 'bg-[#22c55e] text-white' : 'bg-black text-white',
      ].join(' ')}>
        <PublisherIcon name={icon} className="h-4 w-4" />
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

  return <span className={`inline-flex items-center px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${toneClass}`}>{children}</span>
}

function formatDateLabel(value: string) {
  try {
    return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
  } catch {
    return value
  }
}

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export default function PublisherDashboard() {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const { writeContractAsync: writeTransfer } = useWriteContract()
  const { subscribePublisher, addSite, isPublisher, topUpCampaign, campaignCount, getCampaignVault } = useAds()

  const [stats, setStats] = useState<PublisherStats>({
    impressions: 0,
    clicks: 0,
    ctr: 0,
    totalRevenue: 0,
  })
  const [wallet, setWallet] = useState('')
  const [newDomain, setNewDomain] = useState('')
  const [sites, setSites] = useState<PublisherSite[]>([])
  const [isRegistered, setIsRegistered] = useState(false)
  const [isRegisteredOnChain, setIsRegisteredOnChain] = useState(false)
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

  const formatVaultAmount = (value: bigint | string | number, tokenAddress: string) => {
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

  const validateUrl = (url: string): { valid: boolean; domain: string | null; error: string | null } => {
    if (!url || url.trim() === '') {
      return { valid: false, domain: null, error: 'Website URL is required.' }
    }

    try {
      const normalized = url.trim().startsWith('http://') || url.trim().startsWith('https://') ? url.trim() : `https://${url.trim()}`
      const parsed = new URL(normalized)
      const domain = parsed.hostname.replace(/^www\./, '')
      if (domain === 'localhost' || domain === '127.0.0.1') {
        return { valid: true, domain, error: null }
      }

      const domainRegex = /^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/
      if (!domainRegex.test(domain)) {
        return { valid: false, domain: null, error: 'Enter a valid domain like example.com.' }
      }

      return { valid: true, domain, error: null }
    } catch {
      return { valid: false, domain: null, error: 'Enter a valid domain like example.com.' }
    }
  }

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

  const checkOnChainRegistration = async (walletAddress: string) => {
    try {
      const result = await isPublisher(walletAddress)
      setIsRegisteredOnChain(result === true)
    } catch (error) {
      console.error('Error checking on-chain registration:', error)
      setIsRegisteredOnChain(false)
    }
  }

  const loadPublisherData = async (walletAddress: string) => {
    // Step 1: publisher lookup — no auth required, must never be blocked by signing
    let publisherId: string | null = null
    try {
      const publisherResponse = await fetch(`/api/publishers/register?wallet=${walletAddress}`)
      if (publisherResponse.ok) {
        const publisherData = await publisherResponse.json()
        publisherId = publisherData.id as string
        setIsRegistered(true)
        setPublisherId(publisherId)
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

    // Step 2: sites — no auth required for GET (only public fields returned)
    if (!publisherId) return
    try {
      const sitesResponse = await fetch(`/api/publishers/sites?wallet=${walletAddress}`)
      if (sitesResponse.ok) {
        const sitesData = await sitesResponse.json()
        const dbSites = (sitesData.sites ?? []).map((site: PublisherSite) => ({
          ...site,
          apiSecret: site.apiSecret ?? undefined,
        }))
        setSites(dbSites)
      } else {
        setSites([])
      }
    } catch (error) {
      console.error('Error loading sites:', error)
      // Leave sites as-is; do not reset registration state
    }
  }

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
      return
    }

    setWallet('')
    setSites([])
    setSelectedSite(null)
    setIsRegistered(false)
    setIsRegisteredOnChain(false)
    setPublisherId(null)
    setAvailableBalance(0)
    setExchangeHistory([])
    setSovPoints(0)
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

  const handleSectionSelect = (sectionId: PublisherSectionId) => {
    setActiveSection(sectionId)
  }

  const copyToClipboard = async (text: string, label?: string) => {
    if (!text || !navigator.clipboard) {
      return
    }

    await navigator.clipboard.writeText(text)
    setCopyFeedback(label ?? 'Copied!')
    setTimeout(() => setCopyFeedback(null), 2000)
  }

  const registerPublisher = async () => {
    if (!wallet || !address) {
      return
    }

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
      handleSectionSelect('websites')
    } catch (error) {
      console.error('Error registering publisher:', error)
      setRegistrationError(error instanceof Error ? error.message : 'Registration failed.')
    } finally {
      setIsRegisteringOnChain(false)
    }
  }

  const addNewSite = async () => {
    if (!address) {
      return
    }

    const validation = validateUrl(newDomain)
    if (!validation.valid || !validation.domain) {
      setRegistrationError(validation.error || 'Enter a valid website URL.')
      return
    }

    setIsAddingSite(true)
    setRegistrationError(null)
    setRegistrationSuccess(null)

    try {
      if (isRegisteredOnChain) {
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
    if (!address) {
      return
    }

    try {
      const authHeaders = await getPublisherAuthHeaders(address)
      const response = await fetch(`/api/publishers/sites?siteId=${siteId}&wallet=${address}`, {
        method: 'DELETE',
        headers: authHeaders,
      })

      if (response.ok) {
        await loadPublisherData(address)
      }
    } catch (error) {
      console.error('Error removing site:', error)
    }
  }

  const rotateSiteCredentials = async (site: PublisherSite) => {
    if (!address) {
      return
    }

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
    if (!address || !topupAmount) {
      return
    }

    const token = SUPPORTED_EXCHANGE_TOKENS.find((item) => item.symbol === topupToken)
    if (!token) {
      return
    }

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

      if (!response.ok) {
        throw new Error('Failed to sync exchange with backend.')
      }

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
    if (!address || !fundCampaignId || !fundAmount) {
      return
    }

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
    if (!address || availableBalance <= 0) {
      return
    }

    setIsWithdrawing(true)
    setWithdrawError(null)
    setWithdrawSuccess(null)

    try {
      const response = await fetch('/api/publishers/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: address, amount: availableBalance }),
      })

      if (!response.ok) {
        throw new Error('Withdrawal failed.')
      }

      const data = await response.json()
      setWithdrawSuccess(`Withdrawn ${data.amount} G$.`)
      await loadBalance(address)
    } catch (error) {
      setWithdrawError(error instanceof Error ? error.message : 'Withdrawal failed.')
    } finally {
      setIsWithdrawing(false)
    }
  }

  const selectedSecret = selectedSite
    ? showApiSecret[selectedSite.id]
      ? newApiSecrets[selectedSite.id] || selectedSite.apiSecret || ''
      : ''
    : ''
  const envBlock = selectedSite
    ? `NEXT_PUBLIC_SOVADS_API_URL=https://ads.sovseas.xyz\nNEXT_PUBLIC_SOVADS_SITE_ID=${selectedSite.siteId}`
    : ''
  const exchangeEstimate = topupAmount
    ? Number(topupAmount) * (SUPPORTED_EXCHANGE_TOKENS.find((item) => item.symbol === topupToken)?.gsPerUnit || 10000)
    : 0

  return (
    <div className="min-h-screen bg-[#F5F3F0] text-[14px] text-[#141414]">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-5 xl:grid-cols-[240px_minmax(0,1fr)]">
          <PublisherSidebar
            items={publisherSidebarItems}
            activeSection={activeSection}
            onSelect={handleSectionSelect}
          />

          <div className="space-y-5">
            {!isConnected ? (
              <DashboardCard eyebrow="Access" title="Connect your wallet to open the publisher workspace">
                <div className="rounded-lg border border-dashed border-[#d1d1d1] bg-[#F5F3F0] p-6 text-center">
                  <p className="text-[14px] font-medium text-[#666666]">Connect a wallet to register a site, manage API credentials, fund campaigns, and withdraw G$.</p>
                  <div className="mt-4 flex justify-center">
                    <WalletButton
                      tone="dark"
                      className="!border-2 !border-black !bg-black !px-4 !py-2 !text-[11px] !font-black !uppercase !tracking-wider !text-white !shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                      connectedClassName="!border-2 !border-black !bg-white !px-4 !py-2 !text-[11px] !font-black !uppercase !tracking-wider !text-[#141414] !shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                    />
                  </div>
                </div>
              </DashboardCard>
            ) : !isRegistered ? (
              <DashboardCard id="websites" eyebrow="Onboarding" title="Register your first publisher website">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.9fr)]">
                  <div className="space-y-4 border-2 border-black bg-[#F5F3F0] p-4">
                    <div>
                      <p className="text-[14px] font-bold text-[#141414]">Start with one verified domain</p>
                      <p className="mt-1 text-[13px] leading-5 text-[#666666]">We will generate a site ID and API key for every approved website. Secrets stay server-side.</p>
                    </div>
                    <input
                      type="text"
                      value={newDomain}
                      onChange={(event) => setNewDomain(event.target.value)}
                      className="w-full"
                      placeholder="example.com"
                    />
                    {urlError ? <p className="text-[13px] font-semibold text-[#ef4444]">{urlError}</p> : null}
                    {registrationError ? <p className="text-[13px] font-semibold text-[#ef4444]">{registrationError}</p> : null}
                    {registrationSuccess ? <p className="text-[13px] font-semibold text-[#22c55e]">{registrationSuccess}</p> : null}
                    <button
                      type="button"
                      onClick={registerPublisher}
                      disabled={isRegisteringOnChain || !isUrlValid}
                      className="btn btn-primary btn-sm"
                    >
                      {isRegisteringOnChain ? 'Registering...' : 'Register publisher'}
                    </button>
                  </div>

                  <div className="space-y-3 border-2 border-black bg-white p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#666666]">Checklist</p>
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center border-2 border-black bg-black text-white">
                        <PublisherIcon name="websites" className="h-3.5 w-3.5" />
                      </span>
                      <div>
                        <p className="text-[13px] font-bold text-[#141414]">Use a production domain</p>
                        <p className="text-[12px] leading-5 text-[#666666]">Localhost is allowed for testing, but real payouts should use a live domain.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center border-2 border-black bg-black text-white">
                        <PublisherIcon name="copy" className="h-3.5 w-3.5" />
                      </span>
                      <div>
                        <p className="text-[13px] font-bold text-[#141414]">Save your credentials</p>
                        <p className="text-[12px] leading-5 text-[#666666]">A rotated API secret is only shown once. Keep it off the client.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center border-2 border-black bg-black text-white">
                        <PublisherIcon name="earnings" className="h-3.5 w-3.5" />
                      </span>
                      <div>
                        <p className="text-[13px] font-bold text-[#141414]">Withdraw when ready</p>
                        <p className="text-[12px] leading-5 text-[#666666]">Exchange supported tokens to G$ and withdraw accrued publisher earnings.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </DashboardCard>
            ) : (
              <>
                {activeSection === 'dashboard' && (
                <DashboardCard
                  id="dashboard"
                  eyebrow="Overview"
                  title="Publisher control center"
                  action={
                    <WalletButton
                      connectedAsButton
                      tone="dark"
                      className="!border-2 !border-black !bg-black !px-4 !py-2 !text-[11px] !font-black !uppercase !tracking-wider !text-white !shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                      connectedClassName="!border-2 !border-black !bg-white !px-4 !py-2 !text-[11px] !font-black !uppercase !tracking-wider !text-[#141414] !shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                    />
                  }
                >
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                    <div className="space-y-3 border-2 border-black bg-[#F5F3F0] p-4">
                      <p className="text-[14px] font-bold text-[#141414]">Ads that pay, in one publisher workspace.</p>
                      <p className="max-w-2xl text-[13px] leading-5 text-[#666666]">
                        Register websites, rotate SDK keys, exchange into G$, track SovPoints, and withdraw earnings without leaving the dashboard.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <StatusPill tone={isConnected ? 'success' : 'warning'}>{isConnected ? 'Wallet connected' : 'Wallet required'}</StatusPill>
                        <StatusPill tone={isRegistered ? 'success' : 'warning'}>{isRegistered ? 'Publisher active' : 'Publisher not registered'}</StatusPill>
                        <StatusPill tone={isRegisteredOnChain ? 'success' : 'neutral'}>{isRegisteredOnChain ? 'On-chain ready' : 'Awaiting on-chain setup'}</StatusPill>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                      <div className="border-2 border-black bg-white p-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#666666]">Wallet</p>
                        <p className="mt-2 break-all text-[13px] font-bold text-[#141414]">{wallet || 'Not connected'}</p>
                      </div>
                      <div className="border-2 border-black bg-white p-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#666666]">Publisher ID</p>
                        <p className="mt-2 break-all text-[13px] font-bold text-[#141414]">{publisherId ?? 'Pending registration'}</p>
                      </div>
                      <div className="border-2 border-black bg-white p-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#666666]">Sites</p>
                        <p className="mt-2 text-[14px] font-bold text-[#141414]">{sites.length}</p>
                      </div>
                    </div>
                  </div>
                </DashboardCard>
                )}

                {activeSection === 'analytics' && (
                <DashboardCard
                  id="analytics"
                  title="Performance snapshot"
                  eyebrow="Analytics"
                  action={
                    <div className="flex flex-wrap items-center gap-2">
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
                      {publisherId ? (
                        <button
                          type="button"
                          onClick={() => void loadStats(publisherId, statsDays)}
                          disabled={isStatsLoading}
                          className="btn btn-outline btn-sm"
                        >
                          {isStatsLoading ? 'Loading…' : 'Refresh'}
                        </button>
                      ) : null}
                    </div>
                  }
                >
                  {statsError && (
                    <div className="mb-4 flex items-center gap-3 border-2 border-black bg-[#fef2f2] p-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                      <span className="flex-1 text-[12px] font-black uppercase text-[#ef4444]">{statsError}</span>
                      {publisherId ? (
                        <button type="button" onClick={() => void loadStats(publisherId, statsDays)} className="btn btn-danger btn-sm">Retry</button>
                      ) : null}
                    </div>
                  )}
                  {!isStatsLoading && !statsError && stats.impressions === 0 && stats.clicks === 0 && sites.length > 0 && (
                    <div className="mb-4 flex items-start gap-3 border-2 border-black bg-[#F5F3F0] p-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                      <span className="mt-0.5 text-[14px]">📡</span>
                      <div>
                        <p className="text-[12px] font-black uppercase tracking-wide text-[#141414]">No ad activity yet</p>
                        <p className="mt-0.5 text-[12px] text-[#666666]">
                          Your sites are registered but no impressions have been tracked. Deploy the SDK snippet from the Integration section on your site to start serving ads.
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    <MetricCard icon="impressions" label="Impressions" value={stats.impressions.toLocaleString()} loading={isStatsLoading} />
                    <MetricCard icon="clicks" label="Clicks" value={stats.clicks.toLocaleString()} loading={isStatsLoading} />
                    <MetricCard icon="ctr" label="CTR" value={`${stats.ctr.toFixed(2)}%`} loading={isStatsLoading} />
                    <MetricCard icon="revenue" label="Revenue (G$)" value={stats.totalRevenue.toFixed(2)} accent="success" loading={isStatsLoading} />
                    <MetricCard icon="points" label="SovPoints" value={sovPoints.toLocaleString()} loading={isStatsLoading} />
                  </div>

                  {/* Daily breakdown table */}
                  {isStatsLoading ? (
                    <div className="mt-5 space-y-2">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-8 animate-pulse rounded bg-[#e5e5e5]" />
                      ))}
                    </div>
                  ) : dailyStats.length > 0 ? (
                    <div className="mt-5">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#666666]">Daily breakdown</p>
                        {statsLastRefresh ? (
                          <p className="text-[11px] text-[#999999]">Updated {statsLastRefresh.toLocaleTimeString()}</p>
                        ) : null}
                      </div>
                      <div className="overflow-x-auto border-2 border-black">
                        <table className="w-full text-[12px]">
                          <thead>
                            <tr className="border-b-2 border-black bg-[#141414] text-white">
                              <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider">Date</th>
                              <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-wider">Impr.</th>
                              <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-wider">Clicks</th>
                              <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-wider">CTR</th>
                              <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-wider">Revenue G$</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...dailyStats]
                              .sort((a, b) => b.date.localeCompare(a.date))
                              .slice(0, 30)
                              .map((row) => {
                                const rowCtr = row.impressions > 0 ? ((row.clicks / row.impressions) * 100).toFixed(2) : '0.00'
                                return (
                                  <tr key={row.date} className="border-b border-[#e5e5e5] bg-white even:bg-[#F5F3F0] hover:bg-[#eae8e4]">
                                    <td className="px-3 py-2 font-bold text-[#141414]">{formatDateLabel(row.date)}</td>
                                    <td className="px-3 py-2 text-right tabular-nums text-[#141414]">{row.impressions.toLocaleString()}</td>
                                    <td className="px-3 py-2 text-right tabular-nums text-[#141414]">{row.clicks.toLocaleString()}</td>
                                    <td className="px-3 py-2 text-right tabular-nums text-[#141414]">{rowCtr}%</td>
                                    <td className="px-3 py-2 text-right tabular-nums font-bold text-[#22c55e]">{row.revenue.toFixed(4)}</td>
                                  </tr>
                                )
                              })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : !statsError && stats.impressions > 0 ? (
                    <div className="mt-4 border border-[#e5e5e5] bg-[#F5F3F0] p-3">
                      <p className="text-[12px] text-[#666666]">No day-by-day breakdown available for this period.</p>
                    </div>
                  ) : null}
                </DashboardCard>
                )}

                {activeSection === 'websites' && (
                <DashboardCard id="websites" title="Website registry" eyebrow="Websites">
                  <div className="space-y-4">
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                      <input
                        type="text"
                        value={newDomain}
                        onChange={(event) => setNewDomain(event.target.value)}
                        className="w-full"
                        placeholder="add another domain"
                      />
                      <button
                        type="button"
                        onClick={addNewSite}
                        disabled={isAddingSite || !isUrlValid}
                        className="btn btn-primary btn-sm"
                      >
                        {isAddingSite ? 'Adding...' : 'Add site'}
                      </button>
                    </div>
                    {urlError ? <p className="text-[13px] font-semibold text-[#ef4444]">{urlError}</p> : null}
                    {registrationError ? <p className="text-[13px] font-semibold text-[#ef4444]">{registrationError}</p> : null}
                    {registrationSuccess ? <p className="text-[13px] font-semibold text-[#22c55e]">{registrationSuccess}</p> : null}

                    <div className="space-y-3">
                      {sites.length === 0 ? (
                        <div className="border-2 border-black bg-[#F5F3F0] p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                          <h3 className="text-base font-heading mb-2">No websites registered yet</h3>
                          <p className="text-sm text-[#666666] mb-4">Add your first domain above to receive a Site ID and API key. Once deployed, the SDK will start tracking impressions and paying you per real view.</p>
                          <p className="text-xs font-bold uppercase text-[#666666]">You will need a live domain or localhost for testing.</p>
                        </div>
                      ) : (
                        sites.map((site) => (
                          <div key={site.id} className="border-2 border-black bg-white p-4 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                              <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-[14px] font-bold text-[#141414]">{site.domain}</p>
                                  <StatusPill tone={site.verified ? 'success' : 'warning'}>{site.verified ? 'Verified' : 'Pending review'}</StatusPill>
                                  {selectedSite?.id === site.id ? <StatusPill tone="neutral">Selected</StatusPill> : null}
                                </div>
                                <div className="space-y-1 text-[12px] text-[#666666]">
                                  <p>Site ID: <span className="font-bold text-[#141414]">{site.siteId}</span></p>
                                  <p>API Key: <span className="font-bold text-[#141414] break-all">{site.apiKey || 'Not generated yet'}</span></p>
                                  <p>Created: <span className="font-bold text-[#141414]">{formatDateLabel(site.createdAt)}</span></p>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={() => setPreviewSiteId(site.siteId)} className="btn btn-outline btn-sm">Preview ad</button>
                                <button type="button" onClick={() => setSelectedSite(site)} className="btn btn-outline btn-sm">Use</button>
                                <button type="button" onClick={() => rotateSiteCredentials(site)} className="btn btn-outline btn-sm">Rotate keys</button>
                                <button type="button" onClick={() => removeSiteFromDB(site.id)} className="btn btn-danger btn-sm">Remove</button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </DashboardCard>
                )}

                {activeSection === 'integration' && (
                <DashboardCard
                  id="integration"
                  title={selectedSite ? `Integration and preview for ${selectedSite.domain}` : 'Integration and preview'}
                  eyebrow="Integration"
                  action={selectedSite ? <button type="button" onClick={() => setPreviewSiteId(selectedSite.siteId)} className="btn btn-outline btn-sm">Open preview</button> : null}
                >
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.85fr)]">
                    <div className="space-y-4 border-2 border-black bg-[#F5F3F0] p-4">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => void copyToClipboard(selectedSite?.siteId || '', 'Site ID copied!')} disabled={!selectedSite?.siteId} className="btn btn-outline btn-sm">Copy site ID</button>
                        <button type="button" onClick={() => void copyToClipboard(selectedSite?.apiKey || '', 'API key copied!')} disabled={!selectedSite?.apiKey} className="btn btn-outline btn-sm">Copy API key</button>
                        <button type="button" onClick={() => void copyToClipboard(selectedSecret, 'API secret copied!')} disabled={!selectedSecret} className="btn btn-outline btn-sm">Copy API secret</button>
                        <button type="button" onClick={() => void copyToClipboard(envBlock, 'Env block copied!')} disabled={!selectedSite} className="btn btn-outline btn-sm">Copy env block</button>
                      </div>

                      <div className="space-y-1 text-[12px] text-[#666666]">
                        <p>API Key: <span className="font-bold text-[#141414] break-all">{selectedSite?.apiKey || 'Select a site to load credentials.'}</span></p>
                        <p>
                          API Secret:{' '}
                          <span className="font-bold text-[#141414] break-all">
                            {selectedSite
                              ? showApiSecret[selectedSite.id]
                                ? newApiSecrets[selectedSite.id] || selectedSite.apiSecret || 'Not available'
                                : 'Hidden until a new secret is issued.'
                              : 'No site selected.'}
                          </span>
                        </p>
                        <p>Never expose secrets in NEXT_PUBLIC variables.</p>
                      </div>

                      <pre className="overflow-x-auto border-2 border-black bg-[#141414] p-4 text-[11px] leading-5 text-white"><code>{selectedSite ? `import { SovAds, Banner } from 'sovads-sdk'\n\nconst ads = new SovAds({\n  siteId: '${selectedSite.siteId}',\n  apiUrl: 'https://ads.sovseas.xyz'\n})\n\nconst banner = new Banner(ads, 'ad-container')\nawait banner.render()` : `Select a site to reveal the SDK snippet.`}</code></pre>
                    </div>

                    <div className="space-y-4">
                      <div className="border-2 border-black bg-white p-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#666666]">Live status</p>
                        <div className="mt-4 space-y-3 text-[12px] text-[#666666]">
                          <div className="flex items-center justify-between gap-4">
                            <span>Selected site</span>
                            <span className="font-bold text-[#141414]">{selectedSite?.domain || 'None'}</span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span>Publisher CTR</span>
                            <span className="font-bold text-[#141414]">{stats.ctr.toFixed(2)}%</span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span>Verified websites</span>
                            <span className="font-bold text-[#141414]">{sites.filter((site) => site.verified).length}</span>
                          </div>
                        </div>
                      </div>

                      <div className="border-2 border-black bg-[#F5F3F0] p-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#666666]">Best next step</p>
                        <p className="mt-2 text-[13px] font-bold text-[#141414]">Preview the selected placement before shipping it to production.</p>
                        <p className="mt-1 text-[12px] leading-5 text-[#666666]">Use Preview Ad to verify the site ID resolves and an active banner can render against the chosen placement.</p>
                      </div>
                    </div>
                  </div>
                </DashboardCard>
                )}

                {activeSection === 'earnings' && (
                <DashboardCard id="earnings" title="Earnings, exchange, and funding" eyebrow="Earnings">
                  <div className="grid gap-4 xl:grid-cols-3">
                    <div className="border-2 border-black bg-white p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#666666]">Token exchange</p>
                      <div className="mt-4 space-y-3">
                        <div className="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
                          <select value={topupToken} onChange={(event) => setTopupToken(event.target.value)} className="w-full">
                            {SUPPORTED_EXCHANGE_TOKENS.map((token) => (
                              <option key={token.symbol} value={token.symbol}>{token.symbol}</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            value={topupAmount}
                            onChange={(event) => setTopupAmount(event.target.value)}
                            placeholder="Amount"
                            className="w-full"
                          />
                        </div>
                        <p className="text-[12px] text-[#666666]">Estimated receive: <span className="font-bold text-[#141414]">{exchangeEstimate.toLocaleString()} G$</span></p>
                        <button type="button" onClick={handleTopupSubmit} disabled={isToppingUp || !topupAmount} className="btn btn-primary btn-sm">
                          {isToppingUp ? 'Processing...' : `Exchange ${topupToken} to G$`}
                        </button>
                        {topupSuccess ? <p className="text-[13px] font-semibold text-[#22c55e]">{topupSuccess}</p> : null}
                        {topupError ? <p className="text-[13px] font-semibold text-[#ef4444]">{topupError}</p> : null}
                      </div>
                    </div>

                    <div className="border-2 border-black bg-white p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#666666]">Fund campaign</p>
                      <div className="mt-4 space-y-3">
                        {campaignCount && Number(campaignCount) > 0 ? (
                          <select value={fundCampaignId} onChange={(event) => void handleCampaignSelect(event.target.value)} className="w-full">
                            <option value="">Select campaign</option>
                            {Array.from({ length: Number(campaignCount) }).map((_, index) => (
                              <option key={index + 1} value={index + 1}>#{index + 1}</option>
                            ))}
                          </select>
                        ) : (
                          <input type="number" value={fundCampaignId} onChange={(event) => setFundCampaignId(event.target.value)} placeholder="Campaign ID" className="w-full" />
                        )}
                        <input type="number" value={fundAmount} onChange={(event) => setFundAmount(event.target.value)} placeholder="Amount (G$)" className="w-full" />
                        {selectedCampaignVault ? (
                          <div className="border border-black bg-[#F5F3F0] p-3 text-[12px] text-[#666666]">
                            <p>Token: <span className="font-bold text-[#141414]">{getTokenInfo(selectedCampaignVault.token)?.symbol ?? selectedCampaignVault.token}</span></p>
                            <p>Funded: <span className="font-bold text-[#141414]">{formatVaultAmount(selectedCampaignVault.totalFunded, selectedCampaignVault.token)}</span></p>
                            <p>Locked: <span className="font-bold text-[#141414]">{formatVaultAmount(selectedCampaignVault.locked, selectedCampaignVault.token)}</span></p>
                            <p>Claimed: <span className="font-bold text-[#141414]">{formatVaultAmount(selectedCampaignVault.claimed, selectedCampaignVault.token)}</span></p>
                          </div>
                        ) : null}
                        {fundConfirmPending ? (
                          <div className="space-y-2 border-2 border-black bg-[#fef9c3] p-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                            <p className="text-[12px] font-bold text-[#141414]">Fund campaign #{fundCampaignId} with {fundAmount} G$?</p>
                            <div className="flex gap-2">
                              <button type="button" onClick={handleFundCampaign} disabled={isFunding} className="btn btn-primary btn-sm">
                                {isFunding ? 'Funding...' : 'Confirm'}
                              </button>
                              <button type="button" onClick={() => setFundConfirmPending(false)} className="btn btn-outline btn-sm">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <button type="button" onClick={handleFundCampaign} disabled={isFunding || !fundCampaignId || !fundAmount} className="btn btn-primary btn-sm">
                            Fund with G$
                          </button>
                        )}
                        {fundSuccess ? <p className="text-[13px] font-semibold text-[#22c55e]">{fundSuccess}</p> : null}
                        {fundError ? <p className="text-[13px] font-semibold text-[#ef4444]">{fundError}</p> : null}
                      </div>
                    </div>

                    <div className="border-2 border-black bg-white p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#666666]">Withdraw earnings</p>
                      <div className="mt-4 space-y-3">
                        <div className="border border-black bg-[#F5F3F0] p-3">
                          <p className="text-[12px] text-[#666666]">Available balance</p>
                          <p className="mt-1 text-[16px] font-black text-[#141414]">{availableBalance.toFixed(2)} G$</p>
                        </div>
                        <button type="button" onClick={handleWithdraw} disabled={isWithdrawing || availableBalance <= 0} className="btn btn-primary btn-sm">
                          {isWithdrawing ? 'Processing...' : 'Withdraw all'}
                        </button>
                        {withdrawSuccess ? <p className="text-[13px] font-semibold text-[#22c55e]">{withdrawSuccess}</p> : null}
                        {withdrawError ? <p className="text-[13px] font-semibold text-[#ef4444]">{withdrawError}</p> : null}
                      </div>
                    </div>
                  </div>
                </DashboardCard>
                )}

                {activeSection === 'rewards' && (
                <DashboardCard id="rewards" title="Rewards and exchange history" eyebrow="Rewards">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                    <div className="space-y-4 border-2 border-black bg-[#F5F3F0] p-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center border-2 border-black bg-black text-white">
                          <PublisherIcon name="points" className="h-5 w-5" />
                        </span>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#666666]">Earned SovPoints</p>
                          <p className="mt-1 text-[18px] font-black text-[#141414]">{sovPoints.toLocaleString()}</p>
                        </div>
                      </div>
                      <p className="text-[12px] leading-5 text-[#666666]">Viewer rewards and publisher engagement stay visible here so you can track attention-based performance in the same place as payout activity.</p>
                    </div>

                    <div className="border-2 border-black bg-white p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#666666]">Recent exchanges</p>
                      <div className="mt-4 space-y-3">
                        {exchangeHistory.length === 0 ? (
                          <div className="border border-black bg-[#F5F3F0] p-4 text-[12px] text-[#666666]">No exchange activity yet.</div>
                        ) : (
                          exchangeHistory.slice(0, 6).map((entry) => (
                            <div key={`${entry.createdAt}-${entry.fromToken}-${entry.fromAmount}`} className="flex flex-col gap-2 border border-black bg-[#F5F3F0] p-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-[13px] font-bold text-[#141414]">{entry.fromAmount} {entry.fromToken} to {entry.gsReceived.toLocaleString()} G$</p>
                                <p className="text-[12px] text-[#666666]">{formatDateLabel(entry.createdAt)}</p>
                              </div>
                              <StatusPill tone="neutral">{entry.txHash ? 'Synced' : 'Pending hash'}</StatusPill>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </DashboardCard>
                )}

                {activeSection === 'settings' && (
                <DashboardCard
                  id="settings"
                  title="Publisher settings and security"
                  eyebrow="Settings"
                  action={
                    address ? (
                      <button
                        type="button"
                        onClick={() => void loadPublisherData(address)}
                        className="btn btn-outline btn-sm"
                      >
                        Refresh data
                      </button>
                    ) : null
                  }
                >
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="border-2 border-black bg-white p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#666666]">Account</p>
                      <div className="mt-4 space-y-2 text-[12px] text-[#666666]">
                        <p>Wallet: <span className="font-bold text-[#141414] break-all">{wallet}</span></p>
                        <p>Publisher ID: <span className="font-bold text-[#141414] break-all">{publisherId ?? 'Pending'}</span></p>
                        <p>On-chain registration: <span className="font-bold text-[#141414]">{isRegisteredOnChain ? 'Enabled' : 'Not yet completed'}</span></p>
                      </div>
                    </div>
                    <div className="border-2 border-black bg-white p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#666666]">Security</p>
                      <div className="mt-4 space-y-2 text-[12px] leading-5 text-[#666666]">
                        <p>Rotate API keys whenever a server secret may have been exposed.</p>
                        <p>Keep secrets on the server. Only site IDs belong in browser-facing SDK config.</p>
                        <p>Withdrawals use your connected wallet, so verify the active account before submitting transactions.</p>
                      </div>
                    </div>
                  </div>
                </DashboardCard>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <PublisherPreviewModal siteId={previewSiteId} onClose={() => setPreviewSiteId(null)} />

      {copyFeedback ? (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 border-2 border-black bg-[#22c55e] px-4 py-3 text-[12px] font-black uppercase tracking-wider text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <PublisherIcon name="copy" className="h-4 w-4" />
          {copyFeedback}
        </div>
      ) : null}
    </div>
  )
}
