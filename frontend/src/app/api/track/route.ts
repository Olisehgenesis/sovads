import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getImpressionCostInToken } from '@/lib/impression-pricing'
import {
  trackAdEvent,
  recentlySeen,
  countRecentEvents,
  type AdEventType,
} from '@/lib/analytics/track'
import { ipHash } from '@/lib/analytics/visitor'
import { getIpAddress } from '@/lib/debug-logger'

const EVENT_TYPES = ['IMPRESSION', 'CLICK'] as const
const DEDUP_WINDOW_MS = 3600 * 1000 // 1h
const RATE_LIMIT_WINDOW_MS = 3600 * 1000 // 1h
const RATE_LIMIT_MAX = 100

/**
 * Event tracking endpoint.
 *
 * Storage split:
 *  - Event rows  → Turso `events` (firehose, denormalized)
 *  - Campaign.spent updates → Postgres (money/state, transactional)
 *  - Publisher / Campaign lookups → Postgres (source of truth)
 *
 * Dedup + rate limit run against Turso. Postgres `Event` table is now
 * write-frozen; historical rows remain readable via Prisma.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, campaignId, adId, siteId, fingerprint } = body as {
      type?: string
      campaignId?: string
      adId?: string
      siteId?: string
      fingerprint?: string
    }

    if (!type || !campaignId || !adId || !siteId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!EVENT_TYPES.includes(type as (typeof EVENT_TYPES)[number])) {
      return NextResponse.json({ error: 'Invalid event type' }, { status: 400 })
    }
    const eventType = type as AdEventType

    // Publisher lookup — Postgres (state)
    const publisherSite = await prisma.publisherSite.findFirst({ where: { siteId } })
    const publisher =
      (publisherSite
        ? await prisma.publisher.findFirst({ where: { id: publisherSite.publisherId } })
        : null) ??
      (await prisma.publisher.findFirst({
        where: { OR: [{ id: siteId.replace('site_', '') }, { domain: siteId }] },
      }))
    if (!publisher) {
      return NextResponse.json({ error: 'Publisher not found' }, { status: 404 })
    }

    // Campaign lookup — Postgres (state)
    const campaign = await prisma.campaign.findFirst({ where: { id: campaignId } })
    if (!campaign || !campaign.active) {
      return NextResponse.json({ error: 'Campaign not found or inactive' }, { status: 404 })
    }

    // Dedup + rate limit — Turso (firehose)
    if (fingerprint) {
      const isDup = await recentlySeen({
        fingerprint,
        campaignId,
        type: eventType,
        windowMs: DEDUP_WINDOW_MS,
      })
      if (isDup) {
        return NextResponse.json({ error: 'Duplicate event detected' }, { status: 409 })
      }
    }

    const recent = await countRecentEvents({
      campaignId,
      siteId,
      type: eventType,
      windowMs: RATE_LIMIT_WINDOW_MS,
    })
    if (recent > RATE_LIMIT_MAX) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    const ip = getIpAddress(request)
    const userAgent = request.headers.get('user-agent') || 'unknown'

    // Write the event to Turso (awaited — needs to land before we respond)
    const eventId = randomUUID()
    await trackAdEvent({
      type: eventType,
      campaignId,
      adId,
      publisherId: publisher.id,
      siteId,
      fingerprint: fingerprint ?? null,
      ipHash: ip ? ipHash(ip) : null,
      userAgent,
    })

    // Update campaign spent — Postgres (money)
    if (eventType === 'CLICK') {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { spent: { increment: campaign.cpc } },
      })
    } else if (eventType === 'IMPRESSION') {
      const impressionCost = await getImpressionCostInToken(campaign.tokenAddress)
      if (impressionCost > 0) {
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { spent: { increment: impressionCost } },
        })
      }
    }

    return NextResponse.json({ success: true, eventId })
  } catch (error) {
    console.error('Error tracking event:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
