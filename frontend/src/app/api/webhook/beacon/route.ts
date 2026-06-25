import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { logCallback, getIpAddress } from '@/lib/debug-logger'
import { getImpressionCostInToken } from '@/lib/impression-pricing'
import {
  trackAdEvent,
  countRecentEvents,
  recentlySeen,
  type AdEventType,
} from '@/lib/analytics/track'
import { ipHash } from '@/lib/analytics/visitor'

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
    if (process.env.NODE_ENV !== 'development') {
      const duplicateWindow = type === 'IMPRESSION' ? 60 * 1000 : 5 * 60 * 1000
      if (fingerprint) {
        const isDup = await recentlySeen({
          fingerprint,
          campaignId,
          type: type as AdEventType,
          windowMs: duplicateWindow,
        })
        if (isDup) {
          return NextResponse.json({
            error: 'Duplicate event detected',
          }, { status: 409 })
        }
      }
    }

    // 3. Rate limiting per campaign per site (100 events/hour)
    const recentEvents = await countRecentEvents({
      campaignId,
      siteId,
      type: type as AdEventType,
      windowMs: 3600 * 1000,
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
    const eventId = randomUUID()
    await trackAdEvent({
      type: type as AdEventType,
      campaignId,
      adId,
      publisherId: publisherId ?? 'temp',
      siteId,
      fingerprint: fingerprint ?? null,
      verifiedHuman: renderVerified && viewportVisible !== false,
      ipHash: ipAddress ? ipHash(ipAddress) : null,
      userAgent: clientUserAgent ?? userAgent,
    })

    // Update campaign spent amount
    if (type === 'CLICK') {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { spent: { increment: campaign.cpc } },
      })
    } else if (type === 'IMPRESSION') {
      const impressionCost = await getImpressionCostInToken(campaign.tokenAddress)
      if (impressionCost > 0) {
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { spent: { increment: impressionCost } },
        })
      }
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
