import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { tursoClient } from '@/lib/turso/client'

/**
 * GET - Publisher available balance (earnings + topups - withdrawn)
 * ?wallet=0x...
 *
 * Earnings come from Turso `events` (firehose) — Postgres `Event` is
 * write-frozen after the Turso migration, so reading it would freeze
 * publisher earnings at the cutover snapshot.
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

    const clicksRes = await tursoClient().execute({
      sql: `SELECT campaign_id FROM events
            WHERE publisher_id = ? AND UPPER(type) = 'CLICK' AND timestamp >= ?`,
      args: [publisher.id, startDate.getTime()],
    })
    const events = clicksRes.rows as unknown as Array<{ campaign_id: string }>

    const campaignIds = [...new Set(events.map((e) => e.campaign_id))]
    const campaigns = campaignIds.length
      ? await prisma.campaign.findMany({
          where: { id: { in: campaignIds } },
          select: { id: true, cpc: true },
        })
      : []

    const cpcMap = new Map(campaigns.map((c) => [c.id, c.cpc ?? 0]))
    const earnings = events.reduce(
      (sum, e) => sum + (cpcMap.get(e.campaign_id) ?? 0),
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
