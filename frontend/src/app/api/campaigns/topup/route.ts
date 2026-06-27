/**
 * POST /api/campaigns/topup
 *
 * Records an on-chain campaign top-up into Postgres so the advertiser
 * dashboard sees the funded budget instead of the stale creation amount.
 *
 * Why this exists: `TopUpModal` historically called the on-chain
 * `topUpCampaign(...)` directly and nothing wrote the new balance back to
 * the DB. The result was `Campaign.budget` frozen at creation while spend
 * (clicks + CTAs) kept accumulating, so `used%` rendered wildly inflated
 * numbers (e.g. 319.8% on a "1,000 G$" budget that was actually 62 G$
 * in the DB). This endpoint closes the loop.
 *
 * Body: {
 *   campaignId: string,
 *   wallet:     string,        // must match campaign.advertiser.wallet
 *   amount:     number|string, // G$ added on-chain (human units)
 *   txHash?:    string,        // on-chain receipt for audit
 * }
 *
 * Trust model: same as `/api/campaigns/submit` — we case-insensitive
 * match the caller's wallet against `campaign.advertiser.wallet`. No
 * signature is required because the on-chain tx itself is the source of
 * truth; this row is a UI cache.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { campaignId, wallet, amount, txHash } = body as {
      campaignId?: string
      wallet?: string
      amount?: number | string
      txHash?: string
    }

    if (!campaignId || !wallet || amount === undefined || amount === null) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const delta = typeof amount === 'string' ? Number.parseFloat(amount) : amount
    if (!Number.isFinite(delta) || delta <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { advertiser: true },
    })
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Owner check — same trust model as `submit`.
    if (
      !campaign.advertiser?.wallet ||
      campaign.advertiser.wallet.toLowerCase() !== wallet.toLowerCase()
    ) {
      return NextResponse.json({ error: 'Not campaign owner' }, { status: 403 })
    }

    // Stash the tx hash in metadataURI for audit. Best-effort: if the field
    // is malformed JSON we just overwrite.
    let meta: Record<string, unknown> = {}
    if (campaign.metadataURI) {
      try {
        const parsed = JSON.parse(campaign.metadataURI)
        if (parsed && typeof parsed === 'object') meta = parsed as Record<string, unknown>
      } catch {
        /* ignore */
      }
    }
    const topups = Array.isArray(meta.topups) ? (meta.topups as unknown[]) : []
    topups.push({
      amount: delta,
      txHash: typeof txHash === 'string' ? txHash : null,
      at: new Date().toISOString(),
    })
    meta.topups = topups

    const updated = await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        budget: { increment: delta },
        metadataURI: JSON.stringify(meta),
      },
    })

    return NextResponse.json({
      success: true,
      campaignId: updated.id,
      budget: updated.budget,
      delta,
    })
  } catch (error) {
    console.error('campaigns/topup error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
