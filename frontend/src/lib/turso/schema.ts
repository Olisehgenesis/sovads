/**
 * Drizzle schema for the Turso firehose DB.
 *
 * Design rules:
 *  - All tables are append-only. No updates after insert.
 *  - No foreign keys to Postgres ids. Postgres ids are stored as raw text.
 *  - Denormalize aggressively (campaign_id, site_id, verified_human, etc.)
 *    so dashboard queries never need to hit Postgres.
 *  - Timestamps are unix-ms integers, not ISO strings — cheaper to range-scan.
 *  - JSON payloads are stored as text and queried via json_extract on read.
 *
 * Adding a new event type: prefer adding a new table over overloading `events`.
 * Tables are cheap on SQLite.
 */

import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

// ─── Ad serving events (impressions + clicks) ──────────────────────────────
export const events = sqliteTable(
  'events',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(), // IMPRESSION | CLICK | DISMISS
    campaignId: text('campaign_id').notNull(),
    adId: text('ad_id').notNull(),
    publisherId: text('publisher_id'),
    siteId: text('site_id'),
    fingerprint: text('fingerprint'),
    wallet: text('wallet'),
    verifiedHuman: integer('verified_human', { mode: 'boolean' })
      .notNull()
      .default(false),
    ipHash: text('ip_hash'),
    country: text('country'),
    userAgent: text('user_agent'),
    trackingToken: text('tracking_token'),
    pageUrl: text('page_url'),
    timestamp: integer('timestamp')
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    byCampaignTime: index('events_campaign_time_idx').on(t.campaignId, t.timestamp),
    bySiteTime: index('events_site_time_idx').on(t.siteId, t.timestamp),
    byDedup: index('events_dedup_idx').on(t.fingerprint, t.campaignId, t.type, t.timestamp),
  }),
)

// ─── Interactive ad responses (poll votes, survey answers, feedback) ───────
export const taskResponses = sqliteTable(
  'task_responses',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id').notNull(),
    /** Links to Postgres TaskCompletion.id (raw string, not a FK). */
    completionId: text('completion_id'),
    campaignId: text('campaign_id').notNull(),
    siteId: text('site_id'),
    viewerId: text('viewer_id').notNull(),
    fingerprint: text('fingerprint').notNull(),
    wallet: text('wallet'),
    verifiedHuman: integer('verified_human', { mode: 'boolean' })
      .notNull()
      .default(false),
    kind: text('kind').notNull(), // VOTE | ANSWER | TEXT | SUBMIT | STEP | DISMISS
    payloadJson: text('payload_json').notNull(),
    timestamp: integer('timestamp')
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    byTaskKindTime: index('task_responses_task_kind_time_idx').on(t.taskId, t.kind, t.timestamp),
    byWalletTask: index('task_responses_wallet_task_idx').on(t.wallet, t.taskId),
    byFingerprintTask: index('task_responses_fingerprint_task_idx').on(t.fingerprint, t.taskId),
  }),
)

// ─── Website analytics (Plausible-style, no cookies) ───────────────────────
export const pageviews = sqliteTable(
  'pageviews',
  {
    id: text('id').primaryKey(),
    siteId: text('site_id').notNull(),
    publisherId: text('publisher_id').notNull(),
    pathname: text('pathname').notNull(),
    referrer: text('referrer'),
    utmSource: text('utm_source'),
    utmMedium: text('utm_medium'),
    utmCampaign: text('utm_campaign'),
    device: text('device'), // desktop | mobile | tablet
    browser: text('browser'),
    os: text('os'),
    country: text('country'),
    /** sha256(daily_salt + ip + ua + site_id) — privacy-safe visitor identity. */
    visitorHash: text('visitor_hash').notNull(),
    sessionHash: text('session_hash').notNull(),
    timestamp: integer('timestamp')
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    bySiteTime: index('pageviews_site_time_idx').on(t.siteId, t.timestamp),
    byVisitorSite: index('pageviews_visitor_site_idx').on(t.visitorHash, t.siteId, t.timestamp),
  }),
)

// ─── SDK + API + callback logs (everything that used to be Postgres logs) ──
export const sdkLogs = sqliteTable(
  'sdk_logs',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(), // SDK_REQUEST | SDK_INTERACTION | API_CALL | CALLBACK
    endpoint: text('endpoint'),
    method: text('method'),
    siteId: text('site_id'),
    domain: text('domain'),
    pageUrl: text('page_url'),
    fingerprint: text('fingerprint'),
    payloadJson: text('payload_json'),
    responseStatus: integer('response_status'),
    durationMs: integer('duration_ms'),
    errorText: text('error_text'),
    timestamp: integer('timestamp')
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    byTypeTime: index('sdk_logs_type_time_idx').on(t.type, t.timestamp),
  }),
)
