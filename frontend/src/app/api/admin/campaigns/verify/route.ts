import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isWalletAdmin, verifyAdminSignature } from '@/lib/admin'

/**
 * POST /api/admin/campaigns/verify
 * Body: { campaignId, status, adminWallet, signature, message }
 * 
 * Secure API to allow admins to approve, reject, or reset campaigns.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { campaignId, status, adminWallet, signature, message } = body as {
            campaignId: string,
            status: 'approved' | 'rejected' | 'pending',
            adminWallet: string,
            signature: string,
            message: string
        }

        if (!campaignId || !status || !adminWallet || !signature || !message) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        if (status !== 'approved' && status !== 'rejected' && status !== 'pending') {
            return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
        }

        // 1. Authenticate Admin with Signature
        const isValid = await verifyAdminSignature(adminWallet, message, signature)
        if (!isValid) {
            return NextResponse.json({ error: 'Unauthorized: Invalid signature or not an admin' }, { status: 403 })
        }

        // 2. Update Campaign Status
        const existing = await prisma.campaign.findFirst({ where: { id: campaignId } })
        if (!existing) {
            return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
        }

        await prisma.campaign.update({
            where: { id: campaignId },
            data: { verificationStatus: status },
        })

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
