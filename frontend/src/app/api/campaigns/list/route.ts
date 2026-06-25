import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { combineSpend, getCtaSpendByCampaignIds } from '@/lib/campaign-spend'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const wallet = searchParams.get('wallet')

    if (!wallet) {
      return NextResponse.json({ error: 'Missing wallet parameter' }, { status: 400 })
    }

    const advertiser = await prisma.advertiser.findFirst({ where: { wallet } })

    if (!advertiser) {
      return NextResponse.json({ campaigns: [] }, { status: 200 })
    }

    const campaignDocs = await prisma.campaign.findMany({
      where: { advertiserId: advertiser.id },
      orderBy: { createdAt: 'desc' },
    })

    const ctaSpendByCampaign = await getCtaSpendByCampaignIds(
      campaignDocs.map((c) => c.id)
    )

    const campaigns = campaignDocs.map((campaign) => {
      const spend = combineSpend(campaign.spent, ctaSpendByCampaign.get(campaign.id) ?? 0)
      return {
        id: campaign.id,
        name: campaign.name,
        description: campaign.description ?? undefined,
        bannerUrl: campaign.bannerUrl,
        targetUrl: campaign.targetUrl,
        budget: campaign.budget,
        // Legacy field. Now reports the UNIFIED spent (clicks + CTAs) so any
        // existing UI that reads `.spent` still gets the right number.
        spent: spend.totalSpent,
        clickSpent: spend.clickSpent,
        ctaSpent: spend.ctaSpent,
        totalSpent: spend.totalSpent,
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
        verificationStatus: campaign.verificationStatus ?? 'approved',
        // Surface lifecycle status so the advertiser UI can distinguish
        // drafts (saved-but-not-published) from genuinely inactive/ended
        // campaigns — previously both rendered as "Inactive".
        status: campaign.status ?? undefined,
      }
    })

    return NextResponse.json({ campaigns }, { status: 200 })
  } catch (error) {
    console.error('List campaigns error:', error)
    return NextResponse.json({ error: 'Failed to list campaigns' }, { status: 500 })
  }
}


