import { NextRequest, NextResponse } from 'next/server'
import { collections } from '@/lib/db'

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

    // TODO: Integrate with smart contract to actually transfer tokens
    // For now, we'll just mark points as claimed in the database
    // In production, this should call the contract's claimViewerPoints function

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
        $set: { claimed: true, claimedAt: now },
      }
    )

    return NextResponse.json({
      success: true,
      claimed: claimAmount,
      remaining: viewer.pendingPoints - claimAmount,
      message: 'Points claimed successfully. Tokens will be transferred to your wallet.',
    }, { headers: corsHeaders })
  } catch (error) {
    console.error('Error claiming points:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders })
  }
}

