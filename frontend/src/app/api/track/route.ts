import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const EVENT_TYPES = ['IMPRESSION', 'CLICK'] as const

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, campaignId, adId, siteId, fingerprint } = body

    if (!type || !campaignId || !adId || !siteId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Validate event type
    if (!EVENT_TYPES.includes(type)) {
      return NextResponse.json({ error: 'Invalid event type' }, { status: 400 })
    }

    // Get publisher by siteId
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

    // Get campaign
    const campaign = await prisma.campaign.findFirst({ where: { id: campaignId } })

    if (!campaign || !campaign.active) {
      return NextResponse.json({ error: 'Campaign not found or inactive' }, { status: 404 })
    }

    // Check for duplicate events (fraud prevention) - within last hour
    const oneHourAgo = new Date(Date.now() - 3600 * 1000)
    const existingEvent = await prisma.event.findFirst({
      where: {
        type,
        campaignId,
        adId,
        siteId,
        fingerprint: fingerprint ?? null,
        timestamp: { gte: oneHourAgo },
      },
    })

    if (existingEvent) {
      return NextResponse.json({ error: 'Duplicate event detected' }, { status: 409 })
    }

    // Rate limiting per campaign - check events in last hour
    const recentEvents = await prisma.event.count({
      where: {
        type,
        campaignId,
        siteId,
        timestamp: { gte: oneHourAgo },
      },
    })

    if (recentEvents > 100) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    // Create event
    const event = await prisma.event.create({
      data: {
        type,
        campaignId,
        publisherId: publisher.id,
        siteId,
        adId,
        ipAddress:
          request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
          request.headers.get('x-real-ip') ||
          request.headers.get('cf-connecting-ip') ||
          request.headers.get('x-client-ip') ||
          'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        fingerprint: fingerprint || undefined,
        publisherSiteId: publisherSite?.id ?? undefined,
        verified: type === 'CLICK',
      },
    })

    // Update campaign spent amount for clicks
    if (type === 'CLICK') {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { spent: { increment: campaign.cpc } },
      })
    }

    return NextResponse.json({ success: true, eventId: event.id })
  } catch (error) {
    console.error('Error tracking event:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}