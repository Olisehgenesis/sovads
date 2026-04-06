import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isWalletAdmin } from '@/lib/admin'

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const adminWallet = searchParams.get('admin')

        if (!adminWallet || !isWalletAdmin(adminWallet)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const allCampaigns = await prisma.campaign.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                budget: true,
                active: true,
                onChainId: true,
                advertiserId: true,
                startDate: true,
                endDate: true,
            },
        })

        return NextResponse.json({ campaigns: allCampaigns }, { status: 200 })
    } catch (error) {
        console.error('Admin list campaigns error:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
