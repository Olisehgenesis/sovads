import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { payoutG$, getTreasuryBalance, isSovadGsConfigured } from '@/lib/sovadgs'

/**
 * POST - Request G$ withdrawal (1 SovPoint = 1 G$)
 * Body: { wallet, amount }
 */
export async function POST(request: NextRequest) {
  try {
    if (!isSovadGsConfigured) {
      return NextResponse.json(
        { error: 'G$ payouts not configured' },
        { status: 503 }
      )
    }

    const body = await request.json()
    const { wallet, amount } = body as { wallet?: string; amount?: number }

    if (!wallet || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { error: 'wallet and amount (positive number) required' },
        { status: 400 }
      )
    }

    const publisher = await prisma.publisher.findFirst({ where: { wallet } })

    if (!publisher) {
      return NextResponse.json({ error: 'Publisher not found' }, { status: 404 })
    }

    // Available = earnings + topups - withdrawn
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 365)

    const events = await prisma.event.findMany({
      where: {
        publisherId: publisher.id,
        type: 'CLICK',
        timestamp: { gte: startDate },
      },
      select: { campaignId: true },
    })

    const campaignIds = [...new Set(events.map((e) => e.campaignId))]
    const campaigns = await prisma.campaign.findMany({
      where: { id: { in: campaignIds } },
      select: { id: true, cpc: true },
    })

    const cpcMap = new Map(campaigns.map((c) => [c.id, c.cpc ?? 0]))
    const earnings = events.reduce(
      (sum, e) => sum + (cpcMap.get(e.campaignId) ?? 0),
      0
    )

    const totalTopup = publisher.totalTopup ?? 0
    const totalWithdrawn = publisher.totalWithdrawn ?? 0
    const available = Math.max(0, earnings + totalTopup - totalWithdrawn)

    if (amount > available) {
      return NextResponse.json(
        { error: `Insufficient balance. Available: ${available.toFixed(2)} G$` },
        { status: 400 }
      )
    }

    const treasuryBalance = await getTreasuryBalance()
    if (amount > treasuryBalance) {
      return NextResponse.json(
        { error: 'Treasury insufficient. Try again later.' },
        { status: 503 }
      )
    }

    const txHash = await payoutG$(wallet, amount)

    await prisma.$transaction([
      prisma.withdrawal.create({
        data: {
          publisherId: publisher.id,
          wallet,
          amount,
          txHash,
          status: 'completed',
        },
      }),
      prisma.publisher.update({
        where: { id: publisher.id },
        data: { totalWithdrawn: { increment: amount } },
      }),
    ])

    return NextResponse.json({
      success: true,
      txHash,
      amount,
      message: `${amount} G$ sent to ${wallet}`
    })
  } catch (error) {
    console.error('Withdraw error:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Withdrawal failed'
      },
      { status: 500 }
    )
  }
}

/**
 * GET - Treasury balance and config status
 */
export async function GET() {
  try {
    const balance = await getTreasuryBalance()
    return NextResponse.json({
      treasuryBalance: balance,
      configured: isSovadGsConfigured
    })
  } catch {
    return NextResponse.json({
      treasuryBalance: 0,
      configured: false
    })
  }
}

/**
 * POST - Request G$ withdrawal (1 SovPoint = 1 G$)
 * Body: { wallet, amount }
 */
