import { NextResponse } from 'next/server'
import {
  isOperatorConfigured,
  OPERATOR_ADDRESS,
  isOperatorWhitelisted,
  getContractBalance,
} from '@/lib/streaming-claims'
import {
  isSovadGsConfigured,
  hasSovadGsContract,
  PAYOUT_ADDRESS,
  MINIMUM_CASHOUT_POINTS,
  getTreasuryBalance,
} from '@/lib/sovadgs'
import { SOVADS_STREAMING_ADDRESS, GOODDOLLAR_ADDRESS, SOVADGS_CONTRACT_ADDRESS } from '@/lib/chain-config'
import { formatUnits } from 'viem'

/**
 * GET /api/viewers/redeem/health
 * Health check for the redeem system — checks operator config, whitelist, contract balance, etc.
 */
export async function GET() {
  const checks: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    operatorConfigured: isOperatorConfigured,
    operatorAddress: OPERATOR_ADDRESS,
    streamingContract: SOVADS_STREAMING_ADDRESS,
    gooddollarToken: GOODDOLLAR_ADDRESS,
    sovadGsContract: SOVADGS_CONTRACT_ADDRESS || null,
    sovadGsConfigured: isSovadGsConfigured,
    hasSovadGsContract,
    payoutAddress: PAYOUT_ADDRESS,
    minimumCashout: MINIMUM_CASHOUT_POINTS,
    envKeys: {
      SOVADS_OPERATOR_PRIVATE_KEY: !!process.env.SOVADS_OPERATOR_PRIVATE_KEY,
      SOVADS_OPERATOR_PRIVATE_KEY_LEN: process.env.SOVADS_OPERATOR_PRIVATE_KEY?.length || 0,
      SOVADGS_PAYOUT_PRIVATE_KEY: !!process.env.SOVADGS_PAYOUT_PRIVATE_KEY,
      CELO_MAINNET_RPC_URL: !!process.env.CELO_MAINNET_RPC_URL,
    },
  }

  try {
    if (isOperatorConfigured) {
      const [whitelisted, balance] = await Promise.all([
        isOperatorWhitelisted(),
        getContractBalance(),
      ])
      checks.operatorWhitelisted = whitelisted
      checks.contractBalanceRaw = balance.toString()
      checks.contractBalanceG$ = formatUnits(balance, 18)
    }
  } catch (e) {
    checks.onChainError = e instanceof Error ? e.message : String(e)
  }

  try {
    checks.treasuryBalance = await getTreasuryBalance()
  } catch (e) {
    checks.treasuryError = e instanceof Error ? e.message : String(e)
  }

  const allGood = isOperatorConfigured &&
    checks.operatorWhitelisted === true &&
    typeof checks.contractBalanceG$ === 'string' && parseFloat(checks.contractBalanceG$ as string) > 0

  return NextResponse.json({
    status: allGood ? 'healthy' : 'degraded',
    ...checks,
  })
}
