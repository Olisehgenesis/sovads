'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAccount, useChainId, usePublicClient, useWriteContract } from 'wagmi'
import { formatUnits, zeroAddress } from 'viem'
import {
  CELO_MAINNET_CHAIN_ID,
  GOODDOLLAR_ADDRESS,
  GOODDOLLAR_IDENTITY_ADDRESS,
  GOODDOLLAR_UBI_ADDRESS,
  GOODDOLLAR_VERIFY_URL,
} from '@/lib/chain-config'

type ClaimGateStatus = {
  loading: boolean
  configured: boolean
  verified: boolean
  claimable: boolean
  walletBalance: bigint | null
  tokenDecimals: number
  lastCheckedAt: number | null
  error: string | null
}

const GOODDOLLAR_GATE_SEEN_COOKIE = 'sovads_gd_gate_seen'

const identityAbi = [
  {
    name: 'getWhitelistedRoot',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_addr', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const

const ubiAbi = [
  {
    name: 'checkEntitlement',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_claimer', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'claim',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
] as const

const erc20Abi = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const

function formatBalanceForDisplay(amount: bigint | null, decimals: number): string {
  if (amount === null) return '0'
  const asNumber = Number(formatUnits(amount, decimals))
  if (Number.isFinite(asNumber)) {
    return asNumber.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }
  return formatUnits(amount, decimals)
}

function isAddress(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value)
}

function hasSeenGateToday(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie
    .split(';')
    .map((item) => item.trim())
    .some((item) => item.startsWith(`${GOODDOLLAR_GATE_SEEN_COOKIE}=`))
}

function markGateSeenUntilMidnight(): void {
  if (typeof document === 'undefined') return
  const nextMidnight = new Date()
  nextMidnight.setHours(24, 0, 0, 0)
  document.cookie = `${GOODDOLLAR_GATE_SEEN_COOKIE}=1; expires=${nextMidnight.toUTCString()}; path=/; SameSite=Lax`
}

export default function GoodDollarClaimGate() {
  const { address, isConnected } = useAccount()
  const pathname = usePathname()
  const chainId = useChainId()
  const publicClient = usePublicClient({ chainId: CELO_MAINNET_CHAIN_ID })
  const { writeContractAsync } = useWriteContract()

  const [status, setStatus] = useState<ClaimGateStatus>({
    loading: false,
    configured: false,
    verified: false,
    claimable: false,
    walletBalance: null,
    tokenDecimals: 18,
    lastCheckedAt: null,
    error: null,
  })
  const [visible, setVisible] = useState(false)
  const [isClaiming, setIsClaiming] = useState(false)

  const hideGateForToday = useCallback(() => {
    markGateSeenUntilMidnight()
    setVisible(false)
  }, [])

  const showGateOncePerDay = useCallback(() => {
    if (hasSeenGateToday()) {
      setVisible(false)
      return
    }
    markGateSeenUntilMidnight()
    setVisible(true)
  }, [])

  const identityAddress = useMemo(
    () => (isAddress(GOODDOLLAR_IDENTITY_ADDRESS) ? GOODDOLLAR_IDENTITY_ADDRESS : undefined),
    []
  )
  const ubiAddress = useMemo(
    () => (isAddress(GOODDOLLAR_UBI_ADDRESS) ? GOODDOLLAR_UBI_ADDRESS : undefined),
    []
  )
  const gDollarAddress = useMemo(
    () => (isAddress(GOODDOLLAR_ADDRESS) ? GOODDOLLAR_ADDRESS : undefined),
    []
  )
  const isConfigured = Boolean(identityAddress && ubiAddress)
  const isOnStakingPage = pathname === '/staking'
  const oneTokenInBaseUnits = 10n ** BigInt(status.tokenDecimals)
  const canStakeNow = status.walletBalance !== null && status.walletBalance > oneTokenInBaseUnits
  const gDollarBalanceLabel = formatBalanceForDisplay(status.walletBalance, status.tokenDecimals)

  const refreshStatus = useCallback(async () => {
    if (!isConnected || !address) {
      setStatus((prev) => ({
        ...prev,
        loading: false,
        verified: false,
        claimable: false,
        walletBalance: null,
        error: null,
      }))
      return
    }

    if (!isConfigured) {
      setStatus((prev) => ({
        ...prev,
        loading: false,
        configured: false,
        verified: false,
        claimable: false,
        walletBalance: null,
        error: 'GoodDollar contracts are not configured in env',
      }))
      return
    }

    if (!publicClient) {
      setStatus((prev) => ({
        ...prev,
        loading: false,
        configured: true,
        verified: false,
        claimable: false,
        walletBalance: null,
        error: 'No blockchain client available',
      }))
      return
    }

    const identity = identityAddress
    const ubi = ubiAddress
    if (!identity || !ubi) {
      setStatus((prev) => ({
        ...prev,
        loading: false,
        configured: false,
        verified: false,
        claimable: false,
        walletBalance: null,
        error: 'GoodDollar contracts are not configured in env',
      }))
      return
    }

    setStatus((prev) => ({ ...prev, loading: true, configured: true, error: null }))

    try {
      const root = (await publicClient.readContract({
        address: identity,
        abi: identityAbi,
        functionName: 'getWhitelistedRoot',
        args: [address],
      })) as `0x${string}`

      const verified = root.toLowerCase() !== zeroAddress

      let claimable = false
      let walletBalance: bigint | null = null
      let tokenDecimals = 18

      if (verified) {
        const entitlement = (await publicClient.readContract({
          address: ubi,
          abi: ubiAbi,
          functionName: 'checkEntitlement',
          args: [root],
        })) as bigint

        claimable = entitlement > 0n

        if (gDollarAddress) {
          tokenDecimals = Number(
            (await publicClient.readContract({
              address: gDollarAddress,
              abi: erc20Abi,
              functionName: 'decimals',
            })) as number
          )

          walletBalance = (await publicClient.readContract({
            address: gDollarAddress,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [address],
          })) as bigint
        }
      }

      setStatus({
        loading: false,
        configured: true,
        verified,
        claimable,
        walletBalance,
        tokenDecimals,
        lastCheckedAt: Date.now(),
        error: null,
      })

      showGateOncePerDay()
    } catch (error) {
      setStatus({
        loading: false,
        configured: true,
        verified: false,
        claimable: false,
        walletBalance: null,
        tokenDecimals: 18,
        lastCheckedAt: Date.now(),
        error: error instanceof Error ? error.message : 'Failed to check claim status',
      })
      showGateOncePerDay()
    }
  }, [address, gDollarAddress, identityAddress, isConfigured, isConnected, publicClient, showGateOncePerDay, ubiAddress])

  useEffect(() => {
    if (!isConnected || !address) {
      setVisible(false)
      return
    }

    void refreshStatus()
  }, [address, isConnected, refreshStatus])

  const claimNow = useCallback(async () => {
    if (!ubiAddress || !writeContractAsync || chainId !== CELO_MAINNET_CHAIN_ID) return

    try {
      setIsClaiming(true)
      await writeContractAsync({
        address: ubiAddress,
        abi: ubiAbi,
        functionName: 'claim',
        chainId: CELO_MAINNET_CHAIN_ID,
      })
      await refreshStatus()
    } catch (error) {
      setStatus((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Claim failed',
      }))
    } finally {
      setIsClaiming(false)
    }
  }, [chainId, refreshStatus, ubiAddress, writeContractAsync])

  if (!isConnected || !address) return null

  return (
    <>
      <Link
        href="/staking"
        className="fixed bottom-4 right-4 z-40 border-2 border-black bg-yellow-400 px-4 py-2 text-xs font-black uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 hover:-translate-x-0.5 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all"
      >
        Stake G$
      </Link>

      {visible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={hideGateForToday} />

          <div className="relative w-full max-w-md border-4 border-black bg-white p-6 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)]">
            <div className="mb-4 flex items-center justify-between border-b-2 border-black pb-2">
              <h2 className="text-lg font-black uppercase tracking-wider">GoodDollar Check</h2>
              <button
                onClick={hideGateForToday}
                className="border-2 border-black px-2 py-0.5 text-[10px] font-black uppercase"
              >
                Close
              </button>
            </div>

            {chainId !== CELO_MAINNET_CHAIN_ID && (
              <div className="mb-4 border-2 border-red-600 bg-red-100 p-3 text-xs font-bold uppercase text-red-800">
                Switch to Celo to verify and claim GoodDollar.
              </div>
            )}

            {status.loading ? (
              <p className="text-xs font-bold uppercase">Checking verification and claim status...</p>
            ) : !status.configured ? (
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase text-black/70">
                  GoodDollar claim contracts are not configured yet.
                </p>
                {isOnStakingPage ? (
                  <button onClick={hideGateForToday} className="btn btn-primary w-full text-center">
                    Close
                  </button>
                ) : (
                  <Link href="/staking" className="btn btn-primary w-full text-center" onClick={hideGateForToday}>
                    Go to Staking
                  </Link>
                )}
              </div>
            ) : !status.verified ? (
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase text-black/70">
                  Your wallet is not GoodDollar verified. Verify first to unlock daily claims.
                </p>
                <a
                  href={GOODDOLLAR_VERIFY_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-primary block w-full text-center"
                >
                  Verify with GoodDollar
                </a>
                {isOnStakingPage ? (
                  <button onClick={hideGateForToday} className="btn btn-outline block w-full text-center">
                    Continue to Staking
                  </button>
                ) : (
                  <Link href="/staking" className="btn btn-outline block w-full text-center" onClick={hideGateForToday}>
                    Continue to Staking
                  </Link>
                )}
              </div>
            ) : status.claimable ? (
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase text-black/70">
                  Verified. You have a daily GoodDollar claim available.
                </p>
                <button
                  onClick={claimNow}
                  disabled={isClaiming || chainId !== CELO_MAINNET_CHAIN_ID}
                  className="btn btn-primary w-full disabled:opacity-50"
                >
                  {isClaiming ? 'Claiming...' : 'Claim G$'}
                </button>
                {isOnStakingPage ? (
                  <button onClick={hideGateForToday} className="btn btn-outline block w-full text-center">
                    Stake G$ Now
                  </button>
                ) : (
                  <Link href="/staking" className="btn btn-outline block w-full text-center" onClick={hideGateForToday}>
                    Stake G$ Now
                  </Link>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {canStakeNow ? (
                  <p className="text-xs font-bold uppercase text-black/70">
                    You have {gDollarBalanceLabel} G$. Since that is above 1 G$, you can stake now to earn SOV rewards.
                  </p>
                ) : (
                  <p className="text-xs font-bold uppercase text-black/70">
                    You have {gDollarBalanceLabel} G$. Once your balance is above 1 G$, you can stake to earn SOV rewards.
                  </p>
                )}
                {isOnStakingPage ? (
                  <button onClick={hideGateForToday} className="btn btn-primary block w-full text-center">
                    Close
                  </button>
                ) : (
                  <Link href="/staking" className="btn btn-primary block w-full text-center" onClick={hideGateForToday}>
                    Open Staking
                  </Link>
                )}
              </div>
            )}

            {status.error && (
              <p className="mt-4 border-2 border-red-500 bg-red-50 p-2 text-[10px] font-bold uppercase text-red-700">
                {status.error}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
