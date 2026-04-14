'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAccount, useWalletClient } from 'wagmi'
import Link from 'next/link'
import WalletButton from '@/components/WalletButton'
import { useStreamingAds } from '@/hooks/useStreamingAds'
import { encodeFunctionData, parseUnits } from 'viem'
import { sovAdsStreamingAbi } from '@/contract/sovAdsStreamingAbi'

const STREAMING_CONTRACT = process.env.NEXT_PUBLIC_SOVADS_STREAMING_ADDRESS || '0xFb76103FC70702413cEa55805089106D0626823f'

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
              <div className="text-3xl font-heading text-green-700">{totalRedeemed.toLocaleString()}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest mt-2">Redeemed On-Chain</div>
              <div className="text-[10px] font-bold mt-1 text-green-500">Confirmed G$ received</div>
            </div>
          </div>

          {/* ── REDEEM BUTTON ── */}
          <div className="card p-8 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-heading uppercase tracking-widest">Redeem Points for G$</h2>
                <p className="text-[10px] font-bold uppercase text-black/50 mt-1">Exchange your SovPoints for GoodDollar (G$) on Celo</p>
              </div>
              <span className="text-[10px] font-bold uppercase bg-black text-white px-2 py-1 shrink-0">1 pt = 1 G$</span>
            </div>

            <p className="text-xs font-bold uppercase mb-4">
              Available: <span className="bg-black text-white px-2 py-0.5">{maxCashout.toLocaleString()} SovPoints</span>
              {maxCashout > 0 && <span className="text-black/40 ml-2 normal-case font-normal text-[10px]">→ redeemable as {maxCashout.toLocaleString()} G$</span>}
            </p>

            <button
              onClick={() => { setShowRedeemModal(true); setMessage(null); setSignedTx(null) }}
              disabled={!isConnected}
              className="w-full btn btn-primary py-4 text-sm font-black uppercase border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all disabled:opacity-50"
            >
              {!isConnected ? 'Connect Wallet to Redeem' : 'Redeem SovPoints for G$'}
            </button>

            {maxCashout < MIN_CASHOUT && isConnected && (
              <p className="text-[10px] font-bold uppercase text-black/40 mt-3">
                Min {MIN_CASHOUT} pts required. <Link href="/" className="underline">Earn more →</Link>
              </p>
            )}
          </div>

          {/* ── REDEEM MODAL ── */}
          {showRedeemModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              {/* Backdrop */}
              <div className="absolute inset-0 bg-black/60" onClick={() => { if (!cashouting && !submittingTx) { setShowRedeemModal(false); setSignedTx(null) } }} />

              {/* Modal */}
              <div className="relative bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-lg max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b-4 border-black">
                  <div>
                    <h2 className="text-sm font-heading uppercase tracking-widest">Redeem SovPoints</h2>
                    <p className="text-[10px] font-bold uppercase text-black/50 mt-1">1 SovPoint = 1 G$ on Celo</p>
                  </div>
                  <button
                    onClick={() => { if (!cashouting && !submittingTx) { setShowRedeemModal(false); setSignedTx(null) } }}
                    className="w-8 h-8 flex items-center justify-center border-2 border-black font-black text-sm hover:bg-black hover:text-white transition-colors"
                  >
                    ✕
                  </button>
                </div>

                <div className="p-6 space-y-5">
                  {!signedTx ? (
                    /* ── Step 1: Enter amount & get signed claim ── */
                    <>
                      <div className="bg-black text-white p-4">
                        <div className="text-[10px] font-bold uppercase tracking-widest opacity-60">Available to Redeem</div>
                        <div className="text-2xl font-heading text-yellow-400 mt-1">{maxCashout.toLocaleString()} <span className="text-sm">SovPoints</span></div>
                      </div>

                      {maxCashout < MIN_CASHOUT ? (
                        <div className="space-y-3">
                          <p className="text-xs font-bold uppercase text-black/50">
                            You need at least {MIN_CASHOUT} SovPoints to redeem. You have {maxCashout.toLocaleString()} pts.
                          </p>
                          <Link href="/" className="btn btn-outline inline-block text-xs" onClick={() => setShowRedeemModal(false)}>Earn more by viewing ads →</Link>
                        </div>
                      ) : (
                        <>
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
                              {parseFloat(cashoutAmount).toLocaleString()} SovPoints → {parseFloat(cashoutAmount).toLocaleString()} G$ to your wallet
                            </p>
                          )}

                          {message && (
                            <div className={`p-3 border-2 border-black font-bold text-xs uppercase ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                              {message.text}
                            </div>
                          )}

                          <button
                            onClick={cashoutGs}
                            disabled={cashouting || !cashoutAmount || parseFloat(cashoutAmount) < MIN_CASHOUT}
                            className="w-full btn btn-primary py-4 text-sm disabled:opacity-50 font-black uppercase"
                          >
                            {cashouting ? 'Signing Claim...' : `Redeem ${cashoutAmount ? parseFloat(cashoutAmount).toLocaleString() : '—'} pts → G$`}
                          </button>

                          <p className="text-[10px] font-bold uppercase text-black/40">
                            A signed transaction will be generated for you to submit from your wallet.
                          </p>
                        </>
                      )}
                    </>
                  ) : (
                    /* ── Step 2: Submit signed transaction on-chain ── */
                    <>
                      <div className="bg-green-100 border-2 border-green-600 p-4">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-green-800">Claim Signed ✓</div>
                        <p className="text-xs font-bold text-green-700 mt-1 uppercase">Submit the transaction below to receive your G$ tokens.</p>
                      </div>

                      {/* Transaction Details */}
                      <div className="bg-black/5 border-2 border-black p-4 font-mono text-[10px] space-y-1.5 overflow-x-auto">
                        <div><span className="font-bold">Contract:</span> {signedTx.to}</div>
                        <div><span className="font-bold">Function:</span> {signedTx.functionName}</div>
                        <div><span className="font-bold">Recipient:</span> {signedTx.args.recipient}</div>
                        <div><span className="font-bold">Amount:</span> {signedTx.args.amount} (wei)</div>
                        <div><span className="font-bold">Nonce:</span> {signedTx.args.nonce}</div>
                        <div><span className="font-bold">Deadline:</span> {new Date(Number(signedTx.args.deadline) * 1000).toLocaleString()}</div>
                        <div><span className="font-bold">Operator:</span> {signedTx.operator}</div>
                        <div className="break-all"><span className="font-bold">Sig:</span> {signedTx.args.signature.slice(0, 20)}...{signedTx.args.signature.slice(-10)}</div>
                      </div>

                      {message && (
                        <div className={`p-3 border-2 border-black font-bold text-xs uppercase ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {message.text}
                        </div>
                      )}

                      <button
                        onClick={submitSignedTx}
                        disabled={submittingTx || !walletClient}
                        className="w-full py-4 text-sm disabled:opacity-50 bg-yellow-400 border-4 border-black hover:bg-yellow-300 font-black uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all"
                      >
                        {submittingTx ? 'Submitting Transaction...' : 'Submit Transaction & Receive G$'}
                      </button>

                      <button
                        onClick={() => { setSignedTx(null); setMessage(null) }}
                        className="w-full text-[10px] font-bold uppercase text-black/40 hover:text-black underline"
                      >
                        ← Back to amount
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── CASHOUT HISTORY ── */}
          {cashouts.length > 0 && (
            <div className="card p-6 border-2 border-black/20">
              <h3 className="text-xs font-heading uppercase tracking-widest mb-4">G$ Redemption History</h3>
              <div className="space-y-2">
                {cashouts.map(c => (
                  <div key={c.id} className="border-b border-black/10 pb-3">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 font-bold uppercase text-[10px] ${statusColor(c.status)}`}>
                          {c.status}
                        </span>
                        {c.redeemed && (
                          <span className="px-2 py-0.5 font-bold uppercase text-[10px] text-blue-700 bg-blue-100">
                            Redeemed
                          </span>
                        )}
                        <span className="font-bold">{c.amount.toLocaleString()} G$</span>
                      </div>
                      <div className="flex items-center gap-3 text-black/40">
                        {c.redeemTxHash && (
                          <a
                            href={`https://celoscan.io/tx/${c.redeemTxHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline text-blue-600"
                          >
                            redeem tx ↗
                          </a>
                        )}
                        {(c.distributeTxHash || c.initiateTxHash) && !c.redeemTxHash && (
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
                    {c.redeemedAt && (
                      <div className="text-[10px] font-bold text-blue-600 mt-1">
                        Redeemed on {new Date(c.redeemedAt).toLocaleString()}
                      </div>
                    )}
                    {c.signature && !c.redeemed && c.status === 'signed' && (
                      <div className="mt-2">
                        <button
                          onClick={() => {
                            setSignedTx({
                              to: STREAMING_CONTRACT,
                              functionName: 'claimWithSignature',
                              args: {
                                recipient: address || '',
                                amount: parseUnits(c.amount.toFixed(18), 18).toString(),
                                claimRef: c.claimRef || '',
                                nonce: c.nonce || '0',
                                deadline: c.deadline || '0',
                                signature: c.signature || '',
                              },
                              operator: '',
                            })
                            setPendingCashoutId(c.id)
                            setShowRedeemModal(true)
                          }}
                          className="text-[10px] font-bold uppercase underline text-yellow-700 hover:text-yellow-900"
                        >
                          Submit pending transaction →
                        </button>
                      </div>
                    )}
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
