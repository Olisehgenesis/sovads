import { NextRequest, NextResponse } from 'next/server'
import { collections } from '@/lib/db'
import {
  detectMediaTypeFromUrl,
  getAllowedCreativeFormatLabel,
  hasAllowedCreativeExtension,
} from '@/lib/creative-validation'

const normalizeTargetUrl = (value: string): string =>
  /^(https?:)?\/\//i.test(value) ? value : `https://${value}`

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

    const advertisersCollection = await collections.advertisers()
    const campaignsCollection = await collections.campaigns()
    const advertiser = await advertisersCollection.findOne({ wallet })
    if (!advertiser) {
      return NextResponse.json({ error: 'Advertiser not found' }, { status: 404 })
    }

    const campaign = await campaignsCollection.findOne({ _id: id, advertiserId: advertiser._id })
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() }

    if (typeof updates.name === 'string') patch.name = updates.name.trim()
    if (typeof updates.description === 'string') patch.description = updates.description.trim()
    if (typeof updates.targetUrl === 'string') patch.targetUrl = normalizeTargetUrl(updates.targetUrl.trim())
    if (Array.isArray(updates.tags)) patch.tags = updates.tags.filter((tag) => typeof tag === 'string')
    if (Array.isArray(updates.targetLocations)) {
      patch.targetLocations = updates.targetLocations.filter((loc) => typeof loc === 'string')
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

    await campaignsCollection.updateOne({ _id: id }, { $set: patch })
    const updated = await campaignsCollection.findOne({ _id: id })

    return NextResponse.json({
      success: true,
      campaign: updated
        ? {
            id: updated._id,
            name: updated.name,
            description: updated.description ?? '',
            bannerUrl: updated.bannerUrl,
            targetUrl: updated.targetUrl,
            mediaType: updated.mediaType ?? 'image',
            tags: updated.tags ?? [],
            targetLocations: updated.targetLocations ?? [],
            metadata: updated.metadata ?? undefined,
          }
        : null,
    })
  } catch (error) {
    console.error('Update campaign error:', error)
    return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 })
  }
}
