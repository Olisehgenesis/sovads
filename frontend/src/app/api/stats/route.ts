import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { tursoClient } from '@/lib/turso/client'

/**
 * Get platform-wide statistics.
 *
 * Event counts (impressions/clicks) come from Turso — Postgres `Event` is
 * write-frozen, so reading it returns a stale snapshot from the migration
 * cutover. Campaigns/publishers/cashouts stay on Postgres (source of truth
 * for money + relational entities).
 */
export async function GET() {
  try {
    const turso = tursoClient()
    const [
      totalAds,
      totalPublishers,
      activeCampaigns,
      impressionsRes,
      clicksRes,
      uniqueFingerprintsRes,
      gsRedeemedResult,
    ] = await Promise.all([
      prisma.campaign.count(),
      prisma.publisherSite.count(),
      prisma.campaign.count({ where: { active: true } }),
      turso.execute({
        sql: `SELECT COUNT(*) AS n FROM events WHERE UPPER(type) = 'IMPRESSION'`,
        args: [],
      }),
      turso.execute({
        sql: `SELECT COUNT(*) AS n FROM events WHERE UPPER(type) = 'CLICK'`,
        args: [],
      }),
      turso.execute({
        sql: `SELECT COUNT(DISTINCT fingerprint) AS n
              FROM events
              WHERE UPPER(type) = 'IMPRESSION' AND fingerprint IS NOT NULL`,
        args: [],
      }),
      prisma.viewerCashout.aggregate({
        _sum: { amount: true },
        where: { status: 'completed' },
      }),
    ])

    const totalImpressions = Number((impressionsRes.rows[0] as { n: number | bigint }).n ?? 0)
    const totalClicks = Number((clicksRes.rows[0] as { n: number | bigint }).n ?? 0)
    const totalUniqueImpressions = Number(
      (uniqueFingerprintsRes.rows[0] as { n: number | bigint }).n ?? 0
    )

    const totalEvents = totalImpressions + totalClicks
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0

    // Total revenue (sum of spent and budget from campaigns)
    const revenueResult = await prisma.campaign.aggregate({
      _sum: { spent: true, budget: true },
    })
    const totalRevenue = revenueResult._sum.spent ?? 0
    const totalBudget = revenueResult._sum.budget ?? 0
    const remainingBudget = totalBudget - totalRevenue
    const totalPublisherBudget = totalRevenue
    const totalGsRedeemed = gsRedeemedResult._sum.amount ?? 0

    return NextResponse.json({
      campaignCount: totalAds,
      totalAds,
      totalUniqueImpressions,
      totalImpressions,
      totalClicks,
      totalEvents,
      ctr,
      totalPublishers,
      publisherCount: totalPublishers,
      activeCampaigns,
      totalRevenue,
      totalBudget,
      remainingBudget,
      totalPublisherBudget,
      totalGsRedeemed,
    })
  } catch (error) {
    console.error('Error fetching stats:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

