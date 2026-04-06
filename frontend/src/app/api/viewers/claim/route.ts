import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { payoutG$, isSovadGsConfigured } from '@/lib/sovadgs'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

// Claim viewer points
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { wallet, fingerprint, amount } = body

    if (!wallet && !fingerprint) {
      return NextResponse.json({ error: 'Wallet or fingerprint required' }, { status: 400, headers: corsHeaders })
    }

    const normalizedWallet = wallet?.toLowerCase()
    if (!isSovadGsConfigured) {
      console.warn('G$ payouts not configured, points will be marked as claimed in DB only')
    }

    let viewer = null
    if (normalizedWallet) {
      viewer = await prisma.viewerPoints.findFirst({ where: { wallet: normalizedWallet } })
    } else {
      viewer = await prisma.viewerPoints.findFirst({ where: { fingerprint, wallet: null } })
    }

    if (!viewer || viewer.pendingPoints === 0) {
      return NextResponse.json({ error: 'No points to claim' }, { status: 400, headers: corsHeaders })
    }

    const claimAmount = amount || viewer.pendingPoints
    if (claimAmount > viewer.pendingPoints) {
      return NextResponse.json({ error: 'Insufficient pending points' }, { status: 400, headers: corsHeaders })
    }

    let txHash = null
    if (normalizedWallet && isSovadGsConfigured) {
      try {
        txHash = await payoutG$(normalizedWallet, claimAmount)
      } catch (payoutError) {
        console.error('Contract payout failed:', payoutError)
        return NextResponse.json({
          error: 'Contract payout failed. Please try again later.',
          details: payoutError instanceof Error ? payoutError.message : 'Unknown contract error'
        }, { status: 500, headers: corsHeaders })
      }
    }

    const now = new Date()

    await prisma.viewerPoints.update({
      where: { id: viewer.id },
      data: {
        pendingPoints: { decrement: claimAmount },
        claimedPoints: { increment: claimAmount },
      },
    })

    await prisma.viewerReward.updateMany({
      where: { viewerId: viewer.id, claimed: false },
      data: { claimed: true, claimedAt: now, claimTxHash: txHash },
    })

    return NextResponse.json({
      success: true,
      claimed: claimAmount,
      remaining: viewer.pendingPoints - claimAmount,
      txHash,
      message: txHash
        ? `Successfully claimed ${claimAmount} G$! Transaction: ${txHash}`
        : `Claiming is temporarily disabled; points have been marked as claimed in the database. Tokens will be distributed once payouts are live – please hang tight!`
    }, { headers: corsHeaders })
  } catch (error) {
    console.error('Error claiming points:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders })
  }
}

