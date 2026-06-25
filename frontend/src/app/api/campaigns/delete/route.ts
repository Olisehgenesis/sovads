import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/campaigns/delete
 *
 * Discards a DRAFT campaign. Anything that has been submitted on-chain
 * (status !== 'draft') is rejected — those campaigns have to be paused or
 * cancelled through their on-chain lifecycle instead, since deleting the
 * Postgres row would orphan on-chain state.
 *
 * Body: { wallet, id }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { wallet, id } = body as { wallet?: string; id?: string }

    if (!wallet || !id) {
      return NextResponse.json({ error: 'wallet and id are required' }, { status: 400 })
    }

    const advertiser = await prisma.advertiser.findFirst({ where: { wallet } })
    if (!advertiser) {
      return NextResponse.json({ error: 'Advertiser not found' }, { status: 404 })
    }

    const campaign = await prisma.campaign.findFirst({
      where: { id, advertiserId: advertiser.id },
    })
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }
    if (campaign.status !== 'draft') {
      return NextResponse.json(
        { error: `Only drafts can be discarded (status="${campaign.status}")` },
        { status: 409 },
      )
    }

    // Drafts have no on-chain footprint, so a hard delete is safe. The schema
    // does NOT cascade Campaign → CampaignTask deletes, so wipe attached CTAs
    // first inside a transaction; otherwise the campaign delete throws an FK
    // violation. We don't touch events because drafts can't have served any.
    await prisma.$transaction([
      prisma.campaignTask.deleteMany({ where: { campaignId: id } }),
      prisma.campaign.delete({ where: { id } }),
    ])
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('campaigns/delete error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete campaign' },
      { status: 500 },
    )
  }
}
