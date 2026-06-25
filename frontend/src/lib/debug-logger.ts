import 'server-only'
import { NextRequest } from 'next/server'
import { trackSdkLog, type SdkLogType } from '@/lib/analytics/track'

/**
 * Debug Logger — writes all SDK/API/callback logs to Turso.
 *
 * The public API (logSdkRequest, logSdkInteraction, logApiRouteCall,
 * logCallback, getIpAddress) is preserved so existing call sites don't
 * need to change. Internally everything funnels through the Turso
 * batched writer (`trackSdkLog`).
 *
 * Postgres firehose tables (SdkRequest, SdkInteraction, ApiRouteCall,
 * CallbackLog) are now write-frozen — historical rows are still readable
 * via Prisma but no new rows are added here.
 */

const MAX_RESPONSE_LOG_LENGTH = 10_000

function safeStringify(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch (error) {
    console.error('Failed to stringify value for debug log:', error)
    return null
  }
}

function safeJson(value: unknown): Record<string, unknown> | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'object') return value as Record<string, unknown>
  try {
    return { value: String(value) }
  } catch {
    return null
  }
}

function truncate(s: string | null, max: number): string | null {
  if (!s) return s
  return s.length > max ? `${s.substring(0, max)}... [truncated]` : s
}

export interface SdkRequestLog {
  type: string
  endpoint: string
  method: string
  siteId?: string
  domain?: string
  pageUrl?: string
  userAgent?: string
  ipAddress?: string
  fingerprint?: string
  requestBody?: unknown
  responseStatus?: number
  responseBody?: unknown
  error?: string
  duration?: number
}

export interface SdkInteractionLog {
  requestId?: string
  type: string
  adId?: string
  campaignId?: string
  siteId?: string
  pageUrl?: string
  elementType?: string
  metadata?: Record<string, unknown>
}

export interface ApiRouteCallLog {
  route: string
  method: string
  statusCode: number
  ipAddress?: string
  userAgent?: string
  requestBody?: unknown
  responseBody?: unknown
  error?: string
  duration?: number
}

export interface CallbackLogData {
  type: string
  endpoint: string
  payload: unknown
  ipAddress?: string
  userAgent?: string
  fingerprint?: string
  statusCode?: number
  error?: string
}

export function getIpAddress(request: NextRequest): string | undefined {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-client-ip') ||
    undefined
  )
}

/**
 * Returns a synthetic request id. We used to return the Postgres row id;
 * SDK callers only use this opaquely so a UUID is fine.
 */
export async function logSdkRequest(data: SdkRequestLog): Promise<string> {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  try {
    trackSdkLog({
      type: 'SDK_REQUEST' as SdkLogType,
      endpoint: data.endpoint,
      method: data.method,
      siteId: data.siteId,
      domain: data.domain,
      pageUrl: data.pageUrl,
      fingerprint: data.fingerprint,
      payload: {
        id,
        subtype: data.type,
        userAgent: data.userAgent,
        ipAddress: data.ipAddress,
        requestBody: safeJson(data.requestBody),
        responseBody: safeJson(data.responseBody),
      },
      responseStatus: data.responseStatus,
      durationMs: data.duration != null ? Math.round(data.duration) : null,
      errorText: data.error ?? null,
    })
  } catch (error) {
    console.error('Error logging SDK request:', error)
  }
  return id
}

export async function logSdkInteraction(data: SdkInteractionLog): Promise<void> {
  try {
    trackSdkLog({
      type: 'SDK_INTERACTION' as SdkLogType,
      endpoint: data.elementType ?? null,
      siteId: data.siteId,
      pageUrl: data.pageUrl,
      payload: {
        requestId: data.requestId,
        subtype: data.type,
        adId: data.adId,
        campaignId: data.campaignId,
        metadata: data.metadata,
      },
    })
  } catch (error) {
    console.error('Error logging SDK interaction:', error)
  }
}

export async function logApiRouteCall(data: ApiRouteCallLog): Promise<void> {
  try {
    trackSdkLog({
      type: 'API_CALL' as SdkLogType,
      endpoint: data.route,
      method: data.method,
      payload: {
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        requestBody: safeJson(data.requestBody),
        responseBody: safeJson(
          typeof data.responseBody === 'string'
            ? truncate(data.responseBody, MAX_RESPONSE_LOG_LENGTH)
            : data.responseBody,
        ),
      },
      responseStatus: data.statusCode,
      durationMs: data.duration != null ? Math.round(data.duration) : null,
      errorText: data.error ?? null,
    })
  } catch (error) {
    console.error('Error logging API route call:', error)
  }
}

export async function logCallback(data: CallbackLogData): Promise<void> {
  try {
    trackSdkLog({
      type: 'CALLBACK' as SdkLogType,
      endpoint: data.endpoint,
      fingerprint: data.fingerprint,
      payload: {
        subtype: data.type,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        body: safeJson(data.payload) ?? safeStringify(data.payload),
      },
      responseStatus: data.statusCode ?? null,
      errorText: data.error ?? null,
    })
  } catch (error) {
    console.error('Error logging callback:', error)
  }
}
