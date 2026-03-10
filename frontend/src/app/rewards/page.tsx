'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import Link from 'next/link'
import WalletButton from '@/components/WalletButton'
import { useStreamingAds } from '@/hooks/useStreamingAds'
import { formatEther } from 'viem'

interface ViewerPoints {
  id?: string
  wallet: string | null
  fingerprint: string | null
  totalPoints: number
  claimedPoints: number
  pendingPoints: number
  lastInteraction: string | null
}

export default function RewardsPage() {
  const { address, isConnected } = useAccount()
  const [points, setPoints] = useState<ViewerPoints | null>(null)
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [payoutConfigured, setPayoutConfigured] = useState<boolean>(true)
  const [fingerprint, setFingerprint] = useState<string | null>(null)

  // Superfluid Flow State
  const { address: userAddress } = useAccount();
  const { getStakerInfo } = useStreamingAds();
  const [totalAccumulatedG, setTotalAccumulatedG] = useState<string>('0');
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

  // Load points

  // fetch whether on‑chain payouts are currently wired up
  useEffect(() => {
    const checkConfig = async () => {
      try {
        const res = await fetch('/api/publishers/withdraw')
        if (res.ok) {
          const data = await res.json()
          setPayoutConfigured(!!data.configured)
        }
      } catch (err) {
        console.warn('could not fetch payout config', err)
      }
    }
    checkConfig()
  }, [])
  useEffect(() => {
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

    if (address || fingerprint) {
      loadPoints()
      // Refresh every 30 seconds
      const interval = setInterval(loadPoints, 30000)
      return () => clearInterval(interval)
    }
  }, [address, fingerprint])

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

  const claimPoints = async () => {
    if (!points || points.pendingPoints === 0) return

    setClaiming(true)
    setMessage(null)

    try {
      const response = await fetch('/api/viewers/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: address || null,
          fingerprint: fingerprint || null,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        // if backend indicates payouts are not yet wired, override message
        const successText = data.message
          || (data.configured
            ? 'Points claimed successfully!'
            : 'Claiming disabled; points were marked claimed in the database. We will transfer tokens when payouts are live.')

        setMessage({ type: 'success', text: successText })
        // Reload points
        const params = new URLSearchParams()
        if (address) params.append('wallet', address)
        else if (fingerprint) params.append('fingerprint', fingerprint)

        const reloadResponse = await fetch(`/api/viewers/points?${params}`)
        if (reloadResponse.ok) {
          const reloadData = await reloadResponse.json()
          setPoints(reloadData)
        }

        // if server reports not configured, update local flag as well
        if (data.configured === false) {
          setPayoutConfigured(false)
        }
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to claim points' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error claiming points. Please try again.' })
    } finally {
      setClaiming(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-heading mb-8 uppercase tracking-tighter">My Rewards</h1>

      {!isConnected && (
        <div className="card p-8 mb-8 bg-[#F5F3F0]">
          <h2 className="text-xl font-heading mb-4 uppercase tracking-wider">Connect Your Wallet</h2>
          <p className="text-black font-bold text-xs mb-6 uppercase">
            Connect your wallet to claim SOV tokens. You can still earn points anonymously, but you'll need to connect to claim them.
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
              <div className="text-[10px] font-bold uppercase tracking-widest mt-2">Legacy Points</div>
            </div>
            <div className="card p-6 bg-black text-white">
              <div className="text-3xl font-heading text-yellow-400 font-black">STREAMS</div>
              <div className="text-[10px] font-bold uppercase tracking-widest mt-2">Active Multiplier</div>
            </div>
            <div className="card p-6 border-dashed">
              <Link href="/staking" className="h-full flex flex-col justify-center items-center gap-2 group">
                <div className="text-sm font-black uppercase group-hover:underline">Staking Dashboard</div>
                <div className="text-[10px] font-bold uppercase tracking-widest opacity-60">Manage G$ Stake →</div>
              </Link>
            </div>
          </div>

          {/* Claim Section */}
          <div className="card p-8">
            <h2 className="text-sm font-heading mb-6 uppercase tracking-widest">Claim Your Points</h2>

            {/* warn when on‑chain payouts aren't yet set up */}
            {!payoutConfigured && (
              <div className="border-2 border-yellow-500 bg-yellow-100 p-4 text-xs font-bold uppercase">
                ⚠️ G$ payouts are not yet configured – claiming is temporarily disabled. Points will
                still be marked as claimed in the database, and tokens will be distributed when the
                system goes live. Please hang tight!
              </div>
            )}

            {points.pendingPoints > 0 ? (
              <div className="space-y-6">
                <p className="text-sm font-bold uppercase">
                  You have <span className="bg-black text-white px-2 py-1">{points.pendingPoints.toLocaleString()}</span> points ready for conversion.
                </p>

                {!isConnected && (
                  <div className="border-2 border-black bg-yellow-100 p-4 text-xs font-bold uppercase">
                    ⚠️ Wallet connection required for on-chain claiming.
                  </div>
                )}

                {message && (
                  <div className={`p-4 border-2 border-black font-bold text-xs uppercase ${message.type === 'success'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                    }`}>
                    {message.text}
                  </div>
                )}

                <button
                  onClick={claimPoints}
                  disabled={claiming || !isConnected || points.pendingPoints === 0}
                  className="w-full btn btn-primary py-4 text-sm"
                >
                  {claiming ? '...' : `Claim ${points.pendingPoints.toLocaleString()} SOV Points`}
                </button>
              </div>
            ) : (
              <p className="text-xs font-bold uppercase text-black/50 italic">
                No points available. Start viewing ads to earn.
              </p>
            )}
          </div>

          {/* How It Works */}
          <div className="card p-8 bg-white border-dashed">
            <h2 className="text-sm font-heading mb-6 uppercase tracking-widest">How It Works</h2>
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <span className="bg-black text-white w-6 h-6 flex items-center justify-center font-heading text-xs">1</span>
                <div>
                  <p className="font-heading text-sm uppercase">View Ads</p>
                  <p className="text-[10px] font-bold uppercase text-black/60">Earn 1 SOV point per impression</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <span className="bg-black text-white w-6 h-6 flex items-center justify-center font-heading text-xs">2</span>
                <div>
                  <p className="font-heading text-sm uppercase">Click Ads</p>
                  <p className="text-[10px] font-bold uppercase text-black/60">Earn 5 SOV points per click</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <span className="bg-black text-white w-6 h-6 flex items-center justify-center font-heading text-xs">3</span>
                <div>
                  <p className="font-heading text-sm uppercase">Claim Anytime</p>
                  <p className="text-[10px] font-bold uppercase text-black/60">Convert points to SOV tokens on-chain</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <span className="bg-black text-white w-6 h-6 flex items-center justify-center font-heading text-xs">4</span>
                <div>
                  <p className="font-heading text-sm uppercase">Stake G$</p>
                  <p className="text-[10px] font-bold uppercase text-black/60">Earn bonus points and a higher leaderboard rank</p>
                </div>
              </div>
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

