import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseUnits } from 'viem'
import {
  isOperatorConfigured,
  signClaim,
  generateClaimRef,
  getRecipientNonce,
  isClaimRefUsed,
  isOperatorWhitelisted,
  getContractBalance,
  OPERATOR_ADDRESS,
} from '@/lib/streaming-claims'
import { MINIMUM_CASHOUT_POINTS } from '@/lib/sovadgs'
import { formatUnits } from 'viem'
import { SOVADS_STREAMING_ADDRESS } from '@/lib/chain-config'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const isAddress = (v: unknown): v is string =>
  typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v)

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

/**
 * GET /api/viewers/redeem?wallet=0x...
 * Returns redemption history (cashouts with redeemed status) for a wallet
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const wallet = searchParams.get('wallet')?.toLowerCase()

    if (!wallet || !isAddress(wallet)) {
      return NextResponse.json({ error: 'Valid wallet address required' }, { status: 400, headers: corsHeaders })
    }

    const viewer = await prisma.viewerPoints.findFirst({ where: { wallet } })
    if (!viewer) {
      return NextResponse.json({ redemptions: [], pendingPoints: 0, totalRedeemed: 0 }, { headers: corsHeaders })
    }

    const redemptions = await prisma.viewerCashout.findMany({
      where: { viewerId: viewer.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    const totalRedeemed = redemptions
      .filter(r => r.redeemed)
      .reduce((sum, r) => sum + r.amount, 0)

    // Available = total earned minus only what was actually redeemed on-chain
    const availablePoints = Math.max(viewer.totalPoints - totalRedeemed, 0)

    return NextResponse.json(
      {
        availablePoints,
        pendingPoints: availablePoints,
        totalPoints: viewer.totalPoints,
        claimedPoints: viewer.claimedPoints,
        totalRedeemed,
        redemptions: redemptions.map(r => ({
          id: r.id,
          amount: r.amount,
          status: r.status,
          redeemed: r.redeemed,
          redeemedAt: r.redeemedAt,
          redeemTxHash: r.redeemTxHash,
          claimRef: r.claimRef,
          signature: r.signature,
          nonce: r.nonce,
          deadline: r.deadline,
          initiateTxHash: r.initiateTxHash,
          distributeTxHash: r.distributeTxHash,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        })),
      },
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error('Redeem GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders })
  }
}

/**
 * POST /api/viewers/redeem
 * Body: { wallet: string, amount: number }
 *
 * Signs an EIP-712 claim and returns the signed transaction data
 * for the user to submit on-chain via claimWithSignature.
 * Does NOT submit the transaction — the user posts it themselves.
 */
export async function POST(request: NextRequest) {
  try {
    if (!isOperatorConfigured) {
      return NextResponse.json(
        { error: 'Operator not configured. Contact admin.' },
        { status: 503, headers: corsHeaders }
      )
    }

    const body = await request.json()
    const { wallet, amount } = body as { wallet?: string; amount?: number }

    if (!isAddress(wallet)) {
      return NextResponse.json({ error: 'Valid wallet address required' }, { status: 400, headers: corsHeaders })
    }
    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400, headers: corsHeaders })
    }
    if (amount < MINIMUM_CASHOUT_POINTS) {
      return NextResponse.json(
        { error: `Minimum redemption is ${MINIMUM_CASHOUT_POINTS} G$` },
        { status: 400, headers: corsHeaders }
      )
    }

    const normalizedWallet = wallet.toLowerCase()

    const viewer = await prisma.viewerPoints.findFirst({ where: { wallet: normalizedWallet } })
    if (!viewer) {
      return NextResponse.json(
        { error: 'No points found for this wallet' },
        { status: 400, headers: corsHeaders }
      )
    }

    // Calculate available based on actual on-chain redemptions, not claimedPoints
    const onChainRedeemed = await prisma.viewerCashout.aggregate({
      where: { viewerId: viewer.id, redeemed: true },
      _sum: { amount: true },
    })
    const totalOnChainRedeemed = onChainRedeemed._sum.amount || 0
    const availablePoints = Math.max(viewer.totalPoints - totalOnChainRedeemed, 0)

    if (availablePoints < amount) {
      return NextResponse.json(
        { error: `Insufficient points. Available: ${availablePoints}` },
        { status: 400, headers: corsHeaders }
      )
    }

    // Check operator is whitelisted on-chain
    const whitelisted = await isOperatorWhitelisted()
    if (!whitelisted) {
      return NextResponse.json(
        { error: 'Operator not whitelisted on contract. Contact admin.' },
        { status: 503, headers: corsHeaders }
      )
    }

    // Check contract has enough G$
    const balance = await getContractBalance()
    const rawAmount = parseUnits(amount.toFixed(18), 18)
    if (balance < rawAmount) {
      return NextResponse.json(
        { error: `Insufficient contract balance. Try a smaller amount.` },
        { status: 503, headers: corsHeaders }
      )
    }

    // Get nonce and generate claimRef
    const nonce = await getRecipientNonce(normalizedWallet)
    const claimRef = generateClaimRef(normalizedWallet, nonce.toString())

    // Check not already used
    const used = await isClaimRefUsed(claimRef)
    if (used) {
      return NextResponse.json(
        { error: 'Claim ref already used. Try again shortly.' },
        { status: 409, headers: corsHeaders }
      )
    }

    // Sign the EIP-712 claim (1 hour deadline)
    const signedClaim = await signClaim(normalizedWallet, rawAmount, claimRef)

    // Update points in DB (track via claimedPoints but available is based on on-chain redeemed)
    await prisma.viewerPoints.update({
      where: { id: viewer.id },
      data: {
        pendingPoints: Math.max(availablePoints - amount, 0),
        claimedPoints: { increment: amount },
      },
    })

    // Create cashout record with signed tx data
    const cashout = await prisma.viewerCashout.create({
      data: {
        viewerId: viewer.id,
        wallet: normalizedWallet,
        amount,
        claimRef,
        status: 'signed',
        redeemed: false,
        signature: signedClaim.signature,
        nonce: signedClaim.nonce,
        deadline: signedClaim.deadline,
      },
    })

    return NextResponse.json(
      {
        success: true,
        cashoutId: cashout.id,
        amount,
        // Transaction data for user to submit via claimWithSignature
        transaction: {
          to: SOVADS_STREAMING_ADDRESS,
          functionName: 'claimWithSignature',
          args: {
            recipient: signedClaim.recipient,
            amount: signedClaim.amount,
            claimRef: signedClaim.claimRef,
            nonce: signedClaim.nonce,
            deadline: signedClaim.deadline,
            signature: signedClaim.signature,
          },
          operator: signedClaim.operator,
        },
        message: `Signed claim for ${amount} G$. Submit the transaction from your wallet to receive tokens.`,
      },
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error('Redeem POST error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Redemption failed' },
      { status: 500, headers: corsHeaders }
    )
  }
}

/**
 * PATCH /api/viewers/redeem
 * Body: { cashoutId: string, txHash: string }
 *
 * Called after the user submits the signed transaction on-chain.
 * Marks the cashout as redeemed with the tx hash.
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { cashoutId, txHash } = body as { cashoutId?: string; txHash?: string }

    if (!cashoutId || typeof cashoutId !== 'string') {
      return NextResponse.json({ error: 'cashoutId required' }, { status: 400, headers: corsHeaders })
    }
    if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      return NextResponse.json({ error: 'Valid txHash required' }, { status: 400, headers: corsHeaders })
    }

    const cashout = await prisma.viewerCashout.findUnique({ where: { id: cashoutId } })
    if (!cashout) {
      return NextResponse.json({ error: 'Cashout not found' }, { status: 404, headers: corsHeaders })
    }
    if (cashout.redeemed) {
      return NextResponse.json({ error: 'Already redeemed' }, { status: 409, headers: corsHeaders })
    }

    await prisma.viewerCashout.update({
      where: { id: cashoutId },
      data: {
        redeemed: true,
        redeemedAt: new Date(),
        redeemTxHash: txHash,
        status: 'completed',
        distributeTxHash: txHash,
      },
    })

    return NextResponse.json(
      { success: true, message: 'Redemption confirmed', txHash },
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error('Redeem PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders })
  }
}
