import { NextRequest, NextResponse } from 'next/server'
import { collections } from '@/lib/db'
import { isWalletAdmin } from '@/lib/admin'

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const adminWallet = searchParams.get('admin')

        if (!adminWallet || !isWalletAdmin(adminWallet)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const campaignsCollection = await collections.campaigns()
        const campaigns = await campaignsCollection
            .find({})
            .sort({ createdAt: -1 })
            .map((campaign) => ({
                id: campaign._id,
                name: campaign.name,
                budget: campaign.budget,
                active: campaign.active,
                onChainId: campaign.onChainId,
                advertiserId: campaign.advertiserId,
                startDate: campaign.startDate,
                endDate: campaign.endDate,
            }))
            .toArray()

        return NextResponse.json({ campaigns }, { status: 200 })
    } catch (error) {
        console.error('Admin list campaigns error:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
