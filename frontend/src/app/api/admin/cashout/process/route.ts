import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  batchProcessClaims,
  batchSendGs,
  cancelClaim,
  isSovadGsConfigured,
  hasSovadGsContract,
} from '@/lib/sovadgs'

/**
 * Admin: Process pending GS cashouts
 *
 * GET  /api/admin/cashout/process         → list pending cashouts
 * POST /api/admin/cashout/process         → batch process (distribute) pending cashouts
 * DELETE /api/admin/cashout/process       → cancel a specific cashout
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || 'pending'
    const take = Math.min(parseInt(searchParams.get('take') || '50', 10), 200)

    const cashouts = await prisma.viewerCashout.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' },
      take,
    })

    const summary = await prisma.viewerCashout.groupBy({
      by: ['status'],
      _count: { id: true },
      _sum: { amount: true },
    })

    return NextResponse.json({
      cashouts,
      summary,
      total: cashouts.length,
    })
  } catch (error) {
    console.error('Admin cashout GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { cashoutIds, mode } = body as {
      cashoutIds?: string[]
      mode?: 'batch_claim' | 'batch_send' // batch_claim uses claimDateClaim, batch_send uses batchSend
    }

    if (!isSovadGsConfigured) {
      return NextResponse.json({ error: 'SOVADGS_PAYOUT_PRIVATE_KEY not configured' }, { status: 503 })
    }

    // Fetch pending cashouts (optionally filtered by IDs)
    const whereClause = cashoutIds?.length
      ? { id: { in: cashoutIds }, status: 'pending' }
      : { status: 'pending' }

    const pendingCashouts = await prisma.viewerCashout.findMany({
      where: whereClause,
      orderBy: { createdAt: 'asc' },
      take: 100,
    })

    if (pendingCashouts.length === 0) {
      return NextResponse.json({ message: 'No pending cashouts to process', processed: 0 })
    }

    const processMode = mode || (hasSovadGsContract ? 'batch_claim' : 'batch_send')
    let txHash: string

    if (processMode === 'batch_claim' && hasSovadGsContract) {
      // Use claimDateClaim — only works for cashouts that have been initiated on-chain
      const refs = pendingCashouts
        .filter(c => c.claimRef && c.initiateTxHash) // only those initiated on-chain
        .map(c => c.claimRef as `0x${string}`)

      if (refs.length === 0) {
        return NextResponse.json({ error: 'No on-chain initiated claims to process' }, { status: 400 })
      }

      txHash = await batchProcessClaims(refs)

      await prisma.viewerCashout.updateMany({
        where: { claimRef: { in: refs } },
        data: { status: 'completed', distributeTxHash: txHash },
      })

      return NextResponse.json({
        success: true,
        processed: refs.length,
        txHash,
        message: `${refs.length} cashouts distributed via claimDateClaim`,
      })
    } else {
      // Use batchSend — sends directly to wallets without prior initiateClaim
      const recipients = pendingCashouts.map(c => c.wallet)
      const amounts = pendingCashouts.map(c => c.amount)

      txHash = await batchSendGs(recipients, amounts)

      const ids = pendingCashouts.map(c => c.id)
      await prisma.viewerCashout.updateMany({
        where: { id: { in: ids } },
        data: { status: 'completed', distributeTxHash: txHash },
      })

      return NextResponse.json({
        success: true,
        processed: pendingCashouts.length,
        txHash,
        totalGs: amounts.reduce((a, b) => a + b, 0),
        message: `${pendingCashouts.length} cashouts distributed via batchSend`,
      })
    }
  } catch (error) {
    console.error('Admin cashout POST error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Processing failed' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { cashoutId } = body as { cashoutId?: string }

    if (!cashoutId) {
      return NextResponse.json({ error: 'cashoutId required' }, { status: 400 })
    }

    const cashout = await prisma.viewerCashout.findUnique({ where: { id: cashoutId } })
    if (!cashout) {
      return NextResponse.json({ error: 'Cashout not found' }, { status: 404 })
    }
    if (cashout.status !== 'pending') {
      return NextResponse.json({ error: `Cannot cancel cashout with status: ${cashout.status}` }, { status: 400 })
    }

    let cancelTxHash: string | null = null

    // Cancel on-chain if it was initiated
    if (cashout.claimRef && cashout.initiateTxHash && hasSovadGsContract && isSovadGsConfigured) {
      try {
        cancelTxHash = await cancelClaim(cashout.claimRef as `0x${string}`)
      } catch (err) {
        console.warn('Could not cancel on-chain claim (may already be cancelled):', err)
      }
    }

    // Restore pending points to viewer
    await prisma.viewerPoints.update({
      where: { id: cashout.viewerId },
      data: {
        pendingPoints: { increment: cashout.amount },
        claimedPoints: { decrement: cashout.amount },
      },
    })

    await prisma.viewerCashout.update({
      where: { id: cashoutId },
      data: { status: 'cancelled' },
    })

    return NextResponse.json({
      success: true,
      cashoutId,
      cancelTxHash,
      message: `Cashout cancelled and ${cashout.amount} G$ restored to viewer`,
    })
  } catch (error) {
    console.error('Admin cashout DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
