/**
 * Single typed entry point for all firehose event writes.
 *
 * Rule: app code calls `track(...)` and never imports the Turso client
 * directly. This keeps the storage layer swappable and the call sites
 * grep-able.
 *
 * Two write modes:
 *  - `track(...)`           buffered, fire-and-forget (use for pageviews,
 *                           sdk logs, anything non-billable)
 *  - `trackImmediate(...)`  awaited single insert (use for CLICK / VOTE /
 *                           anything where loss is not acceptable in the
 *                           current request scope)
 *
 * The buffered path is safe to call from Next.js route handlers as long as
 * you accept that a frozen serverless invocation may drop the buffer. For
 * billable events, prefer `trackImmediate`.
 */

import { randomUUID } from 'crypto'
import { sql } from 'drizzle-orm'
import { turso } from '@/lib/turso/client'
import { batchedWriter } from '@/lib/turso/batched-writer'
import { events, pageviews, sdkLogs, taskResponses } from '@/lib/turso/schema'

// ─── Event payload types ────────────────────────────────────────────────────
export type AdEventType = 'IMPRESSION' | 'CLICK' | 'DISMISS'

export interface AdEventInput {
  type: AdEventType
  campaignId: string
  adId: string
  publisherId?: string | null
  siteId?: string | null
  fingerprint?: string | null
  wallet?: string | null
  verifiedHuman?: boolean
  ipHash?: string | null
  country?: string | null
  userAgent?: string | null
  trackingToken?: string | null
  pageUrl?: string | null
}

export type TaskResponseKind = 'VOTE' | 'ANSWER' | 'TEXT' | 'SUBMIT' | 'STEP' | 'DISMISS'

export interface TaskResponseInput {
  taskId: string
  completionId?: string | null
  campaignId: string
  siteId?: string | null
  viewerId: string
  fingerprint: string
  wallet?: string | null
  verifiedHuman?: boolean
  kind: TaskResponseKind
  payload: Record<string, unknown>
}

export interface PageviewInput {
  siteId: string
  publisherId: string
  pathname: string
  referrer?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  device?: string | null
  browser?: string | null
  os?: string | null
  country?: string | null
  visitorHash: string
  sessionHash: string
}

export type SdkLogType = 'SDK_REQUEST' | 'SDK_INTERACTION' | 'API_CALL' | 'CALLBACK'

export interface SdkLogInput {
  type: SdkLogType
  endpoint?: string | null
  method?: string | null
  siteId?: string | null
  domain?: string | null
  pageUrl?: string | null
  fingerprint?: string | null
  payload?: Record<string, unknown> | null
  responseStatus?: number | null
  durationMs?: number | null
  errorText?: string | null
}

// ─── Buffered writes (fire-and-forget) ──────────────────────────────────────

export function trackPageview(input: PageviewInput): void {
  batchedWriter().enqueue({
    sql: `INSERT INTO pageviews
            (id, site_id, publisher_id, pathname, referrer,
             utm_source, utm_medium, utm_campaign,
             device, browser, os, country,
             visitor_hash, session_hash, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      randomUUID(),
      input.siteId,
      input.publisherId,
      input.pathname,
      input.referrer ?? null,
      input.utmSource ?? null,
      input.utmMedium ?? null,
      input.utmCampaign ?? null,
      input.device ?? null,
      input.browser ?? null,
      input.os ?? null,
      input.country ?? null,
      input.visitorHash,
      input.sessionHash,
      Date.now(),
    ],
  })
}

export function trackSdkLog(input: SdkLogInput): void {
  batchedWriter().enqueue({
    sql: `INSERT INTO sdk_logs
            (id, type, endpoint, method, site_id, domain, page_url,
             fingerprint, payload_json, response_status, duration_ms,
             error_text, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      randomUUID(),
      input.type,
      input.endpoint ?? null,
      input.method ?? null,
      input.siteId ?? null,
      input.domain ?? null,
      input.pageUrl ?? null,
      input.fingerprint ?? null,
      input.payload ? JSON.stringify(input.payload) : null,
      input.responseStatus ?? null,
      input.durationMs ?? null,
      input.errorText ?? null,
      Date.now(),
    ],
  })
}

// ─── Awaited writes (for billable / state-bearing events) ───────────────────

export async function trackAdEvent(input: AdEventInput): Promise<void> {
  await turso().insert(events).values({
    id: randomUUID(),
    type: input.type,
    campaignId: input.campaignId,
    adId: input.adId,
    publisherId: input.publisherId ?? null,
    siteId: input.siteId ?? null,
    fingerprint: input.fingerprint ?? null,
    wallet: input.wallet ?? null,
    verifiedHuman: input.verifiedHuman ?? false,
    ipHash: input.ipHash ?? null,
    country: input.country ?? null,
    userAgent: input.userAgent ?? null,
    trackingToken: input.trackingToken ?? null,
    pageUrl: input.pageUrl ?? null,
    timestamp: Date.now(),
  })
}

export async function trackTaskResponse(input: TaskResponseInput): Promise<void> {
  await turso().insert(taskResponses).values({
    id: randomUUID(),
    taskId: input.taskId,
    completionId: input.completionId ?? null,
    campaignId: input.campaignId,
    siteId: input.siteId ?? null,
    viewerId: input.viewerId,
    fingerprint: input.fingerprint,
    wallet: input.wallet ?? null,
    verifiedHuman: input.verifiedHuman ?? false,
    kind: input.kind,
    payloadJson: JSON.stringify(input.payload),
    timestamp: Date.now(),
  })
}

// ─── Dedup helper (for fraud-prevention on IMPRESSION/CLICK) ────────────────

/**
 * Returns true if a matching event was inserted within `windowMs`.
 * Used to suppress duplicate impressions/clicks from the same fingerprint
 * inside a short window.
 */
export async function recentlySeen(args: {
  fingerprint: string
  campaignId: string
  type: AdEventType
  windowMs: number
}): Promise<boolean> {
  const cutoff = Date.now() - args.windowMs
  const rows = await turso()
    .select({ id: events.id })
    .from(events)
    .where(
      sql`${events.fingerprint} = ${args.fingerprint}
          AND ${events.campaignId} = ${args.campaignId}
          AND ${events.type} = ${args.type}
          AND ${events.timestamp} >= ${cutoff}`,
    )
    .limit(1)
  return rows.length > 0
}

/**
 * Counts events of a given type for a campaign+site within `windowMs`.
 * Used for per-route rate limiting.
 */
export async function countRecentEvents(args: {
  campaignId: string
  siteId: string
  type: AdEventType
  windowMs: number
}): Promise<number> {
  const cutoff = Date.now() - args.windowMs
  const rows = await turso()
    .select({ n: sql<number>`COUNT(*)` })
    .from(events)
    .where(
      sql`${events.campaignId} = ${args.campaignId}
          AND ${events.siteId} = ${args.siteId}
          AND ${events.type} = ${args.type}
          AND ${events.timestamp} >= ${cutoff}`,
    )
  return Number(rows[0]?.n ?? 0)
}

/**
 * Counts events by a single device (fingerprint) for fraud velocity checks.
 */
export async function countRecentDeviceEvents(args: {
  fingerprint: string
  type: AdEventType
  windowMs: number
}): Promise<number> {
  const cutoff = Date.now() - args.windowMs
  const rows = await turso()
    .select({ n: sql<number>`COUNT(*)` })
    .from(events)
    .where(
      sql`${events.fingerprint} = ${args.fingerprint}
          AND ${events.type} = ${args.type}
          AND ${events.timestamp} >= ${cutoff}`,
    )
  return Number(rows[0]?.n ?? 0)
}
