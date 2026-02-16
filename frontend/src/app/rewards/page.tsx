'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import WalletButton from '@/components/WalletButton'

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
  const [fingerprint, setFingerprint] = useState<string | null>(null)

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
  useEffect(() => {
    const loadPoints = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (address) {
          params.append('wallet', address)
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
        setMessage({ type: 'success', text: data.message || 'Points claimed successfully!' })
        // Reload points
        const params = new URLSearchParams()
        if (address) params.append('wallet', address)
        else if (fingerprint) params.append('fingerprint', fingerprint)

        const reloadResponse = await fetch(`/api/viewers/points?${params}`)
        if (reloadResponse.ok) {
          const reloadData = await reloadResponse.json()
          setPoints(reloadData)
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
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-base font-bold text-[var(--text-primary)] mb-6 uppercase tracking-wider">SOV Points Rewards</h1>

      {!isConnected && (
        <div className="glass-card rounded-lg p-4 mb-4">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3 uppercase tracking-wider">Connect Your Wallet</h2>
          <p className="text-[var(--text-secondary)] text-[11px] mb-4">
            Connect your wallet to claim SOV tokens. You can still earn points anonymously, but you'll need to connect to claim them.
          </p>
          <WalletButton className="w-full" />
        </div>
      )}

      {loading ? (
        <div className="glass-card rounded-lg p-4">
          <p className="text-[var(--text-secondary)] text-[11px]">Loading your points...</p>
        </div>
      ) : points ? (
        <div className="space-y-6">
          {/* Points Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
            <div className="glass-card rounded-lg p-4">
              <div className="text-lg font-bold text-[var(--text-primary)]">{points.totalPoints.toLocaleString()}</div>
              <div className="text-[var(--text-secondary)] text-[10px] uppercase tracking-tight">Total Points Earned</div>
            </div>
            <div className="glass-card rounded-lg p-4">
              <div className="text-lg font-bold text-[var(--accent-primary-solid)]">{points.pendingPoints.toLocaleString()}</div>
              <div className="text-[var(--text-secondary)] text-[10px] uppercase tracking-tight">Available to Claim</div>
            </div>
            <div className="glass-card rounded-lg p-4">
              <div className="text-lg font-bold text-blue-500">{points.claimedPoints.toLocaleString()}</div>
              <div className="text-[var(--text-secondary)] text-[10px] uppercase tracking-tight">Points Claimed</div>
            </div>
          </div>

          {/* Claim Section */}
          <div className="glass-card rounded-lg p-4 mb-6">
            <h2 className="text-xs font-semibold text-[var(--text-primary)] mb-3 uppercase tracking-wider">Claim Your Points</h2>

            {points.pendingPoints > 0 ? (
              <div className="space-y-4">
                <p className="text-[var(--text-secondary)] text-[11px]">
                  You have <span className="font-semibold text-[var(--text-primary)]">{points.pendingPoints.toLocaleString()}</span> SOV points available to claim.
                </p>

                {!isConnected && (
                  <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-md p-3 text-yellow-700 dark:text-yellow-400 text-sm">
                    ⚠️ Connect your wallet to claim your points as SOV tokens.
                  </div>
                )}

                {message && (
                  <div className={`rounded-md p-3 text-sm ${message.type === 'success'
                    ? 'bg-green-500/20 border border-green-500/50 text-green-700 dark:text-green-400'
                    : 'bg-red-500/20 border border-red-500/50 text-red-700 dark:text-red-400'
                    }`}>
                    {message.text}
                  </div>
                )}

                <button
                  onClick={claimPoints}
                  disabled={claiming || !isConnected || points.pendingPoints === 0}
                  className="w-full btn btn-primary px-4 py-1.5"
                >
                  {claiming ? 'Claiming...' : `Claim ${points.pendingPoints.toLocaleString()} SOV Points`}
                </button>
              </div>
            ) : (
              <p className="text-[var(--text-secondary)]">
                No points available to claim. Interact with ads to earn SOV points!
              </p>
            )}
          </div>

          {/* How It Works */}
          <div className="glass-card rounded-lg p-4 mb-6">
            <h2 className="text-xs font-semibold text-[var(--text-primary)] mb-3 uppercase tracking-wider">How It Works</h2>
            <div className="space-y-3 text-[var(--text-secondary)] text-[11px]">
              <div className="flex items-start gap-3">
                <span className="text-primary font-bold">1.</span>
                <div>
                  <p className="font-medium text-[var(--text-primary)]">View Ads</p>
                  <p>Earn 1 SOV point for each ad impression</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-primary font-bold">2.</span>
                <div>
                  <p className="font-medium text-[var(--text-primary)]">Click Ads</p>
                  <p>Earn 5 SOV points for each ad click</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-primary font-bold">3.</span>
                <div>
                  <p className="font-medium text-[var(--text-primary)]">Claim Anytime</p>
                  <p>Connect your wallet and claim your SOV tokens whenever you want</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="glass-card rounded-lg p-4">
          <p className="text-[var(--text-secondary)] text-[11px] uppercase">Start interacting with ads to earn SOV points!</p>
        </div>
      )}
    </div>
  )
}

