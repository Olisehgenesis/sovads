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

        // Drive lifecycle + active in lockstep with the moderation decision.
        // Previously this endpoint only flipped `verificationStatus`, so even
        // after "Approve" the campaign stayed `status='review'` and
        // `active=false`, which means `/api/ads` and `/api/serve` (both
        // filter on `active: true`) kept skipping it. Result: campaigns sat
        // permanently "In review" from the advertiser's POV.
        const patch: {
            verificationStatus: 'approved' | 'rejected' | 'pending'
            status?: 'approved' | 'rejected' | 'review'
            active?: boolean
            approvedAt?: Date | null
        } = { verificationStatus: status }

        const now = new Date()
        if (status === 'approved') {
            patch.status = 'approved'
            // Only flip active=true if the campaign has actually been
            // published on-chain. A draft that somehow got approved without
            // an onChainId should NOT start serving.
            patch.active = existing.onChainId != null
            patch.approvedAt = now
        } else if (status === 'rejected') {
            patch.status = 'rejected'
            patch.active = false
        } else {
            // 'pending' — return to the review queue.
            patch.status = 'review'
            patch.active = false
            patch.approvedAt = null
        }

        await prisma.campaign.update({
            where: { id: campaignId },
            data: patch,
        })

        return NextResponse.json({
            success: true,
            message: `Campaign ${status} successfully`,
            campaignId,
            active: patch.active ?? false,
            status: patch.status ?? 'review',
        })
    } catch (error) {
        console.error('Campaign verification error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
