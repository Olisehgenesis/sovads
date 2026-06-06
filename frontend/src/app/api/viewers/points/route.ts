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
const FIRST_TIME_STAKE_BONUS = 5
// Minimum G$ amount (whole tokens, NOT wei) a wallet must stake in a single
// stake action to qualify for the first-time stake bonus.
const FIRST_TIME_STAKE_MIN_AMOUNT = 1_000_000

/**
 * Claim any anonymous (fingerprint-only) viewer row and reward history for a
 * wallet on first connection so the multi-day engagement streak survives the
 * anonymous → wallet handoff.
 *
 * Cases handled:
 *   - No anonymous row exists → noop.
 *   - Anonymous row exists and wallet row does NOT → stamp wallet onto the
 *     anonymous viewer + reassign its rewards.
 *   - Both exist → move points + reassign rewards onto the wallet row, then
 *     delete the now-empty anonymous row.
 *
 * Idempotent: safe to call on every POST.
 */
async function mergeAnonymousIntoWallet(wallet: string, fingerprint: string): Promise<void> {
  const normalizedWallet = wallet.toLowerCase()
  const anonViewer = await prisma.viewerPoints.findFirst({
    where: { fingerprint, wallet: null },
  })
  if (!anonViewer) return

  const walletViewer = await prisma.viewerPoints.findFirst({
    where: { wallet: normalizedWallet },
  })

  if (!walletViewer) {
    // Promote the anonymous row to a wallet row in place.
    await prisma.viewerPoints.update({
      where: { id: anonViewer.id },
      data: { wallet: normalizedWallet, lastWalletChange: new Date() },
    })
    await prisma.viewerReward.updateMany({
      where: { fingerprint, wallet: null },
      data: { wallet: normalizedWallet },
    })
    return
  }

  // Both rows exist — merge anon into wallet.
  await prisma.viewerReward.updateMany({
    where: { fingerprint, wallet: null },
    data: { wallet: normalizedWallet, viewerId: walletViewer.id },
  })
  await prisma.viewerPoints.update({
    where: { id: walletViewer.id },
    data: {
      totalPoints: { increment: anonViewer.totalPoints },
      pendingPoints: { increment: anonViewer.pendingPoints },
      lastWalletChange: new Date(),
    },
  })
  await prisma.viewerPoints.delete({ where: { id: anonViewer.id } })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { wallet, fingerprint, type, campaignId, adId, siteId, points, stakeAmount } = body

    if (!fingerprint && !wallet) {
      return NextResponse.json({ error: 'Wallet or fingerprint required' }, { status: 400, headers: corsHeaders })
    }

    if (!type || !campaignId || !adId || !siteId || !points) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400, headers: corsHeaders })
    }

    // Migrate any anonymous fingerprint history onto the wallet BEFORE we look
    // up the viewer row, so the new reward is appended to the merged record
    // and the streak query sees the full multi-day history.
    if (wallet && fingerprint) {
      try {
        await mergeAnonymousIntoWallet(String(wallet), String(fingerprint))
      } catch (mergeErr) {
        // Non-fatal: log and continue with the normal award flow.
        console.warn('[viewers/points] anon→wallet merge failed:', mergeErr)
      }
    }

    // STAKE rewards are a one-time, fixed 5-point bonus per wallet, gated on
    // a minimum stake size of FIRST_TIME_STAKE_MIN_AMOUNT G$ in this action.
    let effectivePoints: number = points
    if (type === 'STAKE') {
      if (!wallet) {
        return NextResponse.json({ error: 'Wallet required for STAKE rewards' }, { status: 400, headers: corsHeaders })
      }
      const stakedAmountNum = Number(stakeAmount)
      if (!Number.isFinite(stakedAmountNum) || stakedAmountNum < FIRST_TIME_STAKE_MIN_AMOUNT) {
        return NextResponse.json({
          success: true,
          alreadyAwarded: false,
          pointsAwarded: 0,
          reason: `Minimum stake of ${FIRST_TIME_STAKE_MIN_AMOUNT.toLocaleString()} G$ required for the bonus`,
          minStakeAmount: FIRST_TIME_STAKE_MIN_AMOUNT,
        }, { headers: corsHeaders })
      }
      const normalizedWallet = String(wallet).toLowerCase()
      const priorStake = await prisma.viewerReward.findFirst({
        where: { wallet: normalizedWallet, type: 'STAKE' },
        select: { id: true },
      })
      if (priorStake) {
        return NextResponse.json({
          success: true,
          alreadyAwarded: true,
          pointsAwarded: 0,
          reason: 'STAKE bonus already claimed for this wallet',
        }, { headers: corsHeaders })
      }
      effectivePoints = FIRST_TIME_STAKE_BONUS
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
          totalPoints: effectivePoints,
          claimedPoints: 0,
          pendingPoints: effectivePoints,
          lastInteraction: now,
        },
      })
    } else {
      await prisma.viewerPoints.update({
        where: { id: viewer.id },
        data: {
          totalPoints: { increment: effectivePoints },
          pendingPoints: { increment: effectivePoints },
          lastInteraction: now,
        },
      })
      viewer = { ...viewer, totalPoints: viewer.totalPoints + effectivePoints, pendingPoints: viewer.pendingPoints + effectivePoints }
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
        points: effectivePoints,
        claimed: false,
      },
    })

    return NextResponse.json({
      success: true,
      pointsAwarded: effectivePoints,
      viewer: { id: viewer.id, totalPoints: viewer.totalPoints, pendingPoints: viewer.pendingPoints },
      reward: { id: reward.id, points: reward.points, type: reward.type },
    }, { headers: corsHeaders })
  } catch (error) {
    console.error('Error awarding points:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders })
  }
}

