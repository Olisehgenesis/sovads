import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isWalletAdmin } from '@/lib/admin'

/**
 * GET /api/admin/campaigns/pending
 * Query: ?adminWallet=0x...
 *
 * Secure API to fetch all campaigns waiting for verification.
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const adminWallet = searchParams.get('adminWallet')

        if (!adminWallet || !isWalletAdmin(adminWallet)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        const pendingCampaigns = await prisma.campaign.findMany({
            where: {
                OR: [
                    { verificationStatus: 'pending' },
                    { verificationStatus: null },
                ],
            },
            orderBy: { createdAt: 'desc' },
            include: { advertiser: { select: { wallet: true } } },
        })

        const enrichedCampaigns = pendingCampaigns.map(campaign => ({
            ...campaign,
            advertiserWallet: campaign.advertiser?.wallet || 'Unknown',
        }))

        return NextResponse.json({ campaigns: enrichedCampaigns })
    } catch (error) {
        console.error('Fetch pending campaigns error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
