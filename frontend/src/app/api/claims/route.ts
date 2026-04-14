import { NextRequest, NextResponse } from 'next/server'
import { parseUnits } from 'viem'
import {
  isOperatorConfigured,
  signClaim,
  submitClaimOnChain,
  sendClaim,
  generateClaimRef,
  getRecipientNonce,
  isClaimRefUsed,
  isOperatorWhitelisted,
  getContractBalance,
  OPERATOR_ADDRESS,
} from '@/lib/streaming-claims'
import { formatUnits } from 'viem'

const isAddress = (v: unknown): v is string =>
  typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v)

/**
 * POST /api/claims
 *
 * Simple mode (recommended):
 *   { recipient, amount }
 *   Checks balance, signs, and submits the claim on-chain. Returns txHash.
 *
 * Advanced mode:
 *   { recipient, amount, claimId, submit? }
 *   Signs a claim with a custom claimId. If submit=true, also sends the tx.
 */
export async function POST(request: NextRequest) {
  try {
    if (!isOperatorConfigured) {
      return NextResponse.json(
        { error: 'SOVADS_OPERATOR_PRIVATE_KEY not configured' },
        { status: 503 }
      )
    }

    const body = await request.json()
    const { recipient, amount, claimId, submit } = body as {
      recipient?: string
      amount?: number
      claimId?: string
      submit?: boolean
    }

    if (!isAddress(recipient)) {
      return NextResponse.json({ error: 'Invalid recipient address' }, { status: 400 })
    }
    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
    }

    // Simple mode: just recipient + amount → sign & send in one shot
    if (!claimId) {
      const result = await sendClaim(recipient, amount)
      return NextResponse.json({
        success: true,
        txHash: result.txHash,
        claimRef: result.claimRef,
        recipient,
        amount,
      })
    }

    // Advanced mode: custom claimId, optionally submit
    const whitelisted = await isOperatorWhitelisted()
    if (!whitelisted) {
      return NextResponse.json(
        { error: 'Operator is not whitelisted on the contract. Call addOperator() first.', operator: OPERATOR_ADDRESS },
        { status: 503 }
      )
    }

    const claimRef = generateClaimRef(recipient, claimId)

    const used = await isClaimRefUsed(claimRef)
    if (used) {
      return NextResponse.json({ error: 'Claim already used', claimRef }, { status: 409 })
    }

    const rawAmount = parseUnits(amount.toFixed(18), 18)
    const signedClaim = await signClaim(recipient, rawAmount, claimRef)

    const response: Record<string, unknown> = {
      success: true,
      ...signedClaim,
    }

    if (submit) {
      const txHash = await submitClaimOnChain(
        recipient,
        rawAmount,
        claimRef,
        BigInt(signedClaim.nonce),
        BigInt(signedClaim.deadline),
        signedClaim.signature
      )
      response.txHash = txHash
      response.submitted = true
    }

    return NextResponse.json(response, { status: 200 })
  } catch (error) {
    console.error('Claim signing error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Claim signing failed' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/claims?recipient=0x...
 * Check the current nonce and operator status for a recipient.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const recipient = searchParams.get('recipient')

    if (!isAddress(recipient)) {
      return NextResponse.json({ error: 'Invalid recipient address' }, { status: 400 })
    }

    const [nonce, whitelisted, balance] = await Promise.all([
      getRecipientNonce(recipient),
      isOperatorWhitelisted(),
      getContractBalance(),
    ])

    return NextResponse.json({
      recipient,
      nonce: nonce.toString(),
      contractBalance: formatUnits(balance, 18),
      operatorConfigured: isOperatorConfigured,
      operatorWhitelisted: whitelisted,
      operator: OPERATOR_ADDRESS,
    })
  } catch (error) {
    console.error('Claim status error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch claim status' },
      { status: 500 }
    )
  }
}
