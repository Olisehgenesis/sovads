'use client'
/* eslint-disable react/no-unescaped-entities */

import { useState, useEffect } from 'react'
import { useAccount, useSignMessage, useWriteContract } from 'wagmi'
import { parseUnits } from 'viem'
import WalletButton from '@/components/WalletButton'
import { BannerAd, SidebarAd } from '@/components/ads/AdSlots'
import { useAds } from '@/hooks/useAds'
import { TREASURY_ADDRESS, SUPPORTED_EXCHANGE_TOKENS, ERC20_TRANSFER_ABI, GS_RATES } from '@/lib/treasury-tokens'
import { getTokenInfo } from '@/lib/tokens'
import { buildPublisherAuthMessage } from '@/lib/publisher-auth'
// Good Dollar (G$) token address (Celo mainnet)
const GOOD_DOLLAR_ADDRESS = '0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A'

interface PublisherStats {
  impressions: number
  clicks: number
  ctr: number
  totalRevenue: number
}

interface PublisherSite {
  id: string
  domain: string
  siteId: string
  apiKey?: string
  apiSecret?: string // Only shown once during generation
  verified: boolean
  createdAt: string
}

export default function PublisherDashboard() {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const { subscribePublisher, addSite, isPublisher, isLoading: contractLoading, topUpCampaign, campaignCount, getCampaignVault } = useAds()

  const [stats, setStats] = useState<PublisherStats>({
    impressions: 0,
    clicks: 0,
    ctr: 0,
    totalRevenue: 0
  })

  const [wallet, setWallet] = useState('')
  const [newDomain, setNewDomain] = useState('')
  const [sites, setSites] = useState<PublisherSite[]>([])
  const [onChainSites, setOnChainSites] = useState<string[]>([])
  const [isRegistered, setIsRegistered] = useState(false)
  const [isRegisteredOnChain, setIsRegisteredOnChain] = useState(false)
  const [isRegisteringOnChain, setIsRegisteringOnChain] = useState(false)
  const [isAddingSite, setIsAddingSite] = useState(false)

  const [registrationError, setRegistrationError] = useState<string | null>(null)
  const [registrationSuccess, setRegistrationSuccess] = useState<string | null>(null)
  const [selectedSite, setSelectedSite] = useState<PublisherSite | null>(null)
  const [activeTab, setActiveTab] = useState<'sdk' | 'script'>('sdk')
  const [showApiSecret, setShowApiSecret] = useState<Record<string, boolean>>({})
  const [newApiSecrets, setNewApiSecrets] = useState<Record<string, string>>({})
  const [domainCheckStatus, setDomainCheckStatus] = useState<{
    checking: boolean
    registeredOnChain: boolean
    registeredInDB: boolean
    domain: string
  } | null>(null)
  const [publisherId, setPublisherId] = useState<string | null>(null)
  const [isWithdrawing, setIsWithdrawing] = useState(false)
  const [withdrawError, setWithdrawError] = useState<string | null>(null)
  const [withdrawSuccess, setWithdrawSuccess] = useState<string | null>(null)
  const [availableBalance, setAvailableBalance] = useState(0)
  const [topupAmount, setTopupAmount] = useState('')
  const [topupToken, setTopupToken] = useState<string>('cUSD')
  const [exchangeHistory, setExchangeHistory] = useState<Array<{ fromToken: string; fromAmount: number; gsReceived: number; txHash?: string; createdAt: string }>>([])
  const [isToppingUp, setIsToppingUp] = useState(false)
  const [topupError, setTopupError] = useState<string | null>(null)
  const [topupSuccess, setTopupSuccess] = useState<string | null>(null)
  const [fundCampaignId, setFundCampaignId] = useState('')
  const [fundAmount, setFundAmount] = useState('')
  const [isFunding, setIsFunding] = useState(false)
  const [fundError, setFundError] = useState<string | null>(null)
  const [fundSuccess, setFundSuccess] = useState<string | null>(null)
  const [selectedCampaignVault, setSelectedCampaignVault] = useState<any | null>(null)

  const formatVaultAmount = (value: any, tokenAddress: string) => {
    try {
      if (value === null || value === undefined) return '0'
      const info = getTokenInfo(tokenAddress)
      const decimals = info?.decimals ?? 18
      const v = typeof value === 'bigint' ? value : BigInt(value)
      const base = BigInt(10) ** BigInt(decimals)
      const whole = v / base
      const frac = v % base
      const fracStr = frac.toString().padStart(decimals, '0').slice(0, Math.min(4, decimals))
      return `${whole.toString()}.${fracStr}`
    } catch (e) {
      return String(value)
    }
  }

  const { writeContractAsync: writeTransfer } = useWriteContract()
  const isChecking = Boolean(domainCheckStatus?.checking)
  const [isUrlValid, setIsUrlValid] = useState(false)
  const [urlError, setUrlError] = useState<string | null>(null)
  const [authCache, setAuthCache] = useState<{ wallet: string; signature: string; timestamp: number } | null>(null)

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

  useEffect(() => {
    if (isConnected && address) {
      setWallet(address)
      const loadData = async () => {
        await checkOnChainRegistration(address)
        await loadPublisherData(address)
      }
      loadData()
    } else {
      setIsRegisteredOnChain(false)
      setSites([])
      setOnChainSites([])
      setSelectedSite(null)
    }
  }, [isConnected, address])

  const checkOnChainRegistration = async (walletAddress: string) => {
    try {
      const isRegistered = await isPublisher(walletAddress)
      setIsRegisteredOnChain(isRegistered === true)
    } catch (error) {
      console.error('Error checking on-chain registration:', error)
      setIsRegisteredOnChain(false)
    }
  }

  const loadPublisherData = async (walletAddress: string) => {
    try {
      const authHeaders = await getPublisherAuthHeaders(walletAddress)
      const [publisherResponse, sitesResponse] = await Promise.all([
        fetch(`/api/publishers/register?wallet=${walletAddress}`),
        fetch(`/api/publishers/sites?wallet=${walletAddress}`, { headers: authHeaders })
      ])

      if (publisherResponse.ok) {
        const publisherData = await publisherResponse.json()
        setIsRegistered(true)
        setPublisherId(publisherData.id)
        loadStats(publisherData.id)
        loadBalance(walletAddress)
        loadExchangeHistory(walletAddress)
      }

      if (sitesResponse.ok) {
        const sitesData = await sitesResponse.json()
        const dbSites = (sitesData.sites ?? []).map((site: any) => ({
          ...site,
          apiSecret: site.apiSecret ?? undefined,
        }))
        setSites(dbSites)

        if (dbSites.length > 0 && !selectedSite) {
          setSelectedSite(dbSites[0])
        }
      }
    } catch (error) {
      console.error('Error loading publisher data:', error)
    }
  }

  const loadStats = async (publisherId: string) => {
    try {
      const response = await fetch(`/api/analytics?publisherId=${publisherId}&days=30`)
      if (response.ok) {
        const data = await response.json()
        setStats({
          impressions: data.impressions,
          clicks: data.clicks,
          ctr: data.ctr,
          totalRevenue: data.totalRevenue
        })
      }
    } catch (error) {
      console.error('Error loading stats:', error)
    }
  }

  const loadBalance = async (walletAddress: string) => {
    try {
      const res = await fetch(`/api/publishers/balance?wallet=${walletAddress}`)
      if (res.ok) {
        const data = await res.json()
        setAvailableBalance(data.available ?? 0)
      }
    } catch {
      setAvailableBalance(0)
    }
  }

  const loadExchangeHistory = async (walletAddress: string) => {
    try {
      const res = await fetch(`/api/publishers/exchange?wallet=${walletAddress}`)
      if (res.ok) {
        const data = await res.json()
        setExchangeHistory(data.exchanges ?? [])
      }
    } catch {
      setExchangeHistory([])
    }
  }

  const validateUrl = (url: string): { valid: boolean; domain: string | null; error: string | null } => {
    if (!url || url.trim() === '') {
      return { valid: false, domain: null, error: 'URL is required' }
    }
    const trimmedUrl = url.trim()
    try {
      const urlToParse = trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://')
        ? trimmedUrl
        : `https://${trimmedUrl}`
      const urlObj = new URL(urlToParse)
      let domain = urlObj.hostname.replace(/^www\./, '')
      if (domain === 'localhost' || domain === '127.0.0.1') {
        return { valid: true, domain, error: null }
      }
      const domainRegex = /^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/
      if (!domainRegex.test(domain)) {
        return { valid: false, domain: null, error: 'Invalid domain format' }
      }
      return { valid: true, domain, error: null }
    } catch (error) {
      return { valid: false, domain: null, error: 'Invalid URL format' }
    }
  }

  const checkDomainRegistration = async (domain: string): Promise<{ registeredInDB: boolean }> => {
    if (!domain || !address) return { registeredInDB: false }
    try {
      const authHeaders = await getPublisherAuthHeaders(address)
      const response = await fetch(`/api/publishers/sites?wallet=${address}`, { headers: authHeaders })
      if (response.ok) {
        const data = await response.json()
        const dbRegistered = (data.sites || []).some((site: PublisherSite) => site.domain === domain)
        return { registeredInDB: dbRegistered }
      }
      return { registeredInDB: false }
    } catch (error) {
      return { registeredInDB: false }
    }
  }

  const registerPublisher = async () => {
    if (!wallet || !newDomain || !address) return
    const validation = validateUrl(newDomain)
    if (!validation.valid || !validation.domain) {
      setRegistrationError(validation.error || 'Invalid URL format')
      return
    }
    setRegistrationError(null)
    setRegistrationSuccess(null)
    try {
      const domainToRegister = validation.domain
      setIsRegisteringOnChain(true)

      // Register on-chain
      if (!isRegisteredOnChain) {
        await subscribePublisher([domainToRegister])
        setIsRegisteredOnChain(true)
      } else {
        await addSite(domainToRegister)
      }

      // Register in DB
      const authHeaders = await getPublisherAuthHeaders(address)
      const response = await fetch('/api/publishers/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ wallet: address, domain: domainToRegister })
      })

      if (response.ok) {
        const data = await response.json()
        if (data.site?.apiSecret) {
          setNewApiSecrets(prev => ({ ...prev, [data.site.id]: data.site.apiSecret }))
          setShowApiSecret(prev => ({ ...prev, [data.site.id]: true }))
        }
        await loadPublisherData(address)
        setRegistrationSuccess(`✓ Successfully registered ${domainToRegister}!`)
        setNewDomain('')
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to save to database')
      }
    } catch (error) {
      console.error('Error registering publisher:', error)
      setRegistrationError(error instanceof Error ? error.message : 'Registration failed')
    } finally {
      setIsRegisteringOnChain(false)
    }
  }

  const addNewSite = async () => {
    if (!newDomain || !address) return
    const validation = validateUrl(newDomain)
    if (!validation.valid || !validation.domain) {
      setRegistrationError(validation.error || 'Invalid URL format')
      return
    }
    setIsAddingSite(true)
    setRegistrationError(null)
    try {
      const domainToAdd = validation.domain
      if (isRegisteredOnChain) {
        await addSite(domainToAdd)
      }
      const authHeaders = await getPublisherAuthHeaders(address)
      const response = await fetch('/api/publishers/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ wallet: address, domain: domainToAdd })
      })
      if (response.ok) {
        const data = await response.json()
        if (data.site?.apiSecret) {
          setNewApiSecrets(prev => ({ ...prev, [data.site.id]: data.site.apiSecret }))
          setShowApiSecret(prev => ({ ...prev, [data.site.id]: true }))
        }
        await loadPublisherData(address)
        setNewDomain('')
        setRegistrationSuccess(`Successfully added ${domainToAdd}!`)
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to add site')
      }
    } catch (error) {
      setRegistrationError(error instanceof Error ? error.message : 'Failed to add site')
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
      if (response.ok) {
        await loadPublisherData(address)
        if (selectedSite?.id === siteId) setSelectedSite(null)
      }
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
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to rotate credentials')
      }

      const data = await response.json()
      if (data.site?.apiSecret) {
        setNewApiSecrets((prev) => ({ ...prev, [site.id]: data.site.apiSecret }))
        setShowApiSecret((prev) => ({ ...prev, [site.id]: true }))
      }
      await loadPublisherData(address)
      setSelectedSite((prev) => (prev?.id === site.id ? { ...prev, apiKey: data.site?.apiKey } : prev))
      setRegistrationSuccess(`Rotated API credentials for ${site.domain}`)
    } catch (error) {
      setRegistrationError(error instanceof Error ? error.message : 'Failed to rotate credentials')
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  if (!isConnected) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="glass-card rounded-lg p-6 text-center">
          <h2 className="text-sm font-semibold mb-3 uppercase tracking-wider">Connect Your Wallet</h2>
          <p className="text-[var(--text-secondary)] text-[11px] mb-4">Connect your wallet to register as a publisher and start earning</p>
          <WalletButton />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-8">
      <h1 className="text-base font-bold text-[var(--text-primary)] uppercase tracking-wider">Publisher Dashboard</h1>

      {!isRegistered ? (
        <div className="glass-card rounded-lg p-6">
          <h2 className="text-sm font-semibold mb-4 uppercase tracking-wider">Register Your First Website</h2>
          <div className="space-y-4">
            <input
              type="text"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              className="w-full px-3 py-2 bg-input border border-border rounded-md text-[11px]"
              placeholder="example.com"
            />
            {registrationError && <p className="text-xs text-destructive">{registrationError}</p>}
            {registrationSuccess && <p className="text-xs text-green-600">{registrationSuccess}</p>}
            <button
              onClick={registerPublisher}
              disabled={isRegisteringOnChain || !newDomain}
              className="w-full btn btn-primary py-2"
            >
              {isRegisteringOnChain ? 'Registering...' : 'Register Publisher'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Impressions', value: stats.impressions.toLocaleString() },
              { label: 'Clicks', value: stats.clicks.toLocaleString() },
              { label: 'CTR', value: `${stats.ctr.toFixed(2)}%` },
              { label: 'Total Revenue (GS)', value: stats.totalRevenue.toFixed(2) }
            ].map(s => (
              <div key={s.label} className="glass-card rounded-lg p-4">
                <div className="text-lg font-bold">{s.value}</div>
                <div className="text-[var(--text-secondary)] text-[10px] uppercase tracking-tight">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="glass-card rounded-lg p-4">
            <h2 className="text-xs font-semibold mb-4 uppercase tracking-wider">Your Websites</h2>
            <div className="space-y-4">
              {sites.map(site => (
                <div key={site.id} className="bg-muted/30 border border-border rounded-lg p-4 flex justify-between items-center">
                  <div>
                    <div className="font-medium text-sm">{site.domain}</div>
                    <div className="text-[10px] text-[var(--text-secondary)]">ID: {site.siteId}</div>
                    <div className="text-[10px] text-[var(--text-secondary)]">API Key: {site.apiKey || 'Not generated'}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setSelectedSite(site)}
                      className="text-xs text-[var(--text-primary)] hover:underline"
                    >
                      Use
                    </button>
                    <button
                      onClick={() => rotateSiteCredentials(site)}
                      className="text-xs text-[var(--text-primary)] hover:underline"
                    >
                      Rotate Keys
                    </button>
                    <button
                      onClick={() => removeSiteFromDB(site.id)}
                      className="text-xs text-destructive hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-input border border-border rounded-md text-[11px]"
                  placeholder="newsite.com"
                />
                <button
                  onClick={addNewSite}
                  disabled={isAddingSite || !newDomain}
                  className="btn btn-primary px-4 py-1.5 text-xs"
                >
                  {isAddingSite ? 'Adding...' : 'Add Site'}
                </button>
              </div>
            </div>
          </div>

          {selectedSite && (
            <div className="glass-card rounded-lg p-4">
              <h2 className="text-xs font-semibold mb-4 uppercase tracking-wider">Integration Code: {selectedSite.domain}</h2>
              {(() => {
                const selectedSecret =
                  (showApiSecret[selectedSite.id]
                    ? (newApiSecrets[selectedSite.id] || selectedSite.apiSecret || '')
                    : '')
                const envBlock = `NEXT_PUBLIC_SOVADS_API_URL=http://localhost:3000
NEXT_PUBLIC_SOVADS_SITE_ID=${selectedSite.siteId}`
                return (
                  <div className="mb-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => copyToClipboard(selectedSite.siteId)}
                      className="text-[10px] px-2 py-1 rounded border border-border hover:bg-muted/40"
                    >
                      Copy Site ID
                    </button>
                    <button
                      onClick={() => copyToClipboard(selectedSite.apiKey || '')}
                      className="text-[10px] px-2 py-1 rounded border border-border hover:bg-muted/40"
                      disabled={!selectedSite.apiKey}
                    >
                      Copy API Key
                    </button>
                    <button
                      onClick={() => copyToClipboard(selectedSecret)}
                      className="text-[10px] px-2 py-1 rounded border border-border hover:bg-muted/40"
                      disabled={!selectedSecret}
                    >
                      Copy API Secret
                    </button>
                    <button
                      onClick={() => copyToClipboard(envBlock)}
                      className="text-[10px] px-2 py-1 rounded border border-border hover:bg-muted/40"
                    >
                      Copy .env Block
                    </button>
                  </div>
                )
              })()}
              <div className="mb-3 text-[11px] text-[var(--text-secondary)]">
                <div>API Key: <span className="text-[var(--text-primary)]">{selectedSite.apiKey || 'Not generated'}</span></div>
                <div>
                  API Secret:
                  <span className="text-[var(--text-primary)] ml-1">
                    {showApiSecret[selectedSite.id]
                      ? (newApiSecrets[selectedSite.id] || selectedSite.apiSecret || 'Not available')
                      : '•••••••• (use Rotate Keys to issue a new secret)'}
                  </span>
                </div>
                <div className="mt-1">Use API key/secret on your server only. Do not put secrets in `NEXT_PUBLIC_*` env.</div>
              </div>
              <pre className="bg-neutral-950 text-neutral-100 text-[10px] p-4 rounded-lg overflow-x-auto">
                <code>{`// Install: npm install @sovads/sdk
import { SovAds, Banner } from '@sovads/sdk';

const adsClient = new SovAds({
  siteId: '${selectedSite.siteId}',
  apiUrl: 'https://ads.sovseas.xyz'
});

const banner = new Banner(adsClient, 'banner-id');
await banner.render();`}</code>
              </pre>
            </div>
          )}

          <div className="glass-card rounded-lg p-4">
            <h2 className="text-xs font-semibold mb-4 uppercase tracking-wider">Exchange Tokens for G$</h2>
            <div className="space-y-4">
              <div className="flex gap-2">
                <select
                  value={topupToken}
                  onChange={(e) => setTopupToken(e.target.value)}
                  className="bg-input border border-border rounded-md px-2 py-1.5 text-xs outline-none"
                >
                  {SUPPORTED_EXCHANGE_TOKENS.map(t => (
                    <option key={t.symbol} value={t.symbol}>{t.symbol}</option>
                  ))}
                </select>
                <input
                  type="number"
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(e.target.value)}
                  placeholder="Amount"
                  className="flex-1 bg-input border border-border rounded-md px-3 py-1.5 text-xs outline-none"
                />
              </div>

              {topupAmount && (
                <div className="text-[10px] text-[var(--text-secondary)] uppercase">
                  Estimated: {(Number(topupAmount) * (SUPPORTED_EXCHANGE_TOKENS.find(t => t.symbol === topupToken)?.gsPerUnit || 10000)).toLocaleString()} G$
                </div>
              )}

              <button
                onClick={async () => {
                  if (!address || !topupAmount) return
                  const token = SUPPORTED_EXCHANGE_TOKENS.find(t => t.symbol === topupToken)
                  if (!token) return

                  setIsToppingUp(true)
                  setTopupError(null)
                  setTopupSuccess(null)

                  try {
                    const amountWei = parseUnits(topupAmount, token.decimals)

                    // Step 1: Transfer to Treasury
                    const txHash = await writeTransfer({
                      address: token.address,
                      abi: ERC20_TRANSFER_ABI,
                      functionName: 'transfer',
                      args: [TREASURY_ADDRESS, amountWei]
                    })

                    // Step 2: Notify backend
                    const res = await fetch('/api/publishers/topup', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        wallet: address,
                        amount: Number(topupAmount),
                        token: topupToken,
                        txHash
                      })
                    })

                    if (res.ok) {
                      setTopupSuccess('Exchange successful! Your G$ balance will update shortly.')
                      setTopupAmount('')
                      loadBalance(address)
                      loadExchangeHistory(address)
                    } else {
                      throw new Error('Failed to sync with backend')
                    }
                  } catch (e) {
                    setTopupError(e instanceof Error ? e.message : 'Exchange failed')
                  } finally {
                    setIsToppingUp(false)
                  }
                }}
                disabled={isToppingUp || !topupAmount}
                className="w-full btn btn-primary py-2 text-xs"
              >
                {isToppingUp ? 'Processing...' : `Exchange ${topupToken} to G$`}
              </button>
              {topupSuccess && <p className="text-xs text-green-600">{topupSuccess}</p>}
              {topupError && <p className="text-xs text-destructive">{topupError}</p>}
            </div>
          </div>

          <div className="glass-card rounded-lg p-4">
            <h2 className="text-xs font-semibold mb-4 uppercase tracking-wider">Fund Campaign (Good Dollar)</h2>
            <div className="space-y-3">
              {campaignCount && Number(campaignCount) > 0 ? (
                <select
                  value={fundCampaignId}
                  onChange={async (e) => {
                    setFundCampaignId(e.target.value)
                    // load vault info for selected campaign
                    try {
                      const vault = await getCampaignVault(Number(e.target.value))
                      setSelectedCampaignVault(vault)
                    } catch (err) {
                      setSelectedCampaignVault(null)
                    }
                  }}
                  className="w-full px-3 py-2 bg-input border border-border rounded-md text-[11px]"
                >
                  <option value="">Select campaign</option>
                  {Array.from({ length: Number(campaignCount) }).map((_, i) => (
                    <option key={i + 1} value={i + 1}>#{i + 1}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="number"
                  value={fundCampaignId}
                  onChange={(e) => setFundCampaignId(e.target.value)}
                  placeholder="Campaign ID"
                  className="w-full px-3 py-2 bg-input border border-border rounded-md text-[11px]"
                />
              )}
              <input
                type="number"
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
                placeholder="Amount (G$)"
                className="w-full px-3 py-2 bg-input border border-border rounded-md text-[11px]"
              />
              {selectedCampaignVault && (
                <div className="text-[12px] text-[var(--text-secondary)] space-y-1">
                  <div>Token: {getTokenInfo(selectedCampaignVault.token)?.symbol ?? selectedCampaignVault.token}</div>
                  <div>Funded: {formatVaultAmount(selectedCampaignVault.totalFunded, selectedCampaignVault.token)}</div>
                  <div>Locked: {formatVaultAmount(selectedCampaignVault.locked, selectedCampaignVault.token)}</div>
                  <div>Claimed: {formatVaultAmount(selectedCampaignVault.claimed, selectedCampaignVault.token)}</div>
                </div>
              )}
              <button
                onClick={async () => {
                  if (!address || !fundCampaignId || !fundAmount) return
                  const ok = window.confirm(`Fund campaign #${fundCampaignId} with ${fundAmount} G$?`)
                  if (!ok) return
                  setIsFunding(true)
                  setFundError(null)
                  setFundSuccess(null)
                  try {
                    const txHash = await topUpCampaign(Number(fundCampaignId), fundAmount, GOOD_DOLLAR_ADDRESS)
                    if (txHash) {
                      setFundSuccess(`Campaign funded on-chain. Tx: ${txHash}`)
                    } else {
                      setFundSuccess('Campaign funded (tx submitted).')
                    }
                    setFundCampaignId('')
                    setFundAmount('')
                  } catch (e) {
                    setFundError(e instanceof Error ? e.message : 'Funding failed')
                  } finally {
                    setIsFunding(false)
                  }
                }}
                disabled={isFunding || !fundCampaignId || !fundAmount}
                className="w-full btn btn-primary py-2 text-xs"
              >
                {isFunding ? 'Funding...' : 'Fund with G$'}
              </button>
              {fundSuccess && <p className="text-xs text-green-600">{fundSuccess}</p>}
              {fundError && <p className="text-xs text-destructive">{fundError}</p>}
            </div>
          </div>

          <div className="glass-card rounded-lg p-4">
            <h2 className="text-xs font-semibold mb-4 uppercase tracking-wider">Withdraw Earnings (G$)</h2>
            <div className="space-y-4">
              <div className="text-sm">Available: <span className="font-bold">{availableBalance.toFixed(2)}</span> G$</div>
              <button
                onClick={async () => {
                  if (!address || availableBalance <= 0) return
                  setIsWithdrawing(true)
                  try {
                    const res = await fetch('/api/publishers/withdraw', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ wallet: address, amount: availableBalance })
                    })
                    if (res.ok) {
                      const data = await res.json()
                      setWithdrawSuccess(`Withdrawn ${data.amount} G$!`)
                      loadBalance(address)
                    }
                  } catch (e) {
                    setWithdrawError('Withdrawal failed')
                  } finally {
                    setIsWithdrawing(false)
                  }
                }}
                disabled={isWithdrawing || availableBalance <= 0}
                className="btn btn-primary px-6 py-2"
              >
                {isWithdrawing ? 'Processing...' : 'Withdraw All'}
              </button>
              {withdrawSuccess && <p className="text-xs text-green-600">{withdrawSuccess}</p>}
              {withdrawError && <p className="text-xs text-destructive">{withdrawError}</p>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
