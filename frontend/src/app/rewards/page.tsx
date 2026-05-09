'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAccount, useWalletClient, useWriteContract, useChainId } from 'wagmi'
import Link from 'next/link'
import WalletButton from '@/components/WalletButton'
import { useStreamingAds } from '@/hooks/useStreamingAds'
import { useEngagementRewards } from '@/hooks/useEngagementRewards'
import { useRefParam } from '@/hooks/useRefParam'
import { encodeFunctionData, parseUnits, formatUnits, createPublicClient, http, zeroAddress } from 'viem'
import { celo } from 'viem/chains'
import { sovAdsStreamingAbi } from '@/contract/sovAdsStreamingAbi'
import {
  CELO_MAINNET_CHAIN_ID,
  GOODDOLLAR_IDENTITY_ADDRESS,
  GOODDOLLAR_UBI_ADDRESS,
} from '@/lib/chain-config'

const STREAMING_CONTRACT = (process.env.NEXT_PUBLIC_SOVADS_STREAMING_ADDRESS || '0xFb76103FC70702413cEa55805089106D0626823f').trim()

// Static Celo client for chain reads without needing wallet connection
const celoClient = createPublicClient({
  chain: celo,
  transport: http(
    (process.env.NEXT_PUBLIC_CELO_MAINNET_RPC_URL || 'https://forno.celo.org').trim()
  ),
  batch: { multicall: false },
})

const identityAbi = [
  { name: 'getWhitelistedRoot', type: 'function', stateMutability: 'view', inputs: [{ name: '_addr', type: 'address' }], outputs: [{ name: '', type: 'address' }] },
] as const

const ubiAbi = [
  { name: 'checkEntitlement', type: 'function', stateMutability: 'view', inputs: [{ name: '_claimer', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'claim', type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
] as const

interface ViewerPoints {
  id?: string
  wallet: string | null
  fingerprint: string | null
  totalPoints: number
  claimedPoints: number
  pendingPoints: number
  lastInteraction: string | null
}

interface Cashout {
  id: string
  amount: number
  status: string
  redeemed: boolean
  redeemedAt: string | null
  redeemTxHash: string | null
  claimRef: string | null
  signature: string | null
  nonce: string | null
  deadline: string | null
  initiateTxHash: string | null
  distributeTxHash: string | null
  createdAt: string
}

interface SignedTransaction {
  to: string
  functionName: string
  args: {
    recipient: string
    amount: string
    claimRef: string
    nonce: string
    deadline: string
    signature: string
  }
  operator: string
}

const MIN_CASHOUT = 10

export default function RewardsPage() {
  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const chainId = useChainId()
  const { writeContractAsync } = useWriteContract()
  const [points, setPoints] = useState<ViewerPoints | null>(null)
  const [loading, setLoading] = useState(true)
  const [cashouts, setCashouts] = useState<Cashout[]>([])
  const [cashoutAmount, setCashoutAmount] = useState('')
  const [cashouting, setCashouting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [fingerprint, setFingerprint] = useState<string | null>(null)

  // Signed transaction state
  const [signedTx, setSignedTx] = useState<SignedTransaction | null>(null)
  const [pendingCashoutId, setPendingCashoutId] = useState<string | null>(null)
  const [submittingTx, setSubmittingTx] = useState(false)
  const [totalRedeemed, setTotalRedeemed] = useState(0)

  // Redeem modal state
  const [showRedeemModal, setShowRedeemModal] = useState(false)

  // Superfluid Flow State
  const { getStakerInfo } = useStreamingAds();
  const [isFlowing, setIsFlowing] = useState(false);

  // ── Faucet state ──────────────────────────────────────────────────────
  const [faucetStatus, setFaucetStatus] = useState<'idle' | 'pending' | 'funded' | 'sufficient' | 'error'>('idle')

  // ── Step notifications ────────────────────────────────────────────────
  type NotifType = 'info' | 'success' | 'error'
  const [notifications, setNotifications] = useState<{ id: number; text: string; type: NotifType }[]>([])
  const notifIdRef = useRef(0)

  const addNotif = useCallback((text: string, type: NotifType = 'info'): number => {
    const id = ++notifIdRef.current
    setNotifications(prev => [...prev, { id, text, type }])
    return id
  }, [])

  const updateNotif = useCallback((id: number, text: string, type: NotifType) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, text, type } : n))
  }, [])

  const dismissNotif = useCallback((id: number, delay = 0) => {
    if (delay > 0) {
      setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), delay)
    } else {
      setNotifications(prev => prev.filter(n => n.id !== id))
    }
  }, [])

  // Shared faucet helper used by both claim flows
  const callFaucet = useCallback(async (): Promise<number> => {
    const id = addNotif('⛽ Requesting gas top-up…')
    try {
      const res = await fetch('/api/topWallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chainId: CELO_MAINNET_CHAIN_ID, account: address }),
      })
      const data = await res.json().catch(() => ({ ok: -1 }))
      if (data.ok > 0) {
        updateNotif(id, '✓ Gas topped up', 'success')
        setFaucetStatus('funded')
      } else if (data.ok === 0) {
        updateNotif(id, '✓ Gas already sufficient', 'success')
        setFaucetStatus('sufficient')
      } else {
        updateNotif(id, '⚠ Gas top-up unavailable (you may need CELO)', 'error')
        setFaucetStatus('error')
      }
    } catch {
      updateNotif(id, '⚠ Could not reach faucet', 'error')
      setFaucetStatus('error')
    }
    dismissNotif(id, 3000)
    return id
  }, [address, addNotif, updateNotif, dismissNotif])

  // Call faucet when wallet connects to ensure gas on Celo
  useEffect(() => {
    if (!address || !isConnected) { setFaucetStatus('idle'); return }
    setFaucetStatus('pending')
    callFaucet()
  }, [address, isConnected]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Daily GoodDollar UBI claim state ──────────────────────────────────
  const [gdVerified, setGdVerified] = useState<boolean | null>(null)
  const [gdEntitlement, setGdEntitlement] = useState<bigint | null>(null)
  const [gdClaimedToday, setGdClaimedToday] = useState(false)
  const [gdClaimLoading, setGdClaimLoading] = useState(false)
  const [gdClaimTx, setGdClaimTx] = useState<string | null>(null)
  const [gdClaimError, setGdClaimError] = useState<string | null>(null)

  const refreshGdStatus = useCallback(async () => {
    if (!address || !isConnected) { setGdVerified(null); setGdEntitlement(null); return }
    const identityAddr = GOODDOLLAR_IDENTITY_ADDRESS as `0x${string}`
    const ubiAddr = GOODDOLLAR_UBI_ADDRESS as `0x${string}`
    if (!identityAddr || !ubiAddr) return
    try {
      const root = await celoClient.readContract({ address: identityAddr, abi: identityAbi, functionName: 'getWhitelistedRoot', args: [address] }) as `0x${string}`
      const isVerified = root.toLowerCase() !== zeroAddress
      setGdVerified(isVerified)
      if (isVerified) {
        const entitlement = await celoClient.readContract({ address: ubiAddr, abi: ubiAbi, functionName: 'checkEntitlement', args: [root] }) as bigint
        setGdEntitlement(entitlement)
        setGdClaimedToday(entitlement === 0n)
      } else {
        setGdEntitlement(0n)
        setGdClaimedToday(false)
      }
    } catch {
      setGdVerified(false)
    }
  }, [address, isConnected])

  useEffect(() => { refreshGdStatus() }, [refreshGdStatus])

  const handleGdClaim = useCallback(async () => {
    const ubiAddr = GOODDOLLAR_UBI_ADDRESS as `0x${string}`
    if (!ubiAddr || !writeContractAsync || chainId !== CELO_MAINNET_CHAIN_ID) return
    setGdClaimLoading(true)
    setGdClaimError(null)

    // Step 1: faucet
    await callFaucet()

    const claimId = addNotif('✍ Confirm claim in your wallet…')
    try {
      const tx = await writeContractAsync({ address: ubiAddr, abi: ubiAbi, functionName: 'claim', chainId: CELO_MAINNET_CHAIN_ID })
      updateNotif(claimId, '⛓ Submitting to blockchain…', 'info')
      setGdClaimTx(tx)
      updateNotif(claimId, '✅ Daily G$ claimed!', 'success')
      dismissNotif(claimId, 5000)
      await refreshGdStatus()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Claim failed'
      setGdClaimError(msg)
      updateNotif(claimId, `✗ ${msg.slice(0, 60)}`, 'error')
      dismissNotif(claimId, 5000)
    } finally {
      setGdClaimLoading(false)
    }
  }, [address, chainId, callFaucet, addNotif, updateNotif, dismissNotif, refreshGdStatus, writeContractAsync])

  // Generate fingerprint for anonymous users
  useEffect(() => {
    const generateFingerprint = async () => {
      try {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        ctx?.fillText('SovAds fingerprint', 10, 10)

        const fp = [
          navigator.userAgent,
          navigator.language,
          screen.width + 'x' + screen.height,
          new Date().getTimezoneOffset(),
          canvas.toDataURL()
        ].join('|')

        const encoded = btoa(fp).substring(0, 16)
        setFingerprint(encoded)
      } catch (error) {
        console.error('Error generating fingerprint:', error)
      }
    }

    if (!isConnected) {
      generateFingerprint()
    }
  }, [isConnected])

  const loadPoints = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (address) {
        params.append('wallet', address.toLowerCase())
      } else if (fingerprint) {
        params.append('fingerprint', fingerprint)
      }

      if (!address && !fingerprint) {
        setLoading(false)
        return
      }

      const response = await fetch(`/api/viewers/points?${params}`)
      if (response.ok) {
        const data = await response.json()
        setPoints(data)
      }
    } catch (error) {
      console.error('Error loading points:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadCashouts = async () => {
    if (!address) return
    try {
      const res = await fetch(`/api/viewers/redeem?wallet=${address.toLowerCase()}`)
      if (res.ok) {
        const data = await res.json()
        setCashouts(data.redemptions || [])
        setTotalRedeemed(data.totalRedeemed || 0)
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (address || fingerprint) {
      loadPoints()
      const interval = setInterval(loadPoints, 30000)
      return () => clearInterval(interval)
    }
  }, [address, fingerprint])

  useEffect(() => {
    if (address) {
      loadCashouts()
    }
  }, [address])

  // Engagement Rewards (GoodDollar bonus)
  const {
    isEligible: engagementEligible,
    isWhitelisted,
    ineligibilityReason,
    isClaiming: engagementClaiming,
    lastClaimTx: engagementLastTx,
    lastClaimDate: engagementLastDate,
    cooldownDaysRemaining,
    rewardAmount: engagementRewardAmount,
    error: engagementError,
    claimBonus,
    refreshEligibility,
    verifyOnGoodDollar,
    isVerifying: engagementVerifying,
  } = useEngagementRewards()

  // Inviter: read from URL ?ref=<address> (persisted across navigation).
  // Fallback to the SovAds app wallet so referral rewards always have a destination.
  const DEFAULT_INVITER = '0x8aE67ce409dA16e71Cda5f71465e563Fe2060b92'
  const { ref: refParam } = useRefParam()
  // Don't self-refer — if user is their own ref, use default
  const inviterAddress = (refParam && refParam.toLowerCase() !== address?.toLowerCase())
    ? refParam
    : DEFAULT_INVITER

  // Use gdVerified (from direct chain read on this page) as source of truth for whitelist.
  // The hook's isWhitelisted may lag or fail if the SDK isn't ready yet.
  const effectiveWhitelisted = gdVerified !== null ? gdVerified : isWhitelisted

  // Map SDK ineligibility reasons to effective reasons:
  // - Override 'not_whitelisted' when we independently verified the user IS whitelisted
  // - 'cooldown' and 'app_limit' are trusted and block the claim
  // - 'app_limit' can mean: (a) user hit 4th-app period limit, or (b) app pending approval
  //   Either way, the claim will fail — block and surface a clear message.
  const effectiveIneligibilityReason =
    effectiveWhitelisted === true && ineligibilityReason === 'not_whitelisted'
      ? null
      : ineligibilityReason === 'cooldown'
      ? 'cooldown'
      : ineligibilityReason === 'app_limit'
      ? 'app_limit'
      : ineligibilityReason === 'not_whitelisted'
      ? 'not_whitelisted'
      : null

  // A user can claim only when fully eligible — no hard blocks
  const canClaimEngagement =
    isConnected &&
    effectiveWhitelisted === true &&
    effectiveIneligibilityReason === null &&
    !engagementClaiming

  // Engagement claim result message
  const [engagementMsg, setEngagementMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleEngagementClaim = async () => {
    setEngagementMsg(null)

    // Step 1: faucet
    await callFaucet()

    // Step 2: claim (app sig + user sig + chain submit all happen inside claimBonus)
    const claimId = addNotif('🔐 Getting app signature…')
    try {
      updateNotif(claimId, '✍ Sign claim in wallet (check wallet)…', 'info')
      const tx = await claimBonus(inviterAddress ?? undefined)
      if (tx) {
        updateNotif(claimId, '✅ Bonus G$ claimed!', 'success')
        dismissNotif(claimId, 5000)
        setEngagementMsg({ type: 'success', text: `Bonus G$ claimed! TX: ${tx}` })
      } else {
        updateNotif(claimId, `✗ ${engagementError || 'Claim failed'}`, 'error')
        dismissNotif(claimId, 5000)
      }
    } catch {
      updateNotif(claimId, '✗ Claim failed', 'error')
      dismissNotif(claimId, 5000)
    }
  }

  // Check for active streaming rewards
  useEffect(() => {
    const checkFlow = async () => {
      if (address) {
        const info = await getStakerInfo(address);
        if (info && info.stakedAmount > 0n) {
          setIsFlowing(true);
        } else {
          setIsFlowing(false);
        }
      }
    };
    checkFlow();
  }, [address, getStakerInfo]);

  const cashoutGs = async () => {
    const amt = parseFloat(cashoutAmount)
    if (!amt || amt < MIN_CASHOUT) {
      setMessage({ type: 'error', text: `Minimum cashout is ${MIN_CASHOUT} G$` })
      return
    }
    if (!address) {
      setMessage({ type: 'error', text: 'Connect your wallet to cash out' })
      return
    }
    if (!points || availablePoints < amt) {
      setMessage({ type: 'error', text: `Insufficient points. Available: ${availablePoints}` })
      return
    }

    setCashouting(true)
    setMessage(null)
    setSignedTx(null)
    setPendingCashoutId(null)

    try {
      const res = await fetch('/api/viewers/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: address.toLowerCase(), amount: amt }),
      })
      const data = await res.json()

      if (res.ok && data.transaction) {
        setSignedTx(data.transaction)
        setPendingCashoutId(data.cashoutId)
        setMessage({ type: 'success', text: `Signed claim for ${amt} G$. Submit the transaction below to receive your tokens.` })
        setCashoutAmount('')
        await loadPoints()
      } else {
        setMessage({ type: 'error', text: data.error || 'Redemption failed' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error. Please try again.' })
    } finally {
      setCashouting(false)
    }
  }

  const submitSignedTx = async () => {
    if (!signedTx || !walletClient || !address || !pendingCashoutId) return

    setSubmittingTx(true)
    setMessage(null)

    try {
      const { args } = signedTx

      const txHash = await walletClient.sendTransaction({
        to: signedTx.to as `0x${string}`,
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

      // Confirm redemption on backend
      await fetch('/api/viewers/redeem', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cashoutId: pendingCashoutId, txHash }),
      })

      setMessage({ type: 'success', text: `G$ redeemed! TX: ${txHash}` })
      setSignedTx(null)
      setPendingCashoutId(null)
      setShowRedeemModal(false)
      await loadPoints()
      await loadCashouts()
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Transaction failed'
      setMessage({ type: 'error', text: `Transaction failed: ${errorMsg}` })
    } finally {
      setSubmittingTx(false)
    }
  }

  const statusColor = (s: string) => {
    if (s === 'completed') return 'text-green-700 bg-green-100'
    if (s === 'signed') return 'text-purple-700 bg-purple-100'
    if (s === 'pending' || s === 'processing') return 'text-yellow-700 bg-yellow-100'
    if (s === 'failed' || s === 'cancelled') return 'text-red-700 bg-red-100'
    return 'text-black/50 bg-black/5'
  }

  // Available = total earned - actually redeemed on-chain (not claimedPoints which may be inflated)
  const availablePoints = points
    ? Math.max(points.totalPoints - totalRedeemed, 0)
    : 0
  const maxCashout = availablePoints

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-heading uppercase tracking-tighter">My Rewards</h1>
        <Link href="/leaderboard" className="text-xs font-bold uppercase underline">Leaderboard →</Link>
      </div>

      {!isConnected && (
        <div className="card p-8 mb-8 bg-[#F5F3F0]">
          <h2 className="text-xl font-heading mb-4 uppercase tracking-wider">Connect Your Wallet</h2>
          <p className="text-black font-bold text-xs mb-6 uppercase">
            Connect your wallet to cash out G$. You can still earn points anonymously.
          </p>
          <WalletButton className="w-full" />
        </div>
      )}

      {loading ? (
        <div className="card p-8 text-center">
          <p className="font-bold text-xs uppercase animate-pulse">Syncing with SovNodes...</p>
        </div>
      ) : points ? (
        <div className="space-y-6">

          {/* ── PROGRESS BAR ── */}
          {(() => {
            const bonusBlocked = effectiveWhitelisted === false
            const steps = [
              { label: 'Connect Wallet', desc: 'Link your wallet to track & claim rewards', done: isConnected, cta: null, blocked: false },
              { label: 'View Your First Ad', desc: 'Earn SovPoints by watching ads on SovAds sites', done: (points?.totalPoints ?? 0) > 0, cta: '/', blocked: false },
              { label: `Earn ${MIN_CASHOUT} SovPoints`, desc: `You need at least ${MIN_CASHOUT} pts to redeem for G$`, done: (points?.totalPoints ?? 0) >= MIN_CASHOUT, cta: null, blocked: false },
              { label: 'Redeem SovPoints for G$', desc: 'Exchange your SovPoints for real GoodDollar tokens', done: totalRedeemed > 0, cta: null, blocked: false },
              { label: 'Claim Engagement Reward', desc: bonusBlocked ? 'Requires GoodDollar identity verification' : 'Claim your G$ engagement reward from the GoodDollar protocol', done: engagementLastDate !== null, cta: bonusBlocked ? null : null, blocked: bonusBlocked },
            ]
            const completedCount = steps.filter((s) => s.done).length
            const pct = Math.round((completedCount / steps.length) * 100)
            if (completedCount === steps.length) return null

            return (
              <div className="card p-5 border-4 border-black">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-heading uppercase tracking-widest">Your Rewards Journey</span>
                  <span className="text-xs font-black">{completedCount}/{steps.length} complete</span>
                </div>
                <div className="w-full h-3 bg-black/10 border-2 border-black mb-4 overflow-hidden">
                  <div className="h-full bg-yellow-400 border-r-2 border-black transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                  {steps.map((step, i) => {
                    const isNext = !step.done && !step.blocked && steps.slice(0, i).every((s) => s.done)
                    const isBlocked = step.blocked && !step.done
                    return (
                      <div key={i} className={`flex sm:flex-col items-start sm:items-center gap-2 px-2 py-2 border-2 text-center transition-colors ${
                        step.done
                          ? 'border-green-400 bg-green-50'
                          : isBlocked
                          ? 'border-dashed border-black/20 bg-black/[0.03]'
                          : isNext
                          ? 'border-yellow-400 bg-yellow-50'
                          : 'border-black/10'
                      }`}>
                        <div className={`w-6 h-6 flex items-center justify-center border-2 shrink-0 font-black text-xs ${
                          step.done
                            ? 'border-green-600 bg-green-500 text-white'
                            : isBlocked
                            ? 'border-black/10 bg-black/5 text-black/20'
                            : isNext
                            ? 'border-black bg-yellow-400'
                            : 'border-black/20 text-black/30'
                        }`}>
                          {step.done ? '✓' : isBlocked ? '🔒' : i + 1}
                        </div>
                        <div className="flex flex-col items-center gap-0.5">
                          <p className={`text-[10px] font-black uppercase leading-tight ${
                            step.done ? 'line-through text-black/30' : isBlocked ? 'text-black/30' : isNext ? 'text-black' : 'text-black/30'
                          }`}>{step.label}</p>
                          {isBlocked && (
                            <p className="text-[9px] font-bold text-black/40 leading-tight">Must be GoodDollar verified</p>
                          )}
                          {isBlocked && (
                            <button
                              onClick={() => verifyOnGoodDollar(typeof window !== 'undefined' ? window.location.origin + '/rewards' : undefined)}
                              disabled={engagementVerifying || !isConnected}
                              className="text-[9px] font-black uppercase underline text-orange-500 mt-0.5 disabled:opacity-50"
                            >{engagementVerifying ? 'Signing...' : 'Verify →'}</button>
                          )}
                        </div>
                        {isNext && step.cta && <Link href={step.cta} className="text-[9px] font-black uppercase underline">Go →</Link>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* ── FLOW BANNER ── */}
          {isFlowing && (
            <div className="bg-yellow-400 border-4 border-black p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-black rounded-full animate-pulse" />
                <span className="font-black uppercase text-xs">Real-time G$ Rewards Flowing</span>
              </div>
              <Link href="/staking" className="text-[10px] font-black underline uppercase">Boost Flow</Link>
            </div>
          )}

          {/* ── DAILY GOODDOLLAR UBI CLAIM ── */}
          {isConnected && gdVerified !== null && (
            <div className={`card p-5 border-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
              gdVerified && !gdClaimedToday ? 'border-green-500 bg-green-50' : 'border-black/20'
            }`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="text-xl shrink-0">{gdVerified ? (gdClaimedToday ? '✅' : '🎁') : '🔒'}</div>
                <div>
                  <div className="text-xs font-heading uppercase tracking-widest">Daily G$ Claim</div>
                  <div className="text-[10px] font-bold uppercase text-black/50 mt-0.5">
                    {!gdVerified
                      ? 'Requires GoodDollar face verification'
                      : gdClaimedToday
                      ? 'Already claimed today — come back tomorrow'
                      : gdEntitlement !== null && gdEntitlement > 0n
                      ? `${Number(formatUnits(gdEntitlement, 18)).toFixed(2)} G$ available`
                      : 'Loading entitlement…'}
                  </div>
                  {gdClaimTx && (
                    <a href={`https://celoscan.io/tx/${gdClaimTx}`} target="_blank" rel="noopener noreferrer" className="text-[9px] font-black uppercase underline text-green-700 mt-0.5 block">View tx ↗</a>
                  )}
                  {gdClaimError && (
                    <p className="text-[9px] font-black uppercase text-red-600 mt-0.5">{gdClaimError}</p>
                  )}
                </div>
              </div>
              <div className="shrink-0">
                {!gdVerified ? (
                  <button
                    onClick={() => verifyOnGoodDollar(typeof window !== 'undefined' ? window.location.origin + '/rewards' : undefined)}
                    disabled={engagementVerifying || !isConnected}
                    className="btn py-2 px-4 text-[10px] font-black uppercase border-4 border-orange-400 bg-orange-400 text-black hover:bg-orange-300 disabled:opacity-50"
                  >
                    {engagementVerifying ? 'Signing…' : 'Verify Identity →'}
                  </button>
                ) : gdClaimedToday ? (
                  <span className="text-[10px] font-black uppercase text-green-700 bg-green-100 border-2 border-green-400 px-3 py-2">Claimed ✓</span>
                ) : (
                  <button
                    onClick={handleGdClaim}
                    disabled={gdClaimLoading || !gdEntitlement || gdEntitlement === 0n || chainId !== CELO_MAINNET_CHAIN_ID}
                    className="btn btn-primary py-2 px-4 text-[10px] font-black uppercase border-4 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all disabled:opacity-50"
                  >
                    {gdClaimLoading ? 'Claiming…' : chainId !== CELO_MAINNET_CHAIN_ID ? 'Switch to Celo' : 'Claim Daily G$'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── ROW 1: STATS (3 cols) ── */}
          <div className="grid grid-cols-3 gap-4">
            <div className="card p-5">
              <div className="text-2xl font-heading">{points.totalPoints.toLocaleString()}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest mt-1 text-black/60">Total Earned</div>
            </div>
            <div className="card p-5 border-4 border-black bg-black text-white">
              <div className="text-2xl font-heading text-yellow-400 font-black">{availablePoints.toLocaleString()}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest mt-1 opacity-60">Available to Redeem</div>
              <div className="text-[9px] font-bold mt-0.5 opacity-30">1 pt = 1 G$</div>
            </div>
            <div className="card p-5 bg-green-50 border-green-400">
              <div className="text-2xl font-heading text-green-700">{totalRedeemed.toLocaleString()}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest mt-1">Redeemed On-Chain</div>
              <div className="text-[9px] font-bold mt-0.5 text-green-500">Confirmed G$ received</div>
            </div>
          </div>

          {/* ── ROW 2: ACTIONS (2 cols) ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Redeem Card */}
            <div className="card p-6 border-4 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h2 className="text-sm font-heading uppercase tracking-widest">Redeem for G$</h2>
                  <p className="text-[10px] font-bold uppercase text-black/50 mt-0.5">Exchange SovPoints for GoodDollar on Celo</p>
                </div>
                <span className="text-[10px] font-black uppercase bg-black text-white px-2 py-0.5 shrink-0">1:1</span>
              </div>

              <div className="flex items-center gap-2 mb-4 p-3 bg-black/5 border border-black/20">
                <span className="text-[10px] font-bold uppercase text-black/50">Available:</span>
                <span className="text-sm font-heading font-black">{maxCashout.toLocaleString()}</span>
                <span className="text-[10px] font-bold uppercase text-black/40">SovPoints</span>
              </div>

              <button
                onClick={() => { setShowRedeemModal(true); setMessage(null); setSignedTx(null) }}
                disabled={!isConnected}
                className="mt-auto w-full btn btn-primary py-3 text-xs font-black uppercase border-4 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all disabled:opacity-50"
              >
                {!isConnected ? 'Connect Wallet to Redeem' : 'Redeem SovPoints for G$'}
              </button>

              {maxCashout < MIN_CASHOUT && isConnected && (
                <p className="text-[10px] font-bold uppercase text-black/40 mt-2 text-center">
                  Need {MIN_CASHOUT} pts min. <Link href="/" className="underline">Earn more →</Link>
                </p>
              )}
            </div>

            {/* GoodDollar Bonus Card */}
            <div className={`card p-6 border-4 flex flex-col ${
              canClaimEngagement
                ? 'border-yellow-400 shadow-[6px_6px_0px_0px_rgba(234,179,8,1)] bg-yellow-50'
                : 'border-black/20'
            }`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-heading uppercase tracking-widest">Engagement Reward</h2>
                    {canClaimEngagement && (
                      <span className="text-[9px] font-black uppercase bg-yellow-400 border-2 border-black px-1.5 py-0.5 animate-pulse">Ready!</span>
                    )}
                  </div>
                  <p className="text-[10px] font-bold uppercase text-black/50 mt-0.5">Bonus G$ funded by GoodDollar protocol</p>
                </div>
                {engagementRewardAmount !== null && (
                  <span className="text-xs font-black bg-black text-yellow-400 px-2 py-0.5 shrink-0">
                    ~{Number(formatUnits(engagementRewardAmount, 18)).toFixed(0)} G$
                  </span>
                )}
              </div>

              {/* Eligibility status */}
              <div className={`p-3 border-2 mb-3 text-[10px] font-black uppercase ${
                engagementEligible
                  ? 'border-yellow-400 bg-yellow-100 text-yellow-800'
                  : effectiveIneligibilityReason === 'not_whitelisted'
                  ? 'border-orange-400 bg-orange-50 text-orange-800'
                  : effectiveIneligibilityReason === 'cooldown'
                  ? 'border-black/20 bg-black/5 text-black/50'
                  : effectiveIneligibilityReason === 'app_limit'
                  ? 'border-red-300 bg-red-50 text-red-700'
                  : canClaimEngagement
                  ? 'border-yellow-400 bg-yellow-50 text-yellow-900'
                  : 'border-black/10 bg-black/5 text-black/40'
              }`}>
                {engagementEligible
                  ? '✓ Ready to claim your GoodDollar bonus'
                  : effectiveIneligibilityReason === 'not_whitelisted'
                  ? '⚠ You need GoodDollar identity verification to claim'
                  : effectiveIneligibilityReason === 'cooldown'
                  ? `⏳ Cooldown: ${cooldownDaysRemaining} days remaining until next claim`
                  : effectiveIneligibilityReason === 'app_limit'
                  ? '⏸ Reward currently unavailable — app approval pending or period limit reached'
                  : canClaimEngagement
                  ? '✓ Verified & ready — click Claim Engagement Reward below'
                  : effectiveWhitelisted === true
                  ? 'Checking SDK eligibility…'
                  : !isConnected
                  ? 'Connect wallet to check eligibility'
                  : 'Checking eligibility…'}
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-2 mb-4 text-[9px] font-bold uppercase">
                <div className="border border-black/10 p-2">
                  <div className="text-black/40">Distribution</div>
                  <div className="mt-0.5">50% User+Inviter · 25% User</div>
                </div>
                <div className="border border-black/10 p-2">
                  <div className="text-black/40">GD Verified</div>
                  <div className={`mt-0.5 ${effectiveWhitelisted === true ? 'text-green-700' : effectiveWhitelisted === false ? 'text-orange-600' : 'text-black/40'}`}>
                    {effectiveWhitelisted === true ? '✓ Verified' : effectiveWhitelisted === false ? '✗ Not verified' : '—'}
                  </div>
                </div>
                <div className="border border-black/10 p-2">
                  <div className="text-black/40">Cooldown</div>
                  <div className="mt-0.5">
                    {cooldownDaysRemaining && cooldownDaysRemaining > 0
                      ? `${cooldownDaysRemaining}d left`
                      : engagementLastDate
                      ? `Last: ${engagementLastDate.toLocaleDateString()}`
                      : 'No prior claim'}
                  </div>
                </div>
                <div className="border border-black/10 p-2">
                  <div className="text-black/40">Last Claim</div>
                  <div className="mt-0.5 truncate">
                    {engagementLastTx
                      ? <a href={`https://celoscan.io/tx/${engagementLastTx}`} target="_blank" rel="noopener noreferrer" className="underline text-blue-600">View tx ↗</a>
                      : '—'}
                  </div>
                </div>
              </div>

              {/* Messages */}
              {(engagementMsg || (engagementError && !engagementMsg)) && (
                <div className={`p-2 border-2 font-bold text-[10px] uppercase mb-3 ${
                  engagementMsg?.type === 'success' ? 'border-green-400 bg-green-100 text-green-800' : 'border-red-300 bg-red-50 text-red-700'
                }`}>
                  {engagementMsg?.type === 'success'
                    ? <span>{engagementMsg.text} {engagementLastTx && <a href={`https://celoscan.io/tx/${engagementLastTx}`} target="_blank" rel="noopener noreferrer" className="underline ml-1">View ↗</a>}</span>
                    : <span>{engagementError || engagementMsg?.text}</span>}
                </div>
              )}

              <div className="mt-auto flex gap-2">
                {effectiveIneligibilityReason === 'not_whitelisted' ? (
                  <button
                    onClick={() => verifyOnGoodDollar(typeof window !== 'undefined' ? window.location.origin + '/rewards' : undefined)}
                    disabled={engagementVerifying || !isConnected}
                    className="flex-1 btn py-3 text-xs font-black uppercase border-4 border-orange-400 bg-orange-400 text-black hover:bg-orange-300 text-center disabled:opacity-50"
                  >
                    {engagementVerifying ? 'Sign 2 messages in wallet...' : 'Verify on GoodDollar →'}
                  </button>
                ) : (
                  <button
                    onClick={handleEngagementClaim}
                    disabled={!canClaimEngagement}
                    className="flex-1 btn btn-primary py-3 text-xs font-black uppercase border-4 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {engagementClaiming ? 'Claiming…' : canClaimEngagement ? 'Claim Engagement Reward' : effectiveIneligibilityReason === 'app_limit' ? 'Unavailable' : !isConnected ? 'Connect Wallet' : 'Checking…'}
                  </button>
                )}
                {isConnected && address && (
                  <button
                    type="button"
                    onClick={() => {
                      const url = `${window.location.origin}/rewards?ref=${address}`
                      navigator.clipboard.writeText(url).then(() =>
                        setEngagementMsg({ type: 'success', text: 'Invite link copied! Share to earn 25% bonus.' })
                      )
                    }}
                    className="px-3 py-3 text-xs font-black uppercase border-4 border-black bg-white hover:bg-black hover:text-white transition-colors"
                    title="Copy invite link"
                  >
                    Invite
                  </button>
                )}
              </div>

              {refParam && refParam.toLowerCase() !== address?.toLowerCase() && (
                <p className="text-[9px] font-bold uppercase text-black/30 mt-2">
                  Ref: {refParam.slice(0, 8)}…{refParam.slice(-4)}
                </p>
              )}
            </div>
          </div>

          {/* ── ROW 3: LINKS (3 cols) ── */}
          <div className="grid grid-cols-3 gap-4">
            <Link href="/staking" className="card p-4 border-dashed flex flex-col items-center justify-center gap-1 group hover:border-black hover:bg-black/5 transition-all text-center">
              <div className="text-xs font-black uppercase group-hover:underline">Staking</div>
              <div className="text-[9px] font-bold uppercase tracking-widest opacity-50">Stream G$ rewards</div>
            </Link>
            <Link href="/leaderboard" className="card p-4 border-dashed flex flex-col items-center justify-center gap-1 group hover:border-black hover:bg-black/5 transition-all text-center">
              <div className="text-xs font-black uppercase group-hover:underline">Leaderboard</div>
              <div className="text-[9px] font-bold uppercase tracking-widest opacity-50">See your rank</div>
            </Link>
            <Link href="/advertiser" className="card p-4 border-dashed flex flex-col items-center justify-center gap-1 group hover:border-black hover:bg-black/5 transition-all text-center">
              <div className="text-xs font-black uppercase group-hover:underline">Run Ads</div>
              <div className="text-[9px] font-bold uppercase tracking-widest opacity-50">Advertise on SovAds</div>
            </Link>
          </div>

          {/* ── REDEEM MODAL ── */}
          {showRedeemModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/60" onClick={() => { if (!cashouting && !submittingTx) { setShowRedeemModal(false); setSignedTx(null) } }} />
              <div className="relative bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-6 border-b-4 border-black">
                  <div>
                    <h2 className="text-sm font-heading uppercase tracking-widest">Redeem SovPoints</h2>
                    <p className="text-[10px] font-bold uppercase text-black/50 mt-1">1 SovPoint = 1 G$ on Celo</p>
                  </div>
                  <button onClick={() => { if (!cashouting && !submittingTx) { setShowRedeemModal(false); setSignedTx(null) } }} className="w-8 h-8 flex items-center justify-center border-2 border-black font-black text-sm hover:bg-black hover:text-white transition-colors">✕</button>
                </div>
                <div className="p-6 space-y-5">
                  {!signedTx ? (
                    <>
                      <div className="bg-black text-white p-4">
                        <div className="text-[10px] font-bold uppercase tracking-widest opacity-60">Available to Redeem</div>
                        <div className="text-2xl font-heading text-yellow-400 mt-1">{maxCashout.toLocaleString()} <span className="text-sm">SovPoints</span></div>
                      </div>
                      {maxCashout < MIN_CASHOUT ? (
                        <div className="space-y-3">
                          <p className="text-xs font-bold uppercase text-black/50">You need at least {MIN_CASHOUT} SovPoints. You have {maxCashout.toLocaleString()} pts.</p>
                          <Link href="/" className="btn btn-outline inline-block text-xs" onClick={() => setShowRedeemModal(false)}>Earn more by viewing ads →</Link>
                        </div>
                      ) : (
                        <>
                          <div className="flex gap-3 items-stretch">
                            <input type="number" min={MIN_CASHOUT} max={maxCashout} step="1" value={cashoutAmount} onChange={e => setCashoutAmount(e.target.value)} placeholder={`Min ${MIN_CASHOUT} G$`} className="flex-1 border-4 border-black px-4 py-3 font-heading text-lg focus:outline-none focus:ring-2 focus:ring-black" />
                            <button type="button" onClick={() => setCashoutAmount(String(Math.floor(maxCashout)))} className="btn btn-outline px-4 text-xs font-bold uppercase">MAX</button>
                          </div>
                          {cashoutAmount && parseFloat(cashoutAmount) > 0 && (
                            <p className="text-xs font-bold text-green-700 uppercase">{parseFloat(cashoutAmount).toLocaleString()} SovPoints → {parseFloat(cashoutAmount).toLocaleString()} G$</p>
                          )}
                          {message && (
                            <div className={`p-3 border-2 border-black font-bold text-xs uppercase ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{message.text}</div>
                          )}
                          <button onClick={cashoutGs} disabled={cashouting || !cashoutAmount || parseFloat(cashoutAmount) < MIN_CASHOUT} className="w-full btn btn-primary py-4 text-sm disabled:opacity-50 font-black uppercase">
                            {cashouting ? 'Signing Claim...' : `Redeem ${cashoutAmount ? parseFloat(cashoutAmount).toLocaleString() : '—'} pts → G$`}
                          </button>
                          <p className="text-[10px] font-bold uppercase text-black/40">A signed transaction will be generated for you to submit from your wallet.</p>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="bg-green-100 border-2 border-green-600 p-4">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-green-800">Claim Signed ✓</div>
                        <p className="text-xs font-bold text-green-700 mt-1 uppercase">Submit the transaction below to receive your G$ tokens.</p>
                      </div>
                      <div className="bg-black/5 border-2 border-black p-4 font-mono text-[10px] space-y-1.5 overflow-x-auto">
                        <div><span className="font-bold">Contract:</span> {signedTx.to}</div>
                        <div><span className="font-bold">Recipient:</span> {signedTx.args.recipient}</div>
                        <div><span className="font-bold">Amount:</span> {signedTx.args.amount} (wei)</div>
                        <div><span className="font-bold">Deadline:</span> {new Date(Number(signedTx.args.deadline) * 1000).toLocaleString()}</div>
                        <div className="break-all"><span className="font-bold">Sig:</span> {signedTx.args.signature.slice(0, 20)}...{signedTx.args.signature.slice(-10)}</div>
                      </div>
                      {message && (
                        <div className={`p-3 border-2 border-black font-bold text-xs uppercase ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{message.text}</div>
                      )}
                      <button onClick={submitSignedTx} disabled={submittingTx || !walletClient} className="w-full py-4 text-sm disabled:opacity-50 bg-yellow-400 border-4 border-black hover:bg-yellow-300 font-black uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all">
                        {submittingTx ? 'Submitting...' : 'Submit Transaction & Receive G$'}
                      </button>
                      <button onClick={() => { setSignedTx(null); setMessage(null) }} className="w-full text-[10px] font-bold uppercase text-black/40 hover:text-black underline">← Back to amount</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── CASHOUT HISTORY ── */}
          {cashouts.length > 0 && (
            <div className="card p-5 border-2 border-black/20">
              <h3 className="text-xs font-heading uppercase tracking-widest mb-4">G$ Redemption History</h3>
              <div className="space-y-2">
                {cashouts.map(c => (
                  <div key={c.id} className="flex items-center justify-between border-b border-black/10 pb-2 text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 font-bold uppercase text-[10px] ${statusColor(c.status)}`}>{c.status}</span>
                      {c.redeemed && <span className="px-2 py-0.5 font-bold uppercase text-[10px] text-blue-700 bg-blue-100">Redeemed</span>}
                      <span className="font-bold">{c.amount.toLocaleString()} G$</span>
                    </div>
                    <div className="flex items-center gap-2 text-black/40">
                      {c.redeemTxHash && <a href={`https://celoscan.io/tx/${c.redeemTxHash}`} target="_blank" rel="noopener noreferrer" className="underline text-blue-600">tx ↗</a>}
                      <span>{new Date(c.createdAt).toLocaleDateString()}</span>
                    </div>
                    {c.signature && !c.redeemed && c.status === 'signed' && (
                      <button onClick={() => { setSignedTx({ to: STREAMING_CONTRACT, functionName: 'claimWithSignature', args: { recipient: address || '', amount: parseUnits(c.amount.toFixed(18), 18).toString(), claimRef: c.claimRef || '', nonce: c.nonce || '0', deadline: c.deadline || '0', signature: c.signature || '' }, operator: '' }); setPendingCashoutId(c.id); setShowRedeemModal(true) }} className="text-[10px] font-bold uppercase underline text-yellow-700">Submit →</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── HOW IT WORKS ── */}
          <div className="card p-6 bg-white border-dashed">
            <h2 className="text-xs font-heading mb-4 uppercase tracking-widest">How It Works</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { n: 1, title: 'View Ads', desc: 'Earn 1 SovPoint per verified impression.' },
                { n: 2, title: 'Click Ads', desc: 'Earn 5 SovPoints per click.' },
                { n: 3, title: 'Redeem for G$', desc: 'Swap SovPoints for G$ · 1:1 · Min 10.' },
                { n: 4, title: 'GoodDollar Bonus', desc: 'Claim bonus G$ from the protocol every 180 days.' },
                { n: 5, title: 'Invite Friends', desc: 'Earn 25% of their bonus when they claim via your link.' },
                { n: 6, title: 'Stake G$', desc: 'Stake G$ for streaming rewards & higher rank.' },
              ].map(({ n, title, desc }) => (
                <div key={n} className="border-2 border-black/10 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="bg-black text-white w-5 h-5 flex items-center justify-center font-heading text-[10px] shrink-0">{n}</span>
                    <p className="font-heading text-xs uppercase">{title}</p>
                  </div>
                  <p className="text-[9px] font-bold uppercase text-black/50 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>

        </div>
      ) : (
        <div className="card p-12 text-center">
          <p className="font-heading text-lg uppercase mb-4">You have 0 points</p>
          <Link href="/" className="btn btn-outline inline-block">Start Viewing Ads</Link>
        </div>
      )}

      {/* ── STEP NOTIFICATIONS overlay (bottom-right) ── */}
      {notifications.length > 0 && (
        <div className="fixed bottom-16 right-4 z-50 flex flex-col gap-2 max-w-xs w-full pointer-events-none">
          {notifications.map(n => (
            <div
              key={n.id}
              className={`flex items-start gap-2 px-4 py-3 border-2 font-bold text-xs uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] pointer-events-auto ${
                n.type === 'success'
                  ? 'bg-green-400 border-green-700 text-green-900'
                  : n.type === 'error'
                  ? 'bg-red-100 border-red-500 text-red-800'
                  : 'bg-yellow-50 border-black text-black'
              }`}
            >
              <span className="flex-1 leading-tight">{n.text}</span>
              <button
                onClick={() => dismissNotif(n.id)}
                className="shrink-0 opacity-50 hover:opacity-100 text-[10px] font-black leading-none"
              >✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
