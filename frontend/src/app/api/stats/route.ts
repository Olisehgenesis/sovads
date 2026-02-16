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

    // Total impressions
    const totalImpressions = await eventsCollection.countDocuments({
      type: 'IMPRESSION',
    })

    // Total unique impressions (distinct fingerprints)
    const uniqueImpressionsResult = await eventsCollection.aggregate([
      {
        $match: {
          type: 'IMPRESSION',
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

    // Total clicks
    const totalClicks = await eventsCollection.countDocuments({
      type: 'CLICK',
    })

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
        },
      },
    ]).toArray()

    const totalRevenue = revenueResult[0]?.totalSpent ?? 0

    return NextResponse.json({
      totalAds,
      totalUniqueImpressions,
      totalImpressions,
      totalClicks,
      totalPublishers,
      activeCampaigns,
      totalRevenue,
    })
  } catch (error) {
    console.error('Error fetching stats:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

