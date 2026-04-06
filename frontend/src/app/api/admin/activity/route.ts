import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
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

        const [recentCampaigns, recentPublishers] = await Promise.all([
            prisma.campaign.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }),
            prisma.publisher.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }),
        ])

        const activities = [
            ...recentCampaigns.map(c => ({
                id: c.id,
                type: 'CAMPAIGN_CREATED',
                message: `New campaign created: ${c.name}`,
                timestamp: c.createdAt,
            })),
            ...recentPublishers.map(p => ({
                id: p.id,
                type: 'PUBLISHER_REGISTERED',
                message: `Publisher registered: ${p.domain || p.wallet}`,
                timestamp: p.createdAt,
            })),
        ]

        activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

        return NextResponse.json({ activities: activities.slice(0, 10) })
    } catch (error) {
        console.error('Fetch activity error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
