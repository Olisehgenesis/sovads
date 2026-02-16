import { NextRequest, NextResponse } from 'next/server'
import { collections } from '@/lib/db'
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

    if (!isSovadGsConfigured) {
      console.warn('G$ payouts not configured, points will be marked as claimed in DB only')
    }

    const viewerPointsCollection = await collections.viewerPoints()
    const viewerRewardsCollection = await collections.viewerRewards()

    // Find viewer
    let viewer = null
    if (wallet) {
      viewer = await viewerPointsCollection.findOne({ wallet })
    } else {
      viewer = await viewerPointsCollection.findOne({
        fingerprint,
        $or: [{ wallet: null }, { wallet: { $exists: false } }] as any
      })
    }

    if (!viewer || viewer.pendingPoints === 0) {
      return NextResponse.json({ error: 'No points to claim' }, { status: 400, headers: corsHeaders })
    }

    const claimAmount = amount || viewer.pendingPoints
    if (claimAmount > viewer.pendingPoints) {
      return NextResponse.json({ error: 'Insufficient pending points' }, { status: 400, headers: corsHeaders })
    }

    // Execute actual payout if wallet is connected and G$ payout is configured
    let txHash = null
    if (wallet && isSovadGsConfigured) {
      try {
        txHash = await payoutG$(wallet, claimAmount)
      } catch (payoutError) {
        console.error('Contract payout failed:', payoutError)
        return NextResponse.json({
          error: 'Contract payout failed. Please try again later.',
          details: payoutError instanceof Error ? payoutError.message : 'Unknown contract error'
        }, { status: 500, headers: corsHeaders })
      }
    }

    const now = new Date()

    // Update viewer points
    await viewerPointsCollection.updateOne(
      { _id: viewer._id },
      {
        $inc: { pendingPoints: -claimAmount, claimedPoints: claimAmount },
        $set: { updatedAt: now },
      }
    )

    // Mark rewards as claimed
    await viewerRewardsCollection.updateMany(
      {
        viewerId: viewer._id,
        claimed: false,
      },
      {
        $set: { claimed: true, claimedAt: now, txHash },
      }
    )

    return NextResponse.json({
      success: true,
      claimed: claimAmount,
      remaining: viewer.pendingPoints - claimAmount,
      txHash,
      message: txHash
        ? `Successfully claimed ${claimAmount} G$! Transaction: ${txHash}`
        : `Points marked as claimed. Tokens will be transferred manually.`
    }, { headers: corsHeaders })
  } catch (error) {
    console.error('Error claiming points:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders })
  }
}

