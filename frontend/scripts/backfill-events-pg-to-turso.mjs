/**
 * Backfill historical Postgres `events` rows into Turso `events`.
 *
 * One-shot script. Idempotent — uses INSERT OR IGNORE keyed on Turso id.
 *
 * Postgres → Turso column map:
 *   id             → id            (preserved)
 *   type           → type
 *   campaignId     → campaign_id
 *   publisherId    → publisher_id
 *   siteId         → site_id       (fallback: publisherSiteId)
 *   adId           → ad_id
 *   fingerprint    → fingerprint
 *   viewerWallet   → wallet
 *   verified       → verified_human
 *   userAgent      → user_agent
 *   ipAddress      → ip_hash       (SKIPPED — raw IPs, leave NULL to avoid PII leak)
 *   timestamp      → timestamp     (Date → unix ms)
 *
 * Usage (from frontend/):
 *   set -a; source .env; set +a; node scripts/backfill-events-pg-to-turso.mjs
 */

import { neon } from '@neondatabase/serverless'
import { createClient } from '@libsql/client'

const PG_URL = process.env.DATABASE_URL
const TURSO_URL = process.env.TURSO_URL
const TURSO_TOKEN = process.env.TURSO_TOKEN
const BATCH = 50

if (!PG_URL) throw new Error('DATABASE_URL missing')
if (!TURSO_URL || !TURSO_TOKEN) throw new Error('TURSO_URL / TURSO_TOKEN missing')

const sql = neon(PG_URL)
const turso = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN })

console.log('[backfill] connecting…')

// 1. Count sources
const pgCountRes = await sql`SELECT COUNT(*)::int AS n FROM events`
const pgCount = pgCountRes[0].n
const tursoCountRes = await turso.execute('SELECT COUNT(*) AS n FROM events')
const tursoCount = Number(tursoCountRes.rows[0].n)
console.log(`[backfill] postgres events: ${pgCount}, turso events: ${tursoCount}`)

// 2. Pull all Postgres rows
const rows = await sql`
  SELECT id, type, "campaignId", "publisherId", "siteId", "publisherSiteId",
         "adId", "ipAddress", "userAgent", timestamp, fingerprint,
         "viewerWallet", verified
  FROM events
  ORDER BY timestamp ASC
`
console.log(`[backfill] fetched ${rows.length} rows from postgres`)

// 3. Chunk-insert into Turso with INSERT OR IGNORE
const insertSql = `INSERT OR IGNORE INTO events
  (id, type, campaign_id, ad_id, publisher_id, site_id,
   fingerprint, wallet, verified_human,
   ip_hash, country, user_agent, tracking_token, page_url, timestamp)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

let inserted = 0
let skipped = 0
let batchIndex = 0

for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH)
  const statements = chunk.map((r) => ({
    sql: insertSql,
    args: [
      r.id,
      r.type,
      r.campaignId,
      r.adId,
      r.publisherId,
      r.siteId ?? r.publisherSiteId ?? null,
      r.fingerprint ?? null,
      r.viewerWallet ?? null,
      r.verified ? 1 : 0,
      null, // ip_hash — raw IPs left behind, don't backfill PII
      null, // country
      r.userAgent ?? null,
      null, // tracking_token — historic rows didn't sign
      null, // page_url
      new Date(r.timestamp).getTime(),
    ],
  }))

  const res = await turso.batch(statements, 'write')
  const rowsInserted = res.reduce((acc, r) => acc + Number(r.rowsAffected ?? 0), 0)
  inserted += rowsInserted
  skipped += chunk.length - rowsInserted
  batchIndex++
  console.log(
    `[backfill] batch ${batchIndex}: +${rowsInserted} inserted, ${
      chunk.length - rowsInserted
    } skipped (already present) — running total ${inserted}/${rows.length}`
  )
}

// 4. Verify
const finalCountRes = await turso.execute('SELECT COUNT(*) AS n FROM events')
const finalCount = Number(finalCountRes.rows[0].n)
const finalImpRes = await turso.execute("SELECT COUNT(*) AS n FROM events WHERE UPPER(type)='IMPRESSION'")
const finalClkRes = await turso.execute("SELECT COUNT(*) AS n FROM events WHERE UPPER(type)='CLICK'")
console.log('\n[backfill] done.')
console.log(`  inserted:      ${inserted}`)
console.log(`  skipped:       ${skipped}`)
console.log(`  turso before:  ${tursoCount}`)
console.log(`  turso after:   ${finalCount}`)
console.log(`  impressions:   ${Number(finalImpRes.rows[0].n)}`)
console.log(`  clicks:        ${Number(finalClkRes.rows[0].n)}`)

process.exit(0)
