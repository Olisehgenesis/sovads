/**
 * SovadGs integration - G$ payouts via SovadGs contract
 * Supports: direct payout, initiate-claim flow, batch distribute
 */

import { createPublicClient, createWalletClient, http, formatUnits, parseUnits, keccak256, encodePacked } from 'viem'
import { celo } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { SOVADS_MANAGER_ADDRESS, SOVADGS_CONTRACT_ADDRESS } from './chain-config'
import { sovAdsManagerAbi } from '../contract/abi'
import { sovadGsAbi } from '../contract/sovadGsAbi'

export const GS_TOKEN_ADDRESS = '0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A' as const

// G$ on Celo uses 18 decimals. 1 SovPoint = 1 G$
const GS_DECIMALS = 18

// Minimum cashout amount (in SovPoints / G$)
export const MINIMUM_CASHOUT_POINTS = 10

// Designate Campaign ID 1 as the Global Treasury for G$ payouts (SovAdsManager fallback)
export const GLOBAL_TREASURY_CAMPAIGN_ID = BigInt(1)

const RPC = process.env.CELO_MAINNET_RPC_URL || 'https://rpc.ankr.com/celo'
const PAYOUT_PRIVATE_KEY = process.env.SOVADGS_PAYOUT_PRIVATE_KEY

const publicClient = createPublicClient({
  chain: celo,
  transport: http(RPC)
})

const account = PAYOUT_PRIVATE_KEY && /^0x[0-9a-fA-F]{64}$/.test(PAYOUT_PRIVATE_KEY)
  ? privateKeyToAccount(PAYOUT_PRIVATE_KEY as `0x${string}`)
  : null

const walletClient = account
  ? createWalletClient({
    account,
    chain: celo,
    transport: http(RPC)
  })
  : null

export const PAYOUT_ADDRESS = account?.address || null

/** Whether the SovadGs contract is configured (has an address) */
export const hasSovadGsContract = !!SOVADGS_CONTRACT_ADDRESS

/** Convert SovPoints to raw G$ amount (1 SovPoint = 1 G$) */
export function sovPointsToRaw(amount: number): bigint {
  return parseUnits(amount.toFixed(GS_DECIMALS), GS_DECIMALS)
}

/** Convert raw G$ to SovPoints */
export function rawToSovPoints(raw: bigint): number {
  return parseFloat(formatUnits(raw, GS_DECIMALS))
}

/** Generate a deterministic claim ref from wallet + nonce */
export function generateClaimRef(wallet: string, nonce: string): `0x${string}` {
  return keccak256(encodePacked(['address', 'string'], [wallet as `0x${string}`, nonce]))
}

// ─────────────────────────────────────────────────────────────────────────────
// READ functions
// ─────────────────────────────────────────────────────────────────────────────

/** Get SovadGs treasury G$ balance from the designated Global Treasury campaign */
export async function getTreasuryBalance(): Promise<number> {
  try {
    const vault = await publicClient.readContract({
      address: SOVADS_MANAGER_ADDRESS as `0x${string}`,
      abi: sovAdsManagerAbi,
      functionName: 'getCampaignVault',
      args: [GLOBAL_TREASURY_CAMPAIGN_ID]
    }) as any
    // vault is [token, totalFunded, locked, claimed]
    const available = BigInt(vault[1]) - BigInt(vault[3]) - BigInt(vault[2])
    return rawToSovPoints(available)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (!msg.includes('reverted') && !msg.includes('revert')) {
      console.warn('Failed to fetch treasury balance:', msg)
    }
    return 0
  }
}

/** Get SovadGs contract GS balance (if contract is configured) */
export async function getGsContractBalance(): Promise<number> {
  if (!hasSovadGsContract) return 0
  try {
    const gsBalance = await publicClient.readContract({
      address: GS_TOKEN_ADDRESS,
      abi: [{ inputs: [{ internalType: 'address', name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' }],
      functionName: 'balanceOf',
      args: [SOVADGS_CONTRACT_ADDRESS as `0x${string}`]
    }) as bigint
    return rawToSovPoints(gsBalance)
  } catch {
    return 0
  }
}

/** Get a claim status from SovadGs contract */
export async function getClaimStatus(ref: `0x${string}`): Promise<{ recipient: string; amount: number; status: 'Pending' | 'Completed' | 'Cancelled' } | null> {
  if (!hasSovadGsContract) return null
  try {
    const claim = await publicClient.readContract({
      address: SOVADGS_CONTRACT_ADDRESS as `0x${string}`,
      abi: sovadGsAbi,
      functionName: 'claims',
      args: [ref]
    }) as readonly [string, bigint, number]
    if (!claim[0] || claim[0] === '0x0000000000000000000000000000000000000000') return null
    const statusMap = ['Pending', 'Completed', 'Cancelled'] as const
    return {
      recipient: claim[0],
      amount: rawToSovPoints(claim[1]),
      status: statusMap[claim[2]] || 'Pending'
    }
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WRITE functions (admin wallet)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute G$ payout to recipient via SovadGs.claimDirect (immediate, no review step).
 * Falls back to SovAdsManager.disburseFunds if SovadGs contract is not configured.
 */
export async function payoutG$(recipient: string, sovPoints: number): Promise<string> {
  if (!walletClient) {
    throw new Error('SOVADGS_PAYOUT_PRIVATE_KEY not configured')
  }
  const amount = sovPointsToRaw(sovPoints)

  if (hasSovadGsContract) {
    const txHash = await walletClient.writeContract({
      address: SOVADGS_CONTRACT_ADDRESS as `0x${string}`,
      abi: sovadGsAbi,
      functionName: 'claimDirect',
      args: [recipient as `0x${string}`, amount]
    })
    return txHash
  }

  // Fallback: use SovAdsManager campaign treasury
  const txHash = await walletClient.writeContract({
    address: SOVADS_MANAGER_ADDRESS as `0x${string}`,
    abi: sovAdsManagerAbi,
    functionName: 'disburseFunds',
    args: [GLOBAL_TREASURY_CAMPAIGN_ID, recipient as `0x${string}`, amount]
  })
  return txHash
}

/**
 * Initiate a GS cashout claim on SovadGs contract (creates pending claim for admin to approve).
 * Returns the on-chain tx hash.
 */
export async function initiateCashoutClaim(
  recipient: string,
  sovPoints: number,
  ref: `0x${string}`
): Promise<string> {
  if (!walletClient) {
    throw new Error('SOVADGS_PAYOUT_PRIVATE_KEY not configured')
  }
  if (!hasSovadGsContract) {
    throw new Error('SOVADGS_CONTRACT_ADDRESS not configured')
  }
  const amount = sovPointsToRaw(sovPoints)
  const txHash = await walletClient.writeContract({
    address: SOVADGS_CONTRACT_ADDRESS as `0x${string}`,
    abi: sovadGsAbi,
    functionName: 'initiateClaim',
    args: [recipient as `0x${string}`, amount, ref]
  })
  return txHash
}

/**
 * Admin: batch-distribute pending claims via claimDateClaim.
 * Processes multiple cashout requests in one transaction.
 */
export async function batchProcessClaims(refs: `0x${string}`[]): Promise<string> {
  if (!walletClient) {
    throw new Error('SOVADGS_PAYOUT_PRIVATE_KEY not configured')
  }
  if (!hasSovadGsContract) {
    throw new Error('SOVADGS_CONTRACT_ADDRESS not configured')
  }
  const txHash = await walletClient.writeContract({
    address: SOVADGS_CONTRACT_ADDRESS as `0x${string}`,
    abi: sovadGsAbi,
    functionName: 'claimDateClaim',
    args: [refs]
  })
  return txHash
}

/**
 * Admin: batch send G$ directly to multiple recipients (no claim flow).
 */
export async function batchSendGs(recipients: string[], amounts: number[]): Promise<string> {
  if (!walletClient) {
    throw new Error('SOVADGS_PAYOUT_PRIVATE_KEY not configured')
  }
  if (!hasSovadGsContract) {
    throw new Error('SOVADGS_CONTRACT_ADDRESS not configured')
  }
  const rawAmounts = amounts.map(a => sovPointsToRaw(a))
  const txHash = await walletClient.writeContract({
    address: SOVADGS_CONTRACT_ADDRESS as `0x${string}`,
    abi: sovadGsAbi,
    functionName: 'batchSend',
    args: [recipients as `0x${string}`[], rawAmounts]
  })
  return txHash
}

/**
 * Admin: cancel a pending claim on SovadGs contract.
 */
export async function cancelClaim(ref: `0x${string}`): Promise<string> {
  if (!walletClient) {
    throw new Error('SOVADGS_PAYOUT_PRIVATE_KEY not configured')
  }
  if (!hasSovadGsContract) {
    throw new Error('SOVADGS_CONTRACT_ADDRESS not configured')
  }
  const txHash = await walletClient.writeContract({
    address: SOVADGS_CONTRACT_ADDRESS as `0x${string}`,
    abi: sovadGsAbi,
    functionName: 'cancelClaim',
    args: [ref]
  })
  return txHash
}

/** Admin top-up: deposit G$ into the designated Global Treasury campaign vault */
export async function adminTopup(sovPoints: number): Promise<string> {
  if (!walletClient) {
    throw new Error('SOVADGS_PAYOUT_PRIVATE_KEY not configured')
  }
  const amount = sovPointsToRaw(sovPoints)
  const txHash = await walletClient.writeContract({
    address: SOVADS_MANAGER_ADDRESS as `0x${string}`,
    abi: sovAdsManagerAbi,
    functionName: 'topUpCampaign',
    args: [GLOBAL_TREASURY_CAMPAIGN_ID, amount]
  })
  return txHash
}

export const isSovadGsConfigured = !!walletClient

