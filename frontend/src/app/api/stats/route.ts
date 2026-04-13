import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Get platform-wide statistics
 */
export async function GET() {
  try {
    const [totalAds, totalPublishers, activeCampaigns, totalImpressions, totalClicks] = await Promise.all([
      prisma.campaign.count(),
      prisma.publisherSite.count(),
      prisma.campaign.count({ where: { active: true } }),
      prisma.event.count({ where: { type: { equals: 'IMPRESSION', mode: 'insensitive' } } }),
      prisma.event.count({ where: { type: { equals: 'CLICK', mode: 'insensitive' } } }),
    ])

    const totalEvents = totalImpressions + totalClicks
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0

    // Total unique impressions (distinct fingerprints)
    const uniqueFingerprints = await prisma.event.findMany({
      where: { type: { equals: 'IMPRESSION', mode: 'insensitive' }, fingerprint: { not: null } },
      select: { fingerprint: true },
      distinct: ['fingerprint'],
    })
    const totalUniqueImpressions = uniqueFingerprints.length

    // Total revenue (sum of spent and budget from campaigns)
    const revenueResult = await prisma.campaign.aggregate({
      _sum: { spent: true, budget: true },
    })
    const totalRevenue = revenueResult._sum.spent ?? 0
    const totalBudget = revenueResult._sum.budget ?? 0
    const remainingBudget = totalBudget - totalRevenue
    const totalPublisherBudget = totalRevenue

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
    })
  } catch (error) {
    console.error('Error fetching stats:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

