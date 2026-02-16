/**
 * SovadGs integration - G$ payouts
 * Contract: 0xA37c1de1823dEe184C4ce9bA2CEDDeD9b7fE578E
 * G$ token: 0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A (Celo mainnet)
 *
 * Rates: 1 G$ = $0.0001 | 1 USDC = 10,000 G$ | Contract: 1e16 G$ raw per 1 USDC raw
 */

import { createPublicClient, createWalletClient, http, formatUnits, parseUnits } from 'viem'
import { celo } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'

export const SOVADGS_ADDRESS = '0xA37c1de1823dEe184C4ce9bA2CEDDeD9b7fE578E' as const
export const GS_TOKEN_ADDRESS = '0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A' as const

// G$ uses 2 decimals. 1 SovPoint = 1 G$
const GS_DECIMALS = 2

const RPC = process.env.CELO_MAINNET_RPC_URL || 'https://rpc.ankr.com/celo'
const PAYOUT_PRIVATE_KEY = process.env.SOVADGS_PAYOUT_PRIVATE_KEY

const SOVADGS_ABI = [
  {
    name: 'claimDirect',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: []
  },
  {
    name: 'getTreasuryBalance',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }]
  },
  {
    name: 'adminTopup',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: []
  }
] as const

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

/** Convert SovPoints to raw G$ amount (1 SovPoint = 1 G$) */
export function sovPointsToRaw(amount: number): bigint {
  return parseUnits(amount.toFixed(GS_DECIMALS), GS_DECIMALS)
}

/** Convert raw G$ to SovPoints */
export function rawToSovPoints(raw: bigint): number {
  return parseFloat(formatUnits(raw, GS_DECIMALS))
}

/** Get SovadGs treasury G$ balance */
export async function getTreasuryBalance(): Promise<number> {
  try {
    const balance = await publicClient.readContract({
      address: SOVADGS_ADDRESS,
      abi: SOVADGS_ABI,
      functionName: 'getTreasuryBalance'
    })
    return rawToSovPoints(balance)
  } catch {
    return 0
  }
}

/** Execute G$ payout to recipient (admin only) */
export async function payoutG$(recipient: string, sovPoints: number): Promise<string> {
  if (!walletClient) {
    throw new Error('SOVADGS_PAYOUT_PRIVATE_KEY not configured')
  }
  const amount = sovPointsToRaw(sovPoints)
  const txHash = await walletClient.writeContract({
    address: SOVADGS_ADDRESS,
    abi: SOVADGS_ABI,
    functionName: 'claimDirect',
    args: [recipient as `0x${string}`, amount]
  })
  return txHash
}

/** Admin topup: deposit G$ from admin wallet into SovadGs contract */
export async function adminTopup(sovPoints: number): Promise<string> {
  if (!walletClient) {
    throw new Error('SOVADGS_PAYOUT_PRIVATE_KEY not configured')
  }
  const amount = sovPointsToRaw(sovPoints)
  const txHash = await walletClient.writeContract({
    address: SOVADGS_ADDRESS,
    abi: SOVADGS_ABI,
    functionName: 'adminTopup',
    args: [amount]
  })
  return txHash
}

export const TREASURY_ADDRESS = '0x8aE67ce409dA16e71Cda5f71465e563Fe2060b92' as const
export const isSovadGsConfigured = !!walletClient
