import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
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

    const normalizedWallet = wallet?.toLowerCase()

    let viewer = null
    if (normalizedWallet) {
      viewer = await prisma.viewerPoints.findFirst({ where: { wallet: normalizedWallet } })
    } else if (fingerprint) {
      viewer = await prisma.viewerPoints.findFirst({ where: { fingerprint, wallet: null } })
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

    const effectivePendingPoints = Math.max(viewer.pendingPoints, viewer.totalPoints - viewer.claimedPoints, 0)

    return NextResponse.json({
      id: viewer.id,
      wallet: viewer.wallet,
      fingerprint: viewer.fingerprint,
      totalPoints: viewer.totalPoints,
      claimedPoints: viewer.claimedPoints,
      pendingPoints: effectivePendingPoints,
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

    let viewer = null
    if (wallet) {
      viewer = await prisma.viewerPoints.findFirst({ where: { wallet } })
    } else {
      viewer = await prisma.viewerPoints.findFirst({ where: { fingerprint, wallet: null } })
    }

    const now = new Date()
    if (!viewer) {
      viewer = await prisma.viewerPoints.create({
        data: {
          wallet: wallet || null,
          fingerprint: fingerprint || 'unknown',
          totalPoints: points,
          claimedPoints: 0,
          pendingPoints: points,
          lastInteraction: now,
        },
      })
    } else {
      await prisma.viewerPoints.update({
        where: { id: viewer.id },
        data: {
          totalPoints: { increment: points },
          pendingPoints: { increment: points },
          lastInteraction: now,
        },
      })
      viewer = { ...viewer, totalPoints: viewer.totalPoints + points, pendingPoints: viewer.pendingPoints + points }
    }

    const reward = await prisma.viewerReward.create({
      data: {
        viewerId: viewer.id,
        wallet: wallet || null,
        fingerprint: fingerprint || null,
        type,
        campaignId,
        adId,
        siteId,
        points,
        claimed: false,
      },
    })

    return NextResponse.json({
      success: true,
      viewer: { id: viewer.id, totalPoints: viewer.totalPoints, pendingPoints: viewer.pendingPoints },
      reward: { id: reward.id, points: reward.points, type: reward.type },
    }, { headers: corsHeaders })
  } catch (error) {
    console.error('Error awarding points:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders })
  }
}

