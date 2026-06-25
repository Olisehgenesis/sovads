import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import {
  detectMediaTypeFromUrl,
  getAllowedCreativeFormatLabel,
  hasAllowedCreativeExtension,
} from '@/lib/creative-validation'
import { MIN_BUDGET_GS } from '@/lib/campaign-limits'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      wallet,
      campaignData,
      transactionHash,
      contractCampaignId,
      onChainId,
      startDate,
      endDate,
    } = body

    if (!wallet || !campaignData) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Draft mode: campaign is created in the DB only. On-chain submission
    // happens later via /api/campaigns/submit. If a transactionHash IS
    // provided we treat it as a one-shot "create + publish" call (legacy path)
    // and the campaign goes straight to status='review'.
    const isDraft = !transactionHash || !contractCampaignId
    if (!isDraft && (!transactionHash || !contractCampaignId)) {
      return NextResponse.json({ error: 'transactionHash + contractCampaignId required when not draft' }, { status: 400 })
    }

    let advertiser = await prisma.advertiser.findFirst({ where: { wallet } })
    const now = new Date()

    if (!advertiser) {
      advertiser = await prisma.advertiser.create({
        data: {
          wallet,
          name: `Advertiser ${wallet.slice(0, 6)}...`,
          subscriptionActive: true,
          subscriptionDate: now,
          subscriptionPlan: 'basic',
          totalSpent: 0,
        },
      })
    } else {
      await prisma.advertiser.update({ where: { id: advertiser.id }, data: {} })
    }

    const budget = Number.parseFloat(campaignData.budget)
    const cpc = Number.parseFloat(campaignData.cpc || '2')

    if (Number.isNaN(budget) || budget <= 0) {
      return NextResponse.json({ error: 'Invalid budget amount' }, { status: 400 })
    }

    // Network-wide minimum applies only on publish — drafts can be saved
    // at any amount so the advertiser can keep iterating before going live.
    if (!isDraft && budget < MIN_BUDGET_GS) {
      return NextResponse.json(
        { error: `Minimum publish budget is ${MIN_BUDGET_GS} G$.` },
        { status: 400 }
      )
    }

    if (Number.isNaN(cpc) || cpc < 0) {
      return NextResponse.json({ error: 'Invalid CPC amount' }, { status: 400 })
    }

    if (!campaignData.bannerUrl || typeof campaignData.bannerUrl !== 'string') {
      return NextResponse.json({ error: 'Creative URL is required' }, { status: 400 })
    }

    if (!hasAllowedCreativeExtension(campaignData.bannerUrl)) {
      return NextResponse.json(
        { error: `Unsupported creative format. ${getAllowedCreativeFormatLabel()}` },
        { status: 400 }
      )
    }

    const tags: string[] = Array.isArray(campaignData.tags)
      ? campaignData.tags
      : typeof campaignData.tags === 'string'
        ? campaignData.tags
          .split(',')
          .map((tag: string) => tag.trim())
          .filter((tag: string) => tag.length > 0)
        : []

    const targetLocations: string[] = Array.isArray(campaignData.targetLocations)
      ? campaignData.targetLocations
      : typeof campaignData.targetLocations === 'string'
        ? campaignData.targetLocations
          .split(',')
          .map((loc: string) => loc.trim())
          .filter((loc: string) => loc.length > 0)
        : []

    const metadata =
      typeof campaignData.metadata === 'object' && campaignData.metadata !== null
        ? campaignData.metadata
        : undefined

    const detectedMediaType = detectMediaTypeFromUrl(campaignData.bannerUrl)
    const mediaType: 'image' | 'video' =
      campaignData.mediaType === 'video' || detectedMediaType === 'video' ? 'video' : 'image'

    const campaignId = randomUUID()
    const startDateValue = startDate ? new Date(startDate) : undefined
    const endDateValue = endDate ? new Date(endDate) : undefined

    const campaign = await prisma.campaign.create({
      data: {
        id: campaignId,
        advertiserId: advertiser.id,
        name: campaignData.name,
        description: campaignData.description || null,
        bannerUrl: campaignData.bannerUrl,
        targetUrl: campaignData.targetUrl,
        budget,
        spent: 0,
        cpc,
        // Drafts must NOT be active — otherwise the advertiser dashboard
        // counts them as live campaigns and shows the green "Active" badge
        // even though nothing has been published on-chain. `active` flips
        // true only when the on-chain submission succeeds (publish flow,
        // or the later /api/campaigns/submit step that promotes a draft).
        active: !isDraft,
        tokenAddress: campaignData.tokenAddress || null,
        onChainId: (onChainId !== undefined && onChainId !== null) ? Number(onChainId) : undefined,
        metadataURI: JSON.stringify({
          contractCampaignId: contractCampaignId ?? null,
          transactionHash: transactionHash ?? null,
          startDate: startDateValue?.toISOString(),
          endDate: endDateValue?.toISOString(),
          tags,
          targetLocations,
          metadata,
          mediaType,
        }),
        tags,
        targetLocations,
        metadata: metadata ?? undefined,
        startDate: startDateValue,
        endDate: endDateValue,
        mediaType,
        verificationStatus: isDraft ? null : 'pending',
        status: isDraft ? 'draft' : 'review',
        submittedAt: isDraft ? null : now,
      },
    })

    return NextResponse.json(
      {
        success: true,
        campaign: {
          id: campaign.id,
          name: campaign.name,
          budget: campaign.budget,
          active: campaign.active,
          status: campaign.status,
          tags,
          targetLocations,
          mediaType,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Database error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    return NextResponse.json(
      {
        error: 'Failed to save campaign to database',
        details: errorMessage,
      },
      { status: 500 }
    )
  }
}
