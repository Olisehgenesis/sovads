import { NextRequest, NextResponse } from 'next/server'
import { collections } from '@/lib/db'
import { randomUUID } from 'crypto'

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

// Get viewer points (by wallet or fingerprint)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const wallet = searchParams.get('wallet')
    const fingerprint = searchParams.get('fingerprint')

    if (!wallet && !fingerprint) {
      return NextResponse.json({ error: 'Wallet or fingerprint required' }, { status: 400, headers: corsHeaders })
    }

    const viewerPointsCollection = await collections.viewerPoints()
    
    let viewer = null
    if (wallet) {
      viewer = await viewerPointsCollection.findOne({ wallet })
    } else if (fingerprint) {
      viewer = await viewerPointsCollection.findOne({ 
        fingerprint,
        $or: [{ wallet: null }, { wallet: { $exists: false } }] as any
      })
    }

    if (!viewer) {
      return NextResponse.json({
        wallet: wallet || null,
        fingerprint: fingerprint || null,
        totalPoints: 0,
        claimedPoints: 0,
        pendingPoints: 0,
        lastInteraction: null,
      }, { headers: corsHeaders })
    }

    return NextResponse.json({
      id: viewer._id,
      wallet: viewer.wallet,
      fingerprint: viewer.fingerprint,
      totalPoints: viewer.totalPoints,
      claimedPoints: viewer.claimedPoints,
      pendingPoints: viewer.pendingPoints,
      lastInteraction: viewer.lastInteraction,
    }, { headers: corsHeaders })
  } catch (error) {
    console.error('Error fetching viewer points:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders })
  }
}

// Award points to viewer
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { wallet, fingerprint, type, campaignId, adId, siteId, points } = body

    if (!fingerprint && !wallet) {
      return NextResponse.json({ error: 'Wallet or fingerprint required' }, { status: 400, headers: corsHeaders })
    }

    if (!type || !campaignId || !adId || !siteId || !points) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400, headers: corsHeaders })
    }

    const viewerPointsCollection = await collections.viewerPoints()
    const viewerRewardsCollection = await collections.viewerRewards()

    // Find or create viewer
    let viewer = null
    if (wallet) {
      viewer = await viewerPointsCollection.findOne({ wallet })
    } else {
      viewer = await viewerPointsCollection.findOne({ 
        fingerprint,
        $or: [{ wallet: null }, { wallet: { $exists: false } }] as any
      })
    }

    const now = new Date()
    if (!viewer) {
      // Create new viewer
      const viewerId = randomUUID()
      viewer = {
        _id: viewerId,
        wallet: wallet || null,
        fingerprint: fingerprint || null,
        totalPoints: points,
        claimedPoints: 0,
        pendingPoints: points,
        lastInteraction: now,
        createdAt: now,
        updatedAt: now,
      }
      await viewerPointsCollection.insertOne(viewer)
    } else {
      // Update existing viewer
      await viewerPointsCollection.updateOne(
        { _id: viewer._id },
        {
          $inc: { totalPoints: points, pendingPoints: points },
          $set: { lastInteraction: now, updatedAt: now },
        }
      )
      viewer.totalPoints += points
      viewer.pendingPoints += points
    }

    // Create reward record
    const reward = {
      _id: randomUUID(),
      viewerId: viewer._id,
      wallet: wallet || null,
      fingerprint: fingerprint || null,
      type,
      campaignId,
      adId,
      siteId,
      points,
      claimed: false,
      timestamp: now,
    }
    await viewerRewardsCollection.insertOne(reward)

    return NextResponse.json({
      success: true,
      viewer: {
        id: viewer._id,
        totalPoints: viewer.totalPoints,
        pendingPoints: viewer.pendingPoints,
      },
      reward: {
        id: reward._id,
        points: reward.points,
        type: reward.type,
      },
    }, { headers: corsHeaders })
  } catch (error) {
    console.error('Error awarding points:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders })
  }
}

