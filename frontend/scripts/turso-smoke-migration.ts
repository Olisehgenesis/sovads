/**
 * Migration smoke test:
 *  - direct lib/analytics/track entry points (events, sdk logs, callbacks)
 *  - dedup + rate-limit helpers
 *
 * Does NOT hit the HTTP routes — those require a running Next.js server.
 * Run with: pnpm turso:smoke:migration
 */

import { tursoClient } from '../src/lib/turso/client'
import { batchedWriter } from '../src/lib/turso/batched-writer'
import {
  trackAdEvent,
  trackSdkLog,
  recentlySeen,
  countRecentEvents,
} from '../src/lib/analytics/track'

// debug-logger.ts uses `import 'server-only'` which only works inside Next.js.
// For the script we exercise the same underlying writes via trackSdkLog directly.

const TAG = `mig-${Date.now()}`

async function main() {
  const client = tursoClient()

  console.log('[migration-smoke] starting tag=', TAG)

  // 1. Ad event via the route helper
  await trackAdEvent({
    type: 'CLICK',
    campaignId: `${TAG}-c`,
    adId: `${TAG}-a`,
    siteId: `${TAG}-s`,
    fingerprint: `${TAG}-fp`,
  })
  console.log('[migration-smoke] ad event ✓')

  // 2. Dedup helper
  const dup = await recentlySeen({
    fingerprint: `${TAG}-fp`,
    campaignId: `${TAG}-c`,
    type: 'CLICK',
    windowMs: 60_000,
  })
  if (!dup) throw new Error('recentlySeen should report duplicate')
  console.log('[migration-smoke] recentlySeen ✓')

  // 3. Rate-limit helper
  const n = await countRecentEvents({
    campaignId: `${TAG}-c`,
    siteId: `${TAG}-s`,
    type: 'CLICK',
    windowMs: 60_000,
  })
  if (n < 1) throw new Error(`countRecentEvents should be >=1, got ${n}`)
  console.log('[migration-smoke] countRecentEvents ✓', n)

  // 4. SDK loggers (buffered → flush) — via trackSdkLog (debug-logger wraps this)
  trackSdkLog({
    type: 'SDK_REQUEST',
    endpoint: '/api/ads',
    method: 'GET',
    siteId: `${TAG}-s`,
    responseStatus: 200,
    durationMs: 12,
    payload: { subtype: 'AD_REQUEST' },
  })
  trackSdkLog({
    type: 'SDK_INTERACTION',
    endpoint: null,
    siteId: `${TAG}-s`,
    payload: { subtype: 'AD_LOADED', adId: `${TAG}-a`, campaignId: `${TAG}-c` },
  })
  trackSdkLog({
    type: 'API_CALL',
    endpoint: `/api/test/${TAG}`,
    method: 'POST',
    responseStatus: 200,
    durationMs: 5,
  })
  trackSdkLog({
    type: 'CALLBACK',
    endpoint: '/api/cta-postback',
    payload: { subtype: 'CTA_POSTBACK', body: { taskId: `${TAG}-t`, ok: true } },
    responseStatus: 200,
  })

  await batchedWriter().flushNow()
  console.log('[migration-smoke] log writes ✓')

  // 5. Count what we just wrote
  const rows = await client.execute({
    sql: `SELECT type, COUNT(*) AS n FROM sdk_logs
          WHERE (endpoint LIKE ? OR endpoint LIKE ? OR endpoint = ?)
            AND timestamp > ?
          GROUP BY type`,
    args: [`%${TAG}%`, '/api/cta-postback', '/api/ads', Date.now() - 60_000],
  })
  console.log('[migration-smoke] sdk_logs by type:', rows.rows)

  console.log('[migration-smoke] ✅ OK')
  process.exit(0)
}

main().catch((err) => {
  console.error('[migration-smoke] ❌', err)
  process.exit(1)
})
