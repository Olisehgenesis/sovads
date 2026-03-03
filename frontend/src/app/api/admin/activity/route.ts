import { NextRequest, NextResponse } from 'next/server'
import { collections } from '@/lib/db'
import { isWalletAdmin } from '@/lib/admin'

/**
 * GET /api/admin/activity
 * Secure API to fetch recent system activity.
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const adminWallet = searchParams.get('adminWallet')

        if (!adminWallet || !isWalletAdmin(adminWallet)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        const [campaignsCollection, publishersCollection] = await Promise.all([
            collections.campaigns(),
            collections.publishers()
        ])

        // Get recent campaigns
        const recentCampaigns = await campaignsCollection.find({})
            .sort({ createdAt: -1 })
            .limit(10)
            .toArray()

        // Get recent publishers
        const recentPublishers = await publishersCollection.find({})
            .sort({ createdAt: -1 })
            .limit(10)
            .toArray()

        // Merge and format activity
        const activities = [
            ...recentCampaigns.map(c => ({
                id: c._id,
                type: 'CAMPAIGN_CREATED',
                message: `New campaign created: ${c.name}`,
                timestamp: c.createdAt || new Date(),
            })),
            ...recentPublishers.map(p => ({
                id: p._id,
                type: 'PUBLISHER_REGISTERED',
                message: `Publisher registered: ${p.domain || p.wallet}`,
                timestamp: p.createdAt || new Date(),
            }))
        ]

        // Sort by timestamp descending
        activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

        return NextResponse.json({ activities: activities.slice(0, 10) })
    } catch (error) {
        console.error('Fetch activity error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
