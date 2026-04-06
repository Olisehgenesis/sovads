import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET - Publisher available balance (earnings + topups - withdrawn)
 * ?wallet=0x...
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const wallet = searchParams.get('wallet')

    if (!wallet) {
      return NextResponse.json({ error: 'wallet required' }, { status: 400 })
    }

    const publisher = await prisma.publisher.findFirst({ where: { wallet } })

    if (!publisher) {
      return NextResponse.json({ error: 'Publisher not found' }, { status: 404 })
    }

    // Earnings from ad clicks (last 365 days)
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

    // Available = earnings + topups - withdrawn
    const available = Math.max(0, earnings + totalTopup - totalWithdrawn)

    return NextResponse.json({
      wallet,
      earnings,
      totalTopup,
      totalWithdrawn,
      available
    })
  } catch (error) {
    console.error('Balance error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    )
  }
}
