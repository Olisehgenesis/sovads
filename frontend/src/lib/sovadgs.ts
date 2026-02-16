/**
 * SovadGs integration - G$ payouts
 * Unified under SovAdsManager
 */

import { createPublicClient, createWalletClient, http, formatUnits, parseUnits } from 'viem'
import { celo } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { SOVADS_MANAGER_ADDRESS } from './chain-config'
import { sovAdsManagerAbi } from '../contract/abi'

export const GS_TOKEN_ADDRESS = '0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A' as const

// G$ on Celo uses 18 decimals. 1 SovPoint = 1 G$
const GS_DECIMALS = 18

// Designate Campaign ID 1 as the Global Treasury for G$ payouts if needed
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

/** Convert SovPoints to raw G$ amount (1 SovPoint = 1 G$) */
export function sovPointsToRaw(amount: number): bigint {
  return parseUnits(amount.toFixed(GS_DECIMALS), GS_DECIMALS)
}

/** Convert raw G$ to SovPoints */
export function rawToSovPoints(raw: bigint): number {
  return parseFloat(formatUnits(raw, GS_DECIMALS))
}

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
    console.warn('Failed to fetch treasury balance:', error)
    return 0
  }
}

/** Execute G$ payout to recipient (admin only) using disburseFunds on the Global Treasury campaign */
export async function payoutG$(recipient: string, sovPoints: number): Promise<string> {
  if (!walletClient) {
    throw new Error('SOVADGS_PAYOUT_PRIVATE_KEY not configured')
  }
  const amount = sovPointsToRaw(sovPoints)
  const txHash = await walletClient.writeContract({
    address: SOVADS_MANAGER_ADDRESS as `0x${string}`,
    abi: sovAdsManagerAbi,
    functionName: 'disburseFunds',
    args: [GLOBAL_TREASURY_CAMPAIGN_ID, recipient as `0x${string}`, amount]
  })
  return txHash
}

/** Admin topup: deposit G$ into the designated Global Treasury campaign vault */
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
