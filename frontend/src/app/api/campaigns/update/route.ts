import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  detectMediaTypeFromUrl,
  getAllowedCreativeFormatLabel,
  hasAllowedCreativeExtension,
} from '@/lib/creative-validation'
import { validateHttpUrl } from '@/lib/url-validation'

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { wallet, id, updates } = body as {
      wallet?: string
      id?: string
      updates?: Record<string, unknown>
    }

    if (!wallet || !id || !updates) {
      return NextResponse.json({ error: 'wallet, id and updates are required' }, { status: 400 })
    }

    const advertiser = await prisma.advertiser.findFirst({ where: { wallet } })
    if (!advertiser) {
      return NextResponse.json({ error: 'Advertiser not found' }, { status: 404 })
    }

    const campaign = await prisma.campaign.findFirst({ where: { id, advertiserId: advertiser.id } })
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() }

    if (typeof updates.name === 'string') patch.name = updates.name.trim()
    if (typeof updates.description === 'string') patch.description = updates.description.trim()
    if (typeof updates.targetUrl === 'string') {
      const urlCheck = validateHttpUrl(updates.targetUrl)
      if (!urlCheck.ok) {
        return NextResponse.json({ error: `Invalid landing URL: ${urlCheck.reason}` }, { status: 400 })
      }
      patch.targetUrl = urlCheck.url
    }
    if (Array.isArray(updates.tags)) patch.tags = updates.tags.filter((tag) => typeof tag === 'string')
    if (Array.isArray(updates.targetLocations)) {
      patch.targetLocations = updates.targetLocations.filter((loc) => typeof loc === 'string')
    }
    if (updates.metadata && typeof updates.metadata === 'object') patch.metadata = updates.metadata

    // popupDurationSecs \u2014 advertiser-controlled "auto-close" timeout for popup
    // ads (3-60s). Stored on `metadata.popupDurationSecs` so we don't need a
    // dedicated column. Merges with existing metadata so other keys survive.
    if (updates.popupDurationSecs !== undefined && updates.popupDurationSecs !== null && updates.popupDurationSecs !== '') {
      const n = Number(updates.popupDurationSecs)
      if (!Number.isFinite(n) || n < 3 || n > 60) {
        return NextResponse.json(
          { error: 'Popup duration must be between 3 and 60 seconds.' },
          { status: 400 }
        )
      }
      const existing = (campaign.metadata && typeof campaign.metadata === 'object' && !Array.isArray(campaign.metadata))
        ? (campaign.metadata as Record<string, unknown>)
        : {}
      patch.metadata = { ...existing, ...(patch.metadata as Record<string, unknown> | undefined), popupDurationSecs: n }
    }

    // cpc — numeric, non-negative.
    if (updates.cpc !== undefined && updates.cpc !== null && updates.cpc !== '') {
      const cpcNum = Number(updates.cpc)
      if (!Number.isFinite(cpcNum) || cpcNum < 0) {
        return NextResponse.json({ error: 'CPC must be a non-negative number.' }, { status: 400 })
      }
      patch.cpc = cpcNum
    }

    // Schedule — ISO strings (or null to clear). Reject end-before-start.
    const parseSchedule = (raw: unknown): Date | null | undefined => {
      if (raw === undefined) return undefined
      if (raw === null || raw === '') return null
      if (typeof raw !== 'string') return undefined
      const d = new Date(raw)
      return Number.isNaN(d.getTime()) ? undefined : d
    }
    const newStart = parseSchedule(updates.startDate)
    const newEnd = parseSchedule(updates.endDate)
    if (updates.startDate !== undefined && newStart === undefined) {
      return NextResponse.json({ error: 'Invalid startDate.' }, { status: 400 })
    }
    if (updates.endDate !== undefined && newEnd === undefined) {
      return NextResponse.json({ error: 'Invalid endDate.' }, { status: 400 })
    }
    const effectiveStart = newStart !== undefined ? newStart : campaign.startDate
    const effectiveEnd = newEnd !== undefined ? newEnd : campaign.endDate
    if (effectiveStart && effectiveEnd && effectiveStart > effectiveEnd) {
      return NextResponse.json({ error: 'End date must be after start date.' }, { status: 400 })
    }
    if (newStart !== undefined) patch.startDate = newStart
    if (newEnd !== undefined) patch.endDate = newEnd

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
      // Reset moderation status whenever the creative changes so it is re-reviewed
      if (bannerUrl !== campaign.bannerUrl) {
        patch.verificationStatus = 'pending'
      }
    }

    await prisma.campaign.update({ where: { id }, data: patch })
    const updated = await prisma.campaign.findFirst({ where: { id } })

    return NextResponse.json({
      success: true,
      campaign: updated
        ? {
            id: updated.id,
            name: updated.name,
            description: updated.description ?? '',
            bannerUrl: updated.bannerUrl,
            targetUrl: updated.targetUrl,
            mediaType: updated.mediaType ?? 'image',
            tags: updated.tags ?? [],
            targetLocations: updated.targetLocations ?? [],
            metadata: updated.metadata ?? undefined,
            cpc: updated.cpc,
            startDate: updated.startDate ? updated.startDate.toISOString() : null,
            endDate: updated.endDate ? updated.endDate.toISOString() : null,
          }
        : null,
    })
  } catch (error) {
    console.error('Update campaign error:', error)
    return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 })
  }
}
