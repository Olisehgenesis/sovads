import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  isSovadGsConfigured,
  hasSovadGsContract,
  payoutG$,
  initiateCashoutClaim,
  generateClaimRef,
  MINIMUM_CASHOUT_POINTS,
} from '@/lib/sovadgs'
import { randomUUID } from 'crypto'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

/**
 * GET /api/viewers/cashout?wallet=0x...
 * Returns cashout history for a wallet
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const wallet = searchParams.get('wallet')?.toLowerCase()

    if (!wallet) {
      return NextResponse.json({ error: 'wallet required' }, { status: 400, headers: corsHeaders })
    }

    const viewer = await prisma.viewerPoints.findFirst({ where: { wallet } })
    if (!viewer) {
      return NextResponse.json({ cashouts: [], pendingPoints: 0 }, { headers: corsHeaders })
    }

    const cashouts = await prisma.viewerCashout.findMany({
      where: { viewerId: viewer.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    const effectivePendingPoints = Math.max(viewer.pendingPoints, viewer.totalPoints - viewer.claimedPoints, 0)

    return NextResponse.json(
      {
        pendingPoints: effectivePendingPoints,
        totalPoints: viewer.totalPoints,
        claimedPoints: viewer.claimedPoints,
        cashouts: cashouts.map(c => ({
          id: c.id,
          amount: c.amount,
          status: c.status,
          claimRef: c.claimRef,
          initiateTxHash: c.initiateTxHash,
          distributeTxHash: c.distributeTxHash,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        })),
      },
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error('Cashout GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders })
  }
}

/**
 * POST /api/viewers/cashout
 * Body: { wallet: string, amount: number }
 *
 * Flow:
 *  1. Validate wallet has enough pending points
 *  2. Generate unique claimRef
 *  3a. If SovadGs contract configured: call initiateClaim → creates on-chain pending claim
 *      Admin must then call claimDateClaim to distribute
 *  3b. If only payout key configured (no SovadGs contract): call claimDirect (immediate)
 *  4. Deduct points from DB, create ViewerCashout record
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { wallet, amount } = body as { wallet?: string; amount?: number }

    if (!wallet || typeof wallet !== 'string') {
      return NextResponse.json({ error: 'wallet required' }, { status: 400, headers: corsHeaders })
    }
    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'amount (positive number) required' }, { status: 400, headers: corsHeaders })
    }
    if (amount < MINIMUM_CASHOUT_POINTS) {
      return NextResponse.json(
        { error: `Minimum cashout is ${MINIMUM_CASHOUT_POINTS} G$` },
        { status: 400, headers: corsHeaders }
      )
    }

    const normalizedWallet = wallet.toLowerCase()

    // Validate wallet format
    if (!/^0x[0-9a-fA-F]{40}$/.test(normalizedWallet)) {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400, headers: corsHeaders })
    }

    const viewer = await prisma.viewerPoints.findFirst({ where: { wallet: normalizedWallet } })

    const effectivePendingPoints = viewer
      ? Math.max(viewer.pendingPoints, viewer.totalPoints - viewer.claimedPoints, 0)
      : 0

    if (!viewer || effectivePendingPoints < amount) {
      return NextResponse.json(
        { error: `Insufficient points. Available: ${effectivePendingPoints}` },
        { status: 400, headers: corsHeaders }
      )
    }

    // Generate unique ref using wallet + uuid nonce
    const nonce = randomUUID()
    const claimRef = generateClaimRef(normalizedWallet, nonce) as `0x${string}`

    const updatedPendingPoints = effectivePendingPoints - amount

    // Deduct points optimistically (before on-chain call to prevent double-spend)
    await prisma.viewerPoints.update({
      where: { id: viewer.id },
      data: {
        pendingPoints: updatedPendingPoints,
        claimedPoints: { increment: amount },
      },
    })

    // Create cashout record as processing
    const cashout = await prisma.viewerCashout.create({
      data: {
        viewerId: viewer.id,
        wallet: normalizedWallet,
        amount,
        claimRef,
        status: 'processing',
      },
    })

    if (!isSovadGsConfigured) {
      // No admin wallet configured — mark as pending for manual review
      await prisma.viewerCashout.update({
        where: { id: cashout.id },
        data: { status: 'pending', error: 'Payout key not configured' },
      })
      return NextResponse.json(
        {
          success: true,
          cashoutId: cashout.id,
          amount,
          status: 'pending',
          message: `Cashout request recorded for ${amount} G$. Tokens will be distributed once the payout system is live.`,
        },
        { headers: corsHeaders }
      )
    }

    try {
      let txHash: string
      let status: string

      if (hasSovadGsContract) {
        // Use initiateClaim flow — admin must call claimDateClaim to distribute
        txHash = await initiateCashoutClaim(normalizedWallet, amount, claimRef)
        status = 'pending' // Awaiting admin approval
      } else {
        // Direct immediate payout via SovAdsManager campaign treasury
        txHash = await payoutG$(normalizedWallet, amount)
        status = 'completed'
      }

      await prisma.viewerCashout.update({
        where: { id: cashout.id },
        data: {
          status,
          initiateTxHash: txHash,
          ...(status === 'completed' ? { distributeTxHash: txHash } : {}),
        },
      })

      const message =
        status === 'completed'
          ? `${amount} G$ sent to your wallet! TX: ${txHash}`
          : `Cashout request submitted for ${amount} G$. Tokens will be distributed shortly.`

      return NextResponse.json(
        {
          success: true,
          cashoutId: cashout.id,
          amount,
          claimRef,
          status,
          txHash,
          message,
        },
        { headers: corsHeaders }
      )
    } catch (contractError) {
      // Roll back points on contract failure
      await prisma.viewerPoints.update({
        where: { id: viewer.id },
        data: {
          pendingPoints: { increment: amount },
          claimedPoints: { decrement: amount },
        },
      })
      await prisma.viewerCashout.update({
        where: { id: cashout.id },
        data: {
          status: 'failed',
          error: contractError instanceof Error ? contractError.message : 'Contract call failed',
        },
      })

      console.error('Cashout contract error:', contractError)
      return NextResponse.json(
        { error: 'On-chain cashout failed. Points have been restored. Please try again.' },
        { status: 500, headers: corsHeaders }
      )
    }
  } catch (error) {
    console.error('Cashout POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders })
  }
}
