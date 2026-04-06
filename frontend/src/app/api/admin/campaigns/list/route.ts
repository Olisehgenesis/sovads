import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isWalletAdmin } from '@/lib/admin'

/**
 * GET /api/admin/campaigns/list
 * Query: ?adminWallet=0x...
 *
 * Secure API to fetch all campaigns for management.
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const adminWallet = searchParams.get('adminWallet')

        if (!adminWallet || !isWalletAdmin(adminWallet)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        const allCampaigns = await prisma.campaign.findMany({
            orderBy: { createdAt: 'desc' },
            include: { advertiser: { select: { wallet: true } } },
        })

        const enrichedCampaigns = allCampaigns.map(campaign => ({
            ...campaign,
            advertiserWallet: campaign.advertiser?.wallet || 'Unknown',
        }))

        return NextResponse.json({ campaigns: enrichedCampaigns })
    } catch (error) {
        console.error('Fetch all campaigns error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
