import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { combineSpend, getCtaSpendForCampaign } from '@/lib/campaign-spend'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const onChainId = searchParams.get('onChainId')
    const include = (searchParams.get('include') || '').split(',').filter(Boolean)
    const includeTasks = include.includes('tasks')

    let campaign
    if (id) {
      campaign = await prisma.campaign.findFirst({
        where: { id },
        include: { advertiser: true, tasks: includeTasks },
      })
    } else if (onChainId) {
      campaign = await prisma.campaign.findFirst({
        where: { onChainId: Number(onChainId) },
        include: { advertiser: true, tasks: includeTasks },
      })
    } else {
      return NextResponse.json({ error: 'Missing id or onChainId parameter' }, { status: 400 })
    }

    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

    // If tasks were eager-loaded, sum from there to avoid a second DB hit.
    const ctaSpentTotal = includeTasks && campaign.tasks
      ? (campaign.tasks as { spentGs: number }[]).reduce((s, t) => s + (t.spentGs ?? 0), 0)
      : await getCtaSpendForCampaign(campaign.id)
    const spend = combineSpend(campaign.spent, ctaSpentTotal)

    return NextResponse.json({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        description: campaign.description ?? undefined,
        bannerUrl: campaign.bannerUrl,
        targetUrl: campaign.targetUrl,
        budget: campaign.budget,
        // Legacy field reports UNIFIED spend (see /api/campaigns/list).
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
        createdAt: campaign.createdAt ?? null,
        status: campaign.status,
        verificationStatus: campaign.verificationStatus ?? null,
        submittedAt: campaign.submittedAt ?? null,
        approvedAt: campaign.approvedAt ?? null,
        advertiserWallet: campaign.advertiser?.wallet ?? null,
        tasks: includeTasks
          ? (campaign.tasks ?? []).map((t) => ({
              id: t.id,
              kind: t.kind,
              label: t.label,
              description: t.description,
              verifier: t.verifier,
              config: t.config,
              rewardPoints: t.rewardPoints,
              rewardGs: t.rewardGs,
              budgetGs: t.budgetGs,
              spentGs: t.spentGs,
              maxPerWallet: t.maxPerWallet,
              cooldownSecs: t.cooldownSecs,
              active: t.active,
              surface: t.surface,
              contractAllowlist: t.contractAllowlist,
              planGeneratedAt: t.planGeneratedAt,
              planModel: t.planModel,
            }))
          : undefined,
      },
    }, { status: 200 })
  } catch (error) {
    console.error('Campaign detail error:', error)
    return NextResponse.json({ error: 'Failed to load campaign' }, { status: 500 })
  }
}
