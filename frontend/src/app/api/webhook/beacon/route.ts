import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logCallback, getIpAddress } from '@/lib/debug-logger'

const EVENT_TYPES = ['IMPRESSION', 'CLICK'] as const
type EventType = (typeof EVENT_TYPES)[number]
/**
 * Dedicated webhook endpoint for receiving Beacon API interactions
 * Designed for tracking impressions and clicks with enhanced metadata:
 * - Render verification (rendered, viewportVisible, renderTime)
 * - IP address detection (server-side)
 * - Site ID validation
 * - Better fraud prevention
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { error: 'Deprecated endpoint. Use signed /api/webhook/track.' },
      { status: 410 }
    )
  }

  try {
    // Extract IP address from request headers (server-side IP detection)
    const ipAddress = getIpAddress(request) || 'unknown'
    const userAgent = request.headers.get('user-agent') || 'unknown'

    // Parse request body (from Beacon API Blob)
    let body
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ 
        error: 'Invalid JSON payload' 
      }, { status: 400 })
    }

    const {
      type,
      campaignId,
      adId,
      siteId,
      fingerprint,
      rendered,
      viewportVisible,
      renderTime,
      userAgent: clientUserAgent,
    } = body as {
      type?: EventType
      campaignId?: string
      adId?: string
      siteId?: string
      fingerprint?: string | null
      rendered?: boolean
      viewportVisible?: boolean
      renderTime?: number
      userAgent?: string
    }

    // Validate required fields
    if (!type || !campaignId || !adId || !siteId) {
      return NextResponse.json({ 
        error: 'Missing required fields: type, campaignId, adId, siteId' 
      }, { status: 400 })
    }

    // Validate event type
    if (!EVENT_TYPES.includes(type)) {
      return NextResponse.json({ 
        error: 'Invalid event type' 
      }, { status: 400 })
    }

    // Verify site ID exists and is valid
    const publisherSite = await prisma.publisherSite.findFirst({ where: { siteId } })

    // If not found, check legacy Publisher structure
    let publisher = null
    if (!publisherSite) {
      publisher = await prisma.publisher.findFirst({
        where: { OR: [{ id: siteId }, { domain: siteId }] },
      })
    } else {
      publisher = await prisma.publisher.findFirst({ where: { id: publisherSite.publisherId } })
    }

    // Allow temp site IDs for development/testing
    if (!publisherSite && !publisher) {
      if (siteId.startsWith('site_') || siteId.startsWith('temp_')) {
        if (process.env.NODE_ENV === 'development') {
          // In development, allow unknown sites but log it
          console.warn(`Unknown site ID in development: ${siteId}`)
        } else {
          return NextResponse.json({ 
            error: 'Invalid site ID - site not registered' 
          }, { status: 404 })
        }
      } else {
        return NextResponse.json({ 
          error: 'Invalid site ID - site not registered' 
        }, { status: 404 })
      }
    }

    // Get campaign
    const campaign = await prisma.campaign.findFirst({ where: { id: campaignId } })

    if (!campaign || !campaign.active) {
      return NextResponse.json({ 
        error: 'Campaign not found or inactive' 
      }, { status: 404 })
    }

    // Enhanced fraud prevention:
    // 1. Verify ad was actually rendered (optional check - don't reject, but log)
    const renderVerified = rendered === true
    if (!renderVerified && type === 'IMPRESSION') {
      console.warn(`Unverified render for impression: adId=${adId}, siteId=${siteId}`)
    }

    // 2. Check for duplicate events
    // In development: skip duplicate check (allow testing)
    // In production: For impressions: check within 1 minute, For clicks: check within 5 minutes
    const eventsCollection = prisma.event
    if (process.env.NODE_ENV !== 'development') {
      const duplicateWindow = type === 'IMPRESSION' ? 60 * 1000 : 5 * 60 * 1000
      const duplicateWindowStart = new Date(Date.now() - duplicateWindow)
      const existingEvent = await prisma.event.findFirst({
        where: {
          type,
          campaignId,
          adId,
          siteId,
          ...(fingerprint != null ? { fingerprint } : {}),
          timestamp: { gte: duplicateWindowStart },
        },
      })
      
      if (existingEvent) {
        return NextResponse.json({ 
          error: 'Duplicate event detected',
          eventId: existingEvent.id
        }, { status: 409 })
      }
    }

    // 3. Rate limiting per campaign per site (100 events/hour)
    const oneHourAgo = new Date(Date.now() - 3600 * 1000)
    const recentEvents = await prisma.event.count({
      where: { type, campaignId, siteId, timestamp: { gte: oneHourAgo } },
    })

    if (recentEvents > 100) {
      return NextResponse.json({ 
        error: 'Rate limit exceeded' 
      }, { status: 429 })
    }

    // Determine publisher ID
    const publisherId = publisherSite?.publisherId || publisher?.id || null

    if (!publisherId && process.env.NODE_ENV !== 'development') {
      return NextResponse.json({ 
        error: 'Publisher not found for site ID' 
      }, { status: 404 })
    }

    // Create event with enhanced metadata
    const event = await prisma.event.create({
      data: {
        type,
        campaignId,
        publisherId: publisherId ?? 'temp',
        siteId,
        adId,
        ipAddress,
        userAgent: clientUserAgent ?? userAgent,
        fingerprint: fingerprint != null ? fingerprint : undefined,
        verified: renderVerified && viewportVisible !== false,
        publisherSiteId: publisherSite?.id ?? undefined,
      },
    })
    const eventId = event.id

    // Update campaign spent amount for clicks
    if (type === 'CLICK') {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { spent: { increment: campaign.cpc } },
      })
    }

    // Award viewer points for ad interaction (async, don't block response)
    ;(async () => {
      try {
        const pointsPerImpression = 1
        const pointsPerClick = 5
        const points = type === 'CLICK' ? pointsPerClick : pointsPerImpression

        if (!fingerprint) return

        // Find or create viewer
        let viewer = await prisma.viewerPoints.findFirst({
          where: { fingerprint, wallet: null },
        })

        const now = new Date()
        if (!viewer) {
          viewer = await prisma.viewerPoints.create({
            data: {
              wallet: null,
              fingerprint,
              totalPoints: points,
              claimedPoints: 0,
              pendingPoints: points,
              lastInteraction: now,
            },
          })
        } else {
          await prisma.viewerPoints.update({
            where: { id: viewer.id },
            data: {
              totalPoints: { increment: points },
              pendingPoints: { increment: points },
              lastInteraction: now,
            },
          })
        }

        // Create reward record
        await prisma.viewerReward.create({
          data: {
            viewerId: viewer.id,
            wallet: undefined,
            fingerprint,
            type,
            campaignId,
            adId,
            siteId,
            points,
            claimed: false,
          },
        })
      } catch (error) {
        // Silently fail - points awarding shouldn't break the main flow
        console.error('Error awarding viewer points:', error)
      }
    })()

    // Log render metrics for analytics (if available)
    if (renderTime !== undefined && process.env.NODE_ENV === 'development') {
      console.log(`Render metrics:`, {
        adId,
        renderTime: `${renderTime}ms`,
        rendered,
        viewportVisible,
        renderVerified
      })
    }

    const response = NextResponse.json({ 
      success: true, 
      eventId,
      metadata: {
        ipAddress,
        renderVerified,
        viewportVisible: viewportVisible ?? null,
        renderTime: renderTime ?? null
      }
    })

    // Log callback
    await logCallback({
      type: 'BEACON',
      endpoint: '/api/webhook/beacon',
      payload: body,
      ipAddress,
      userAgent,
      fingerprint: fingerprint ?? undefined,
      statusCode: 200,
    })

    return response
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    // Log failed callback
    try {
      const body = await request.json().catch(() => ({}))
      await logCallback({
        type: 'BEACON',
        endpoint: '/api/webhook/beacon',
        payload: body,
        ipAddress: getIpAddress(request),
        userAgent: request.headers.get('user-agent') || undefined,
        statusCode: 500,
        error: errorMessage,
      })
    } catch {}

    console.error('Error in beacon webhook:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      message: errorMessage
    }, { status: 500 })
  }
}

// Support OPTIONS for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

// Reject GET requests (method not allowed)
export async function GET() {
  return NextResponse.json({ 
    error: 'Method not allowed. Use POST instead.' 
  }, { status: 405 })
}
