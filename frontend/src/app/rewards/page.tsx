'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import Link from 'next/link'
import WalletButton from '@/components/WalletButton'
import { useStreamingAds } from '@/hooks/useStreamingAds'

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
  claimRef: string | null
  initiateTxHash: string | null
  distributeTxHash: string | null
  createdAt: string
}

const MIN_CASHOUT = 10

export default function RewardsPage() {
  const { address, isConnected } = useAccount()
  const [points, setPoints] = useState<ViewerPoints | null>(null)
  const [loading, setLoading] = useState(true)
  const [cashouts, setCashouts] = useState<Cashout[]>([])
  const [cashoutAmount, setCashoutAmount] = useState('')
  const [cashouting, setCashouting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [fingerprint, setFingerprint] = useState<string | null>(null)

  // Superfluid Flow State
  const { getStakerInfo } = useStreamingAds();
  const [isFlowing, setIsFlowing] = useState(false);

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
      const res = await fetch(`/api/viewers/cashout?wallet=${address.toLowerCase()}`)
      if (res.ok) {
        const data = await res.json()
        setCashouts(data.cashouts || [])
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

    try {
      const res = await fetch('/api/viewers/cashout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: address.toLowerCase(), amount: amt }),
      })
      const data = await res.json()

      if (res.ok) {
        setMessage({ type: 'success', text: data.message || `${amt} G$ cashout submitted!` })
        setCashoutAmount('')
        await loadPoints()
        await loadCashouts()
      } else {
        setMessage({ type: 'error', text: data.error || 'Cashout failed' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error. Please try again.' })
    } finally {
      setCashouting(false)
    }
  }

  const statusColor = (s: string) => {
    if (s === 'completed') return 'text-green-700 bg-green-100'
    if (s === 'pending' || s === 'processing') return 'text-yellow-700 bg-yellow-100'
    if (s === 'failed' || s === 'cancelled') return 'text-red-700 bg-red-100'
    return 'text-black/50 bg-black/5'
  }

  const availablePoints = points
    ? Math.max(points.pendingPoints, points.totalPoints - points.claimedPoints, 0)
    : 0
  const maxCashout = availablePoints

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
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
        <div className="space-y-8">
          {/* Flow Indicator */}
          {isFlowing && (
            <div className="bg-yellow-400 border-4 border-black p-4 flex items-center justify-between animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 bg-black rounded-full"></div>
                <span className="font-black uppercase text-sm">Real-time G$ Rewards Flowing</span>
              </div>
              <Link href="/staking" className="text-xs font-black underline uppercase">Boost Flow</Link>
            </div>
          )}

          {/* Points Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="card p-6">
              <div className="text-3xl font-heading">{points.totalPoints.toLocaleString()}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest mt-2">Total Earned</div>
            </div>
            <div className="card p-6 border-4 border-black bg-black text-white">
              <div className="text-3xl font-heading text-yellow-400 font-black">{availablePoints.toLocaleString()}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest mt-2 opacity-60">SovPoints to Redeem</div>
              <div className="text-[10px] font-bold mt-1 opacity-40">Redeem for G$ · 1 pt = 1 G$</div>
            </div>
            <div className="card p-6 bg-green-50 border-green-400">
              <div className="text-3xl font-heading text-green-700">{points.claimedPoints.toLocaleString()}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest mt-2">pts Redeemed as G$</div>
            </div>
          </div>

          {/* ── GS CASHOUT PANEL ── */}
          <div className="card p-8 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-sm font-heading uppercase tracking-widest">Redeem Points for G$</h2>
                <p className="text-[10px] font-bold uppercase text-black/50 mt-1">Exchange your SovPoints for GoodDollar (G$) on Celo</p>
              </div>
              <span className="text-[10px] font-bold uppercase bg-black text-white px-2 py-1 shrink-0">1 pt = 1 G$</span>
            </div>

            {!isConnected ? (
              <div className="border-2 border-black bg-yellow-100 p-4 text-xs font-bold uppercase">
                ⚠️ Connect your wallet to cash out G$.
              </div>
            ) : maxCashout < MIN_CASHOUT ? (
              <div className="space-y-4">
                <p className="text-xs font-bold uppercase text-black/50 italic">
                  You need at least {MIN_CASHOUT} SovPoints to cash out. You have {maxCashout.toLocaleString()} pts.
                </p>
                <Link href="/" className="btn btn-outline inline-block text-xs">Earn more by viewing ads →</Link>
              </div>
            ) : (
              <div className="space-y-5">
                <p className="text-xs font-bold uppercase">
                  You have: <span className="bg-black text-white px-2 py-0.5">{maxCashout.toLocaleString()} SovPoints</span>
                  <span className="text-black/40 ml-2 normal-case font-normal text-[10px]">→ redeemable as {maxCashout.toLocaleString()} G$</span>
                </p>

                {/* Amount input */}
                <div className="flex gap-3 items-stretch">
                  <div className="flex-1">
                    <input
                      type="number"
                      min={MIN_CASHOUT}
                      max={maxCashout}
                      step="1"
                      value={cashoutAmount}
                      onChange={e => setCashoutAmount(e.target.value)}
                      placeholder={`Min ${MIN_CASHOUT} G$`}
                      className="w-full border-4 border-black px-4 py-3 font-heading text-lg focus:outline-none focus:ring-2 focus:ring-black"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setCashoutAmount(String(Math.floor(maxCashout)))}
                    className="btn btn-outline px-4 text-xs font-bold uppercase"
                  >
                    MAX
                  </button>
                </div>

                {cashoutAmount && parseFloat(cashoutAmount) > 0 && (
                  <p className="text-xs font-bold text-green-700 uppercase">
                    {parseFloat(cashoutAmount).toLocaleString()} SovPoints → {parseFloat(cashoutAmount).toLocaleString()} G$ sent to your wallet
                  </p>
                )}

                {message && (
                  <div className={`p-4 border-2 border-black font-bold text-xs uppercase ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {message.text}
                  </div>
                )}

                <button
                  onClick={cashoutGs}
                  disabled={cashouting || !cashoutAmount || parseFloat(cashoutAmount) < MIN_CASHOUT}
                  className="w-full btn btn-primary py-4 text-sm disabled:opacity-50"
                >
                  {cashouting ? 'Submitting...' : `Redeem ${cashoutAmount ? parseFloat(cashoutAmount).toLocaleString() : '—'} pts → G$`}
                </button>

                <p className="text-[10px] font-bold uppercase text-black/40">
                  G$ (GoodDollar) tokens will be sent to your connected wallet on Celo. SovPoints are redeemed and removed from your balance.
                </p>
              </div>
            )}
          </div>

          {/* ── CASHOUT HISTORY ── */}
          {cashouts.length > 0 && (
            <div className="card p-6 border-2 border-black/20">
              <h3 className="text-xs font-heading uppercase tracking-widest mb-4">G$ Redemption History</h3>
              <div className="space-y-2">
                {cashouts.map(c => (
                  <div key={c.id} className="flex items-center justify-between text-xs font-mono border-b border-black/10 pb-2">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 font-bold uppercase text-[10px] ${statusColor(c.status)}`}>
                        {c.status}
                      </span>
                      <span className="font-bold">{c.amount.toLocaleString()} G$</span>
                    </div>
                    <div className="flex items-center gap-3 text-black/40">
                      {(c.distributeTxHash || c.initiateTxHash) && (
                        <a
                          href={`https://celoscan.io/tx/${c.distributeTxHash || c.initiateTxHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline"
                        >
                          tx ↗
                        </a>
                      )}
                      <span>{new Date(c.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Staking / streaming */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card p-6 border-dashed">
              <Link href="/staking" className="h-full flex flex-col justify-center items-center gap-2 group">
                <div className="text-sm font-black uppercase group-hover:underline">Staking Dashboard</div>
                <div className="text-[10px] font-bold uppercase tracking-widest opacity-60">Earn streaming G$ rewards →</div>
              </Link>
            </div>
            <div className="card p-6 border-dashed">
              <Link href="/leaderboard" className="h-full flex flex-col justify-center items-center gap-2 group">
                <div className="text-sm font-black uppercase group-hover:underline">Leaderboard</div>
                <div className="text-[10px] font-bold uppercase tracking-widest opacity-60">See your rank →</div>
              </Link>
            </div>
          </div>

          {/* How It Works */}
          <div className="card p-8 bg-white border-dashed">
            <h2 className="text-sm font-heading mb-6 uppercase tracking-widest">How It Works</h2>
            <div className="space-y-5">
              {[
                { n: 1, title: 'View Ads', desc: 'Earn 1 SovPoint per impression. Points live in our database — not on-chain.' },
                { n: 2, title: 'Click Ads', desc: 'Earn 5 SovPoints per click. Points are not tokens.' },
                { n: 3, title: 'Redeem for G$', desc: 'Exchange your SovPoints for G$ (GoodDollar) — a real token on Celo. 1 pt = 1 G$. Min 10 pts per redemption.' },
                { n: 4, title: 'Stake G$', desc: 'Put your G$ tokens to work for streaming rewards and a higher leaderboard rank' },
              ].map(({ n, title, desc }) => (
                <div key={n} className="flex items-start gap-4">
                  <span className="bg-black text-white w-6 h-6 flex items-center justify-center font-heading text-xs shrink-0">{n}</span>
                  <div>
                    <p className="font-heading text-sm uppercase">{title}</p>
                    <p className="text-[10px] font-bold uppercase text-black/60">{desc}</p>
                  </div>
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
    </div>
  )
}
