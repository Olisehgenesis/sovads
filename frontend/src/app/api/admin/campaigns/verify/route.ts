import { NextRequest, NextResponse } from 'next/server'
import { collections } from '@/lib/db'
import { isWalletAdmin } from '@/lib/admin'

/**
 * POST /api/admin/campaigns/verify
 * Body: { campaignId, status, adminWallet }
 * 
 * Secure API to allow admins to approve or reject campaigns.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { campaignId, status, adminWallet } = body as {
            campaignId: string,
            status: 'approved' | 'rejected',
            adminWallet: string
        }

        if (!campaignId || !status || !adminWallet) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        if (status !== 'approved' && status !== 'rejected') {
            return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
        }

        // 1. Authenticate Admin
        if (!isWalletAdmin(adminWallet)) {
            return NextResponse.json({ error: 'Unauthorized: Wallet is not an administrator' }, { status: 403 })
        }

        const campaignsCollection = await collections.campaigns()

        // 2. Update Campaign Status
        const result = await campaignsCollection.updateOne(
            { _id: campaignId },
            {
                $set: {
                    verificationStatus: status,
                    updatedAt: new Date()
                }
            }
        )

        if (result.matchedCount === 0) {
            return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
        }

        return NextResponse.json({
            success: true,
            message: `Campaign ${status} successfully`,
            campaignId
        })
    } catch (error) {
        console.error('Campaign verification error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
