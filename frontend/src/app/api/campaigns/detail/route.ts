import { NextRequest, NextResponse } from 'next/server'
import { collections } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const onChainId = searchParams.get('onChainId')

    const campaignsCollection = await collections.campaigns()

    let campaign
    if (id) {
      campaign = await campaignsCollection.findOne({ _id: id })
    } else if (onChainId) {
      campaign = await campaignsCollection.findOne({ onChainId: Number(onChainId) })
    } else {
      return NextResponse.json({ error: 'Missing id or onChainId parameter' }, { status: 400 })
    }

    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

    const payload = {
      id: campaign._id,
      name: campaign.name,
      description: campaign.description ?? undefined,
      bannerUrl: campaign.bannerUrl,
      targetUrl: campaign.targetUrl,
      budget: campaign.budget,
      spent: campaign.spent,
      cpc: campaign.cpc,
      active: campaign.active,
      tokenAddress: campaign.tokenAddress ?? undefined,
      tags: campaign.tags ?? [],
      targetLocations: campaign.targetLocations ?? [],
      metadata: campaign.metadata ?? undefined,
      startDate: campaign.startDate ?? null,
      endDate: campaign.endDate ?? null,
      mediaType: campaign.mediaType ?? 'image',
      onChainId: campaign.onChainId ?? undefined,
      createdAt: campaign.createdAt ?? null,
    }

    return NextResponse.json({ campaign: payload }, { status: 200 })
  } catch (error) {
    console.error('Campaign detail error:', error)
    return NextResponse.json({ error: 'Failed to load campaign' }, { status: 500 })
  }
}
