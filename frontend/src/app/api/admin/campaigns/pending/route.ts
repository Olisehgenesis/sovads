import { NextRequest, NextResponse } from 'next/server'
import { collections } from '@/lib/db'
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

        const campaignsCollection = await collections.campaigns()
        const advertisersCollection = await collections.advertisers()

        // Find all campaigns that are pending (or don't have a status yet)
        const pendingCampaigns = await campaignsCollection.find({
            $or: [
                { verificationStatus: 'pending' },
                { verificationStatus: { $exists: false } }
            ]
        }).sort({ createdAt: -1 }).toArray()

        // Enrich with advertiser info
        const enrichedCampaigns = await Promise.all(pendingCampaigns.map(async (campaign) => {
            const advertiser = await advertisersCollection.findOne({ _id: campaign.advertiserId })
            return {
                ...campaign,
                id: campaign._id,
                advertiserWallet: advertiser?.wallet || 'Unknown'
            }
        }))

        return NextResponse.json({ campaigns: enrichedCampaigns })
    } catch (error) {
        console.error('Fetch pending campaigns error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
