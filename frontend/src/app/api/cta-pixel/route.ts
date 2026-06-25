/**
 * GET /api/cta-pixel?taskId=...&wallet=...&fingerprint=...&externalRef=...&ts=...&sig=...
 *
 * 1×1 GIF tracking-pixel variant of /api/cta-postback. Designed to be embedded
 * on an advertiser's "thank-you" page when they don't run a server callback.
 *
 *   <img src="https://ads.sovseas.xyz/api/cta-pixel?taskId=...&w=...&ts=...&sig=..." />
 *
 * The pixel always responds with a 43-byte transparent GIF — even on auth
 * failure — to avoid leaking signal to scrapers. Status code is still set
 * correctly for monitoring purposes (200 vs 4xx).
 */

import { NextRequest, NextResponse } from 'next/server'
import { processPostback } from '@/lib/webhook-process'
import { parsePixelQuery, TRACKING_PIXEL_BYTES } from '@/lib/webhook-verify'

const pixelHeaders = {
  'Content-Type': 'image/gif',
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  'Pragma': 'no-cache',
  'Access-Control-Allow-Origin': '*',
}

function pixelResponse(status: number) {
  return new NextResponse(TRACKING_PIXEL_BYTES as unknown as BodyInit, {
    status,
    headers: pixelHeaders,
  })
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const { payload, sig } = parsePixelQuery(searchParams)

    const result = await processPostback({
      payload,
      providedSig: sig,
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      referer: request.headers.get('referer') || undefined,
      endpoint: 'pixel',
    })

    return pixelResponse(result.status)
  } catch (error) {
    console.error('cta-pixel GET error:', error)
    return pixelResponse(500)
  }
}
