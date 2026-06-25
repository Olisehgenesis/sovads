/**
 * POST /api/cta-postback
 *
 * Advertiser server → us. Confirms a CTA task was completed off-chain
 * (form submitted, purchase made, account verified, etc.).
 *
 * Headers:
 *   X-Sovads-Sig: <hex hmac-sha256 of canonical JSON body, key = task.config.webhook.secret>
 *
 * Body (JSON):
 *   {
 *     taskId:      string,            // required
 *     wallet?:     string,            // optional; if omitted, only points are awarded (none, since no viewer)
 *     fingerprint?: string,
 *     externalRef?: string,            // unique order/event id; required if config.requireExternalRef
 *     ts:          number              // unix seconds, ±5min to 24h window
 *   }
 *
 * Response (200): { success, completionId, awarded, transaction? }
 */

import { NextRequest, NextResponse } from 'next/server'
import { processPostback } from '@/lib/webhook-process'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Sovads-Sig',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

export async function POST(request: NextRequest) {
  try {
    const sig =
      request.headers.get('x-sovads-sig') ||
      request.headers.get('x-signature') ||
      ''

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'invalid JSON body' }, { status: 400, headers: corsHeaders })
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'invalid body' }, { status: 400, headers: corsHeaders })
    }

    const b = body as Record<string, unknown>
    const result = await processPostback({
      payload: {
        taskId: typeof b.taskId === 'string' ? b.taskId : '',
        wallet: typeof b.wallet === 'string' ? b.wallet : undefined,
        fingerprint: typeof b.fingerprint === 'string' ? b.fingerprint : undefined,
        externalRef: typeof b.externalRef === 'string' ? b.externalRef : undefined,
        ts: typeof b.ts === 'number' ? b.ts : Number(b.ts),
      },
      providedSig: sig,
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      endpoint: 'postback',
    })

    return NextResponse.json(result.body, { status: result.status, headers: corsHeaders })
  } catch (error) {
    console.error('cta-postback POST error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500, headers: corsHeaders }
    )
  }
}
