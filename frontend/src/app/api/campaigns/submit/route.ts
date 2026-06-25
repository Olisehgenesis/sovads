import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/campaigns/submit
 *
 * Owner-auth: attaches an on-chain transaction to a draft campaign and flips
 * its lifecycle status from 'draft' → 'review'. The on-chain tx itself is
 * performed client-side via wagmi (createStreamingCampaign); this endpoint
 * only records the result.
 *
 * Body: {
 *   campaignId: string,
 *   wallet: string,              // must match campaign.advertiser.wallet
 *   transactionHash: string,
 *   contractCampaignId: string,  // off-chain id (sovads-MM-DD-NN)
 *   onChainId?: number,          // on-chain campaign id returned by the contract
 * }
 *
 * Returns the updated campaign.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { campaignId, wallet, transactionHash, contractCampaignId, onChainId } = body as {
      campaignId: string
      wallet: string
      transactionHash: string
      contractCampaignId: string
      onChainId?: number | string
    }

    if (!campaignId || !wallet || !transactionHash || !contractCampaignId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { advertiser: true },
    })
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Owner check (case-insensitive wallet match — same trust model as create).
    if (!campaign.advertiser?.wallet || campaign.advertiser.wallet.toLowerCase() !== wallet.toLowerCase()) {
      return NextResponse.json({ error: 'Not campaign owner' }, { status: 403 })
    }

    if (campaign.status !== 'draft') {
      return NextResponse.json(
        { error: `Cannot submit campaign in status "${campaign.status}"` },
        { status: 409 }
      )
    }

    // Merge new on-chain info into the existing metadataURI blob without
    // dropping any previously-stored fields.
    let existingMeta: Record<string, unknown> = {}
    if (campaign.metadataURI) {
      try {
        const parsed = JSON.parse(campaign.metadataURI)
        if (parsed && typeof parsed === 'object') existingMeta = parsed as Record<string, unknown>
      } catch {
        // Ignore malformed legacy metadataURI; we'll overwrite.
      }
    }
    const mergedMeta = {
      ...existingMeta,
      contractCampaignId,
      transactionHash,
    }

    const now = new Date()
    const updated = await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        status: 'review',
        verificationStatus: 'pending',
        submittedAt: now,
        onChainId:
          onChainId !== undefined && onChainId !== null ? Number(onChainId) : campaign.onChainId,
        metadataURI: JSON.stringify(mergedMeta),
      },
    })

    return NextResponse.json({
      success: true,
      campaign: {
        id: updated.id,
        status: updated.status,
        verificationStatus: updated.verificationStatus,
        onChainId: updated.onChainId,
        submittedAt: updated.submittedAt,
      },
    })
  } catch (error) {
    console.error('campaigns/submit error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
