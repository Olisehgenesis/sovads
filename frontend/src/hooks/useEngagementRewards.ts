'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAccount, useWalletClient, usePublicClient } from 'wagmi'
import { useEngagementRewards as useEngagementRewardsSDK } from '@goodsdks/engagement-sdk'
import { compressToEncodedURIComponent } from 'lz-string'
import { createPublicClient, http } from 'viem'
import { celo } from 'viem/chains'

// Static Celo client — works even before wallet connects (same pattern as GoodDollarClaimGate)
const celoPublicClient = createPublicClient({
  chain: celo,
  transport: http(
    (process.env.NEXT_PUBLIC_CELO_MAINNET_RPC_URL || 'https://forno.celo.org').trim()
  ),
  batch: { multicall: false },
})

// GoodDollar face-verification constants (matches GoodWeb3-Mono/sdk-v2)
const FV_LOGIN_MSG = `Sign this message to login into GoodDollar Unique Identity service.\nWARNING: do not sign this message unless you trust the website/application requesting this signature.\nnonce:`
const FV_IDENTIFIER_MSG2 = `Sign this message to request verifying your account <account> and to create your own secret unique identifier for your anonymized record.\nYou can use this identifier in the future to delete this anonymized record.\nWARNING: do not sign this message unless you trust the website/application requesting this signature.`
const GOODID_URL = 'https://goodid.gooddollar.org'
const CELO_CHAIN_ID = 42220

const REWARDS_CONTRACT = (
  process.env.NEXT_PUBLIC_ENGAGEMENT_REWARDS_CONTRACT || '0x25db74CF4E7BA120526fd87e159CF656d94bAE43'
) as `0x${string}`

const APP_ADDRESS = (
  process.env.NEXT_PUBLIC_ENGAGEMENT_REWARDS_APP_ADDRESS || '0x8aE67ce409dA16e71Cda5f71465e563Fe2060b92'
) as `0x${string}`

const IDENTITY_ADDRESS = (
  process.env.NEXT_PUBLIC_GOODDOLLAR_IDENTITY_ADDRESS || '0xC361A6E67822a0EDc17D899227dd9FC50BD62F42'
) as `0x${string}`

const identityAbi = [
  {
    name: 'getWhitelistedRoot',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_addr', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const

// 180 days in milliseconds (cooldown period)
const COOLDOWN_MS = 180 * 24 * 60 * 60 * 1000

/**
 * Builds a real GoodDollar face-verification deep link (matches GoodWeb3-Mono ClaimSDK.getFVLink).
 * Requires the user's wallet signatures — call buildVerifyLink() from the hook which
 * collects the signatures via wagmi signMessage then compresses them with lz-string.
 *
 * Fallback (no signatures) returns the plain goodid portal so the user can start there.
 */
export function buildFVLink(params: {
  account: string
  nonce: string
  fvsig: string
  loginSig: string
  firstName?: string
  redirectUrl?: string
}): string {
  const { account, nonce, fvsig, loginSig, firstName = '', redirectUrl } = params
  const payload: Record<string, string | number> = {
    account,
    nonce,
    fvsig,
    firstname: firstName,
    sg: loginSig,
    chain: CELO_CHAIN_ID,
  }
  if (redirectUrl) payload['rdu'] = redirectUrl
  const url = new URL(GOODID_URL)
  url.searchParams.append('lz', compressToEncodedURIComponent(JSON.stringify(payload)))
  return url.toString()
}

export interface EngagementRewardState {
  isEligible: boolean | null
  isWhitelisted: boolean | null
  ineligibilityReason: string | null
  isClaiming: boolean
  isVerifying: boolean
  lastClaimTx: string | null
  lastClaimDate: Date | null
  cooldownDaysRemaining: number | null
  rewardAmount: bigint | null
  error: string | null
  claimBonus: (inviter?: string) => Promise<string | null>
  refreshEligibility: () => Promise<void>
  /** Signs the two FV messages and redirects to GoodID face-verification */
  verifyOnGoodDollar: (redirectUrl?: string) => Promise<void>
}

export function useEngagementRewards(): EngagementRewardState {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  // publicClient kept for any future on-chain writes; whitelist check uses static celoPublicClient
  usePublicClient()

  const sdk = useEngagementRewardsSDK(REWARDS_CONTRACT)

  const [isEligible, setIsEligible] = useState<boolean | null>(null)
  const [isWhitelisted, setIsWhitelisted] = useState<boolean | null>(null)
  const [ineligibilityReason, setIneligibilityReason] = useState<string | null>(null)
  const [isClaiming, setIsClaiming] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [lastClaimTx, setLastClaimTx] = useState<string | null>(null)
  const [lastClaimDate, setLastClaimDate] = useState<Date | null>(null)
  const [cooldownDaysRemaining, setCooldownDaysRemaining] = useState<number | null>(null)
  const [rewardAmount, setRewardAmount] = useState<bigint | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshEligibility = useCallback(async () => {
    if (!address || !sdk) {
      setIsEligible(null)
      setIsWhitelisted(null)
      setIneligibilityReason(null)
      return
    }

    try {
      // 1. Check GoodDollar whitelist status via static Celo client (works without wallet)
      let whitelisted = false
      try {
        const root = await celoPublicClient.readContract({
          address: IDENTITY_ADDRESS,
          abi: identityAbi,
          functionName: 'getWhitelistedRoot',
          args: [address],
        })
        whitelisted = root !== '0x0000000000000000000000000000000000000000'
      } catch {
        whitelisted = false
      }
      setIsWhitelisted(whitelisted)

      // 2. Check protocol-level eligibility (canClaim)
      const eligible = await sdk.canClaim(APP_ADDRESS, address).catch(() => false)

      // 3. Determine reason if not eligible
      if (!whitelisted) {
        setIneligibilityReason('not_whitelisted')
        setIsEligible(false)
      } else if (!eligible) {
        // Check our DB cooldown
        const res = await fetch(`/api/engagement-rewards/claim?wallet=${address}`)
        if (res.ok) {
          const data = await res.json()
          if (data.lastClaim) {
            setIneligibilityReason('cooldown')
          } else {
            // canClaim=false but no prior claim — app limit reached (4th app)
            setIneligibilityReason('app_limit')
          }
        } else {
          setIneligibilityReason('app_limit')
        }
        setIsEligible(false)
      } else {
        setIsEligible(true)
        setIneligibilityReason(null)
      }

      // 4. Get protocol reward amount
      try {
        const amt = await sdk.getRewardAmount()
        setRewardAmount(amt)
      } catch {
        // ignore
      }

      // 5. Cooldown days from DB
      const res2 = await fetch(`/api/engagement-rewards/claim?wallet=${address}`)
      if (res2.ok) {
        const data = await res2.json()
        if (data.lastClaim) {
          const claimDate = new Date(data.lastClaim)
          setLastClaimDate(claimDate)
          setLastClaimTx(data.txHash || null)
          const msElapsed = Date.now() - claimDate.getTime()
          if (msElapsed < COOLDOWN_MS) {
            const daysLeft = Math.ceil((COOLDOWN_MS - msElapsed) / (24 * 60 * 60 * 1000))
            setCooldownDaysRemaining(daysLeft)
          } else {
            setCooldownDaysRemaining(0)
          }
        } else {
          setCooldownDaysRemaining(0)
        }
      }
    } catch (err) {
      console.error('[useEngagementRewards] refreshEligibility error:', err)
      setError(err instanceof Error ? err.message : 'Failed to check eligibility')
    }
  }, [address, sdk])

  useEffect(() => {
    refreshEligibility()
  }, [refreshEligibility])

  const claimBonus = useCallback(
    async (inviter?: string): Promise<string | null> => {
      if (!address || !sdk || !walletClient) {
        setError('Wallet not connected')
        return null
      }

      setIsClaiming(true)
      setError(null)

      try {
        // Skip sdk.canClaim() — it may return false due to app_limit / indexing lag
        // even for fully eligible users. The contract itself will reject if truly ineligible.
        const currentBlock = await sdk.getCurrentBlockNumber()
        const validUntilBlock = currentBlock + 600n

        const inviterAddress = (inviter || '0x0000000000000000000000000000000000000000') as `0x${string}`

        const userSignature = await sdk.signClaim(APP_ADDRESS, inviterAddress, validUntilBlock)

        const signRes = await fetch('/api/engagement-rewards/sign-claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user: address,
            validUntilBlock: validUntilBlock.toString(),
            inviter: inviter || null,
          }),
        })

        if (!signRes.ok) {
          const errData = await signRes.json().catch(() => ({}))
          throw new Error(errData.error || 'Failed to get app signature')
        }

        const { signature: appSignature } = await signRes.json()

        const receipt = await sdk.nonContractAppClaim(
          APP_ADDRESS,
          inviterAddress,
          validUntilBlock,
          userSignature,
          appSignature as `0x${string}`,
        )

        const txHash = receipt.transactionHash

        await fetch('/api/engagement-rewards/claim', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: address, txHash, status: 'success' }),
        })

        setLastClaimTx(txHash)
        setLastClaimDate(new Date())
        setIsEligible(false)
        setCooldownDaysRemaining(180)
        setIneligibilityReason('cooldown')

        return txHash
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Claim failed'
        setError(msg)

        try {
          await fetch('/api/engagement-rewards/claim', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet: address, status: 'failed', error: msg }),
          })
        } catch {
          // ignore
        }

        return null
      } finally {
        setIsClaiming(false)
      }
    },
    [address, sdk, walletClient],
  )

  /**
   * Requests two wallet signatures (FV_LOGIN_MSG + FV_IDENTIFIER_MSG2),
   * builds the real GoodDollar FV deep link (lz-compressed), and redirects.
   * Matches GoodWeb3-Mono ClaimSDK.generateFVLink flow.
   */
  const verifyOnGoodDollar = useCallback(
    async (redirectUrl?: string) => {
      if (!walletClient || !address) {
        throw new Error('Wallet not connected')
      }
      setIsVerifying(true)
      try {
        const nonce = (Date.now() / 1000).toFixed(0)
        const loginMsg = FV_LOGIN_MSG + nonce
        const identifierMsg = FV_IDENTIFIER_MSG2.replace('<account>', address)

        // Both signatures required — user will see 2 wallet prompts
        const [loginSig, fvSig] = await Promise.all([
          walletClient.signMessage({ message: loginMsg }),
          walletClient.signMessage({ message: identifierMsg }),
        ])

        const link = buildFVLink({
          account: address,
          nonce,
          fvsig: fvSig,
          loginSig,
          redirectUrl,
        })

        window.location.href = link
      } finally {
        setIsVerifying(false)
      }
    },
    [address, walletClient],
  )

  return {
    isEligible,
    isWhitelisted,
    ineligibilityReason,
    isClaiming,
    isVerifying,
    lastClaimTx,
    lastClaimDate,
    cooldownDaysRemaining,
    rewardAmount,
    error,
    claimBonus,
    refreshEligibility,
    verifyOnGoodDollar,
  }
}

