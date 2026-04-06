import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyAdminSignature } from '@/lib/admin'
import {
    detectMediaTypeFromUrl,
    getAllowedCreativeFormatLabel,
    hasAllowedCreativeExtension,
} from '@/lib/creative-validation'

const normalizeTargetUrl = (value: string): string =>
    /^(https?:)?\/\//i.test(value) ? value : `https://${value}`

/**
 * PUT /api/admin/campaigns/update
 * Body: { id, updates, adminWallet, signature, message }
 * 
 * Secure Admin-only API to override campaign data.
 */
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json()
        const { id, updates, adminWallet, signature, message } = body as {
            id: string
            updates: Record<string, any>
            adminWallet: string
            signature: string
            message: string
        }

        if (!id || !updates || !adminWallet || !signature || !message) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        // 1. Authenticate Admin with Signature
        const isValid = await verifyAdminSignature(adminWallet, message, signature)
        if (!isValid) {
            return NextResponse.json({ error: 'Unauthorized: Invalid signature or not an admin' }, { status: 403 })
        }

        const campaign = await prisma.campaign.findFirst({ where: { id } })
        if (!campaign) {
            return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
        }

        const patch: Record<string, unknown> = {}

        if (typeof updates.name === 'string') patch.name = updates.name.trim()
        if (typeof updates.description === 'string') patch.description = updates.description.trim()
        if (typeof updates.targetUrl === 'string') patch.targetUrl = normalizeTargetUrl(updates.targetUrl.trim())
        if (Array.isArray(updates.tags)) patch.tags = updates.tags.filter((tag: any) => typeof tag === 'string')
        if (Array.isArray(updates.targetLocations)) {
            patch.targetLocations = updates.targetLocations.filter((loc: any) => typeof loc === 'string')
        }
        if (updates.metadata && typeof updates.metadata === 'object') patch.metadata = updates.metadata

        if (typeof updates.bannerUrl === 'string') {
            const bannerUrl = updates.bannerUrl.trim()
            if (!hasAllowedCreativeExtension(bannerUrl)) {
                return NextResponse.json(
                    { error: `Unsupported creative format. ${getAllowedCreativeFormatLabel()}` },
                    { status: 400 }
                )
            }
            patch.bannerUrl = bannerUrl
            const detectedMediaType = detectMediaTypeFromUrl(bannerUrl)
            if (detectedMediaType) patch.mediaType = detectedMediaType
        }

        // Admin can also toggle active status directly
        if (typeof updates.active === 'boolean') patch.active = updates.active

        // Admin override support for audited adjustments
        if (updates.budget !== undefined && Number.isFinite(Number(updates.budget))) {
            patch.budget = Number(updates.budget)
        }
        if (updates.spent !== undefined && Number.isFinite(Number(updates.spent))) {
            patch.spent = Number(updates.spent)
        }

        await prisma.campaign.update({ where: { id }, data: patch })
        const updated = await prisma.campaign.findFirst({ where: { id } })

        return NextResponse.json({
            success: true,
            campaign: updated
        })
    } catch (error) {
        console.error('Admin update campaign error:', error)
        return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 })
    }
}
