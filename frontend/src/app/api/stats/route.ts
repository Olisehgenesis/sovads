import { NextRequest, NextResponse } from 'next/server'
import { collections } from '@/lib/db'

/**
 * Get platform-wide statistics
 */
export async function GET(request: NextRequest) {
  try {
    const [eventsCollection, campaignsCollection, publishersCollection] = await Promise.all([
      collections.events(),
      collections.campaigns(),
      collections.publishers(),
    ])

    // Total campaigns (ads)
    const totalAds = await campaignsCollection.countDocuments({})

    // Total event stats (impressions + clicks), case-insensitive
    const eventStats = await eventsCollection.aggregate([
      {
        $match: {
          type: { $regex: /^(IMPRESSION|CLICK)$/i },
        },
      },
      {
        $group: {
          _id: { $toUpper: '$type' },
          count: { $sum: 1 },
        },
      },
    ]).toArray()

    const totalImpressions = eventStats.find((s) => s._id === 'IMPRESSION')?.count ?? 0
    const totalClicks = eventStats.find((s) => s._id === 'CLICK')?.count ?? 0
    const totalEvents = totalImpressions + totalClicks
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0

    // Total unique impressions (distinct fingerprints)
    const uniqueImpressionsResult = await eventsCollection.aggregate([
      {
        $match: {
          type: { $regex: /^IMPRESSION$/i },
          fingerprint: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: '$fingerprint',
        },
      },
      {
        $count: 'unique',
      },
    ]).toArray()

    const totalUniqueImpressions = uniqueImpressionsResult[0]?.unique ?? 0

    // Total publishers
    const totalPublishers = await publishersCollection.countDocuments({})

    // Active campaigns
    const activeCampaigns = await campaignsCollection.countDocuments({
      active: true,
    })

    // Total revenue (sum of spent from campaigns)
    const revenueResult = await campaignsCollection.aggregate([
      {
        $group: {
          _id: null,
          totalSpent: { $sum: '$spent' },
          totalBudget: { $sum: '$budget' },
        },
      },
    ]).toArray()

    const totalRevenue = revenueResult[0]?.totalSpent ?? 0
    const totalBudget = revenueResult[0]?.totalBudget ?? 0
    const totalPublisherBudget = totalRevenue // publisher budget is approximated by spent amount

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
      totalPublisherBudget,
    })
  } catch (error) {
    console.error('Error fetching stats:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

