import { NextRequest, NextResponse } from 'next/server'
import { isAddress } from 'viem'
import { prisma } from '@/lib/prisma'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

// GET: check if user already has a successful claim (used to show cooldown)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const wallet = searchParams.get('wallet')

  if (!wallet || !isAddress(wallet)) {
    return NextResponse.json({ error: 'Valid wallet required' }, { status: 400, headers: corsHeaders })
  }

  const lastSuccess = await prisma.engagementRewardClaim.findFirst({
    where: { wallet: wallet.toLowerCase(), status: 'success' },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(
    { lastClaim: lastSuccess ? lastSuccess.createdAt : null, txHash: lastSuccess?.txHash || null },
    { headers: corsHeaders }
  )
}

// PATCH: update claim with final tx hash + status after on-chain submission
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { wallet, txHash, status, rewardAmount, error } = body

    if (!wallet || !isAddress(wallet)) {
      return NextResponse.json({ error: 'Valid wallet required' }, { status: 400, headers: corsHeaders })
    }

    if (!['success', 'failed'].includes(status)) {
      return NextResponse.json({ error: 'status must be success or failed' }, { status: 400, headers: corsHeaders })
    }

    // Update the most recent pending claim for this wallet
    const claim = await prisma.engagementRewardClaim.findFirst({
      where: { wallet: wallet.toLowerCase(), status: 'pending' },
      orderBy: { createdAt: 'desc' },
    })

    if (!claim) {
      return NextResponse.json({ error: 'No pending claim found' }, { status: 404, headers: corsHeaders })
    }

    const updated = await prisma.engagementRewardClaim.update({
      where: { id: claim.id },
      data: {
        status,
        txHash: txHash || null,
        rewardAmount: rewardAmount ? Number(rewardAmount) : null,
        error: error || null,
      },
    })

    return NextResponse.json({ ok: true, claim: updated }, { headers: corsHeaders })
  } catch (error) {
    console.error('[engagement-rewards/claim] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders })
  }
}
