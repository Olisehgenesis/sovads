import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * SDK heartbeat endpoint.
 *
 * Called by the SovAds SDK in the publisher's browser on init. We use this
 * to populate the "Integration" column in the publisher dashboard so a
 * publisher can verify the snippet is live — even before any campaigns
 * target their domain (i.e. before any impressions exist).
 *
 * Write-throttling: only persist the heartbeat when the previous `lastSeenAt`
 * is older than HEARTBEAT_THROTTLE_MS. High-traffic publishers would
 * otherwise flood `publisher_sites` with redundant updates on every page
 * load. Read paths (the dashboard) just need to know "have we heard from
 * this site recently?", so a 10-minute resolution is plenty.
 */

const HEARTBEAT_THROTTLE_MS = 10 * 60 * 1000 // 10 minutes

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

type HeartbeatBody = {
  siteId?: string
  sdkVersion?: string
  href?: string
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as HeartbeatBody
    const siteId = typeof body.siteId === 'string' ? body.siteId.trim() : ''
    if (!siteId) {
      // Don't 4xx — heartbeats are fire-and-forget. Acknowledge silently so
      // the SDK doesn't retry / log noise.
      return NextResponse.json({ ok: false, throttled: false }, { headers: corsHeaders })
    }

    // Unregistered / fallback IDs (`temp_*`) never correspond to a real
    // PublisherSite, so don't bother hitting the DB.
    if (siteId.startsWith('temp_')) {
      return NextResponse.json({ ok: true, throttled: false }, { headers: corsHeaders })
    }

    const site = await prisma.publisherSite.findUnique({
      where: { siteId },
      select: { id: true, lastSeenAt: true, lastSdkVersion: true },
    })
    if (!site) {
      return NextResponse.json({ ok: false, throttled: false }, { headers: corsHeaders })
    }

    const now = new Date()
    const sdkVersion = typeof body.sdkVersion === 'string' ? body.sdkVersion.slice(0, 32) : null
    const href = typeof body.href === 'string' ? body.href.slice(0, 500) : null

    const last = site.lastSeenAt ? new Date(site.lastSeenAt).getTime() : 0
    const fresh = now.getTime() - last < HEARTBEAT_THROTTLE_MS
    // Always persist immediately when SDK version changes (cheap signal that
    // the publisher upgraded). Otherwise honour the throttle.
    const sdkChanged = sdkVersion != null && sdkVersion !== site.lastSdkVersion

    if (fresh && !sdkChanged) {
      return NextResponse.json({ ok: true, throttled: true }, { headers: corsHeaders })
    }

    await prisma.publisherSite.update({
      where: { id: site.id },
      data: {
        lastSeenAt: now,
        ...(sdkVersion ? { lastSdkVersion: sdkVersion } : {}),
        ...(href ? { lastHref: href } : {}),
      },
    })

    return NextResponse.json({ ok: true, throttled: false }, { headers: corsHeaders })
  } catch (err) {
    console.error('heartbeat error', err)
    // Never surface 5xx to the SDK — heartbeats are best-effort.
    return NextResponse.json({ ok: false, throttled: false }, { headers: corsHeaders })
  }
}
