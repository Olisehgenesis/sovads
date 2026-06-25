/**
 * Webhook verification for the WEBHOOK task verifier.
 *
 * Three sub-modes, all reduce to the same HMAC check:
 *   - postback  → POST /api/cta-postback   (S2S, advertiser server → us)
 *   - pixel     → GET  /api/cta-pixel      (1×1 GIF from advertiser's success page)
 *   - redirect  → /cta/[id]?postback=<sig> (browser-presented token)
 *
 * Security model:
 *   - Per-task `config.webhook.secret` is the shared HMAC key.
 *   - Body / query is canonicalized then HMAC-SHA256'd.
 *   - 24h replay window enforced via `ts` (postback / pixel) or `iat` (redirect).
 *   - `externalRef` (when provided + `deduplicateBy=externalRef`) prevents double-credit.
 */

import { createHmac, timingSafeEqual } from 'crypto'

export interface WebhookConfig {
  mode: 'postback' | 'pixel' | 'redirect'
  secret: string
  requireExternalRef?: boolean
  deduplicateBy?: 'externalRef'
  allowedOrigins?: string[] // for pixel mode; matched against Referer host
  maxAgeSec?: number        // override the default 24h replay window
}

export interface WebhookPayload {
  taskId: string
  wallet?: string
  fingerprint?: string
  externalRef?: string
  ts: number // unix seconds
}

const DEFAULT_MAX_AGE_SEC = 24 * 60 * 60

/** Sort keys then JSON-stringify so signatures are stable. */
export function canonicalize(payload: WebhookPayload): string {
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(payload).sort()) {
    const v = (payload as unknown as Record<string, unknown>)[key]
    if (v === undefined || v === null) continue
    sorted[key] = v
  }
  return JSON.stringify(sorted)
}

/** Constant-time HMAC compare. Returns false on length mismatch. */
function safeCompare(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, 'hex')
    const bb = Buffer.from(b, 'hex')
    if (ab.length !== bb.length || ab.length === 0) return false
    return timingSafeEqual(ab, bb)
  } catch {
    return false
  }
}

export function computeSignature(secret: string, message: string): string {
  return createHmac('sha256', secret).update(message).digest('hex')
}

export interface VerifyWebhookResult {
  ok: boolean
  reason?: string
  payload?: WebhookPayload
}

export function verifyWebhook(args: {
  config: WebhookConfig
  payload: WebhookPayload
  providedSig: string
}): VerifyWebhookResult {
  const { config, payload, providedSig } = args
  if (!config || !config.secret) return { ok: false, reason: 'task webhook not configured' }
  if (!providedSig) return { ok: false, reason: 'missing signature' }

  // Required fields
  if (!payload.taskId) return { ok: false, reason: 'missing taskId' }
  if (config.requireExternalRef && !payload.externalRef) {
    return { ok: false, reason: 'missing externalRef' }
  }
  if (!Number.isFinite(payload.ts)) return { ok: false, reason: 'missing ts' }

  // Replay window
  const maxAge = config.maxAgeSec ?? DEFAULT_MAX_AGE_SEC
  const now = Math.floor(Date.now() / 1000)
  const age = now - payload.ts
  if (age < -300 || age > maxAge) {
    return { ok: false, reason: `ts out of window (age=${age}s, max=${maxAge}s)` }
  }

  // HMAC
  const expected = computeSignature(config.secret, canonicalize(payload))
  if (!safeCompare(expected, providedSig.toLowerCase().replace(/^0x/, ''))) {
    return { ok: false, reason: 'bad signature' }
  }

  return { ok: true, payload }
}

/** Parse `?ts=&taskId=&wallet=&fingerprint=&externalRef=&sig=` from a URL. */
export function parsePixelQuery(searchParams: URLSearchParams): {
  payload: WebhookPayload
  sig: string
} {
  const tsRaw = searchParams.get('ts')
  return {
    payload: {
      taskId: searchParams.get('taskId') || '',
      wallet: searchParams.get('wallet') || undefined,
      fingerprint: searchParams.get('fingerprint') || undefined,
      externalRef: searchParams.get('externalRef') || undefined,
      ts: tsRaw ? Number(tsRaw) : 0,
    },
    sig: (searchParams.get('sig') || '').trim(),
  }
}

/** 1×1 transparent GIF (43 bytes). */
export const TRACKING_PIXEL_BYTES = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
)
