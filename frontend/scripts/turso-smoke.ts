/**
 * Smoke-test the Turso connection + write/read path.
 * Run with: pnpm turso:smoke
 */

import { tursoClient } from '../src/lib/turso/client'
import { trackPageview, trackSdkLog, trackAdEvent } from '../src/lib/analytics/track'
import { batchedWriter } from '../src/lib/turso/batched-writer'
import { visitorHash, sessionHash } from '../src/lib/analytics/visitor'

async function main() {
  const client = tursoClient()

  console.log('[smoke] ping...')
  const ping = await client.execute('SELECT 1 AS ok')
  console.log('[smoke] ping →', ping.rows[0])

  console.log('[smoke] schema check...')
  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
  )
  console.log('[smoke] tables →', tables.rows.map((r) => r.name))

  if (!tables.rows.some((r) => r.name === 'events')) {
    console.error('[smoke] events table missing. Run: pnpm drizzle:push')
    process.exit(1)
  }

  console.log('[smoke] writing 1 ad event (awaited)...')
  await trackAdEvent({
    type: 'IMPRESSION',
    campaignId: 'smoke-campaign',
    adId: 'smoke-ad',
    siteId: 'smoke-site',
    fingerprint: 'smoke-fp',
  })

  console.log('[smoke] buffering 3 pageviews + 2 sdk logs...')
  const visitor = visitorHash({ ip: '127.0.0.1', userAgent: 'smoke', siteId: 'smoke-site' })
  const session = sessionHash(visitor)
  for (let i = 0; i < 3; i++) {
    trackPageview({
      siteId: 'smoke-site',
      publisherId: 'smoke-pub',
      pathname: `/smoke/${i}`,
      visitorHash: visitor,
      sessionHash: session,
    })
  }
  for (let i = 0; i < 2; i++) {
    trackSdkLog({
      type: 'SDK_REQUEST',
      endpoint: '/api/smoke',
      siteId: 'smoke-site',
      responseStatus: 200,
      durationMs: 1 + i,
    })
  }

  console.log('[smoke] flushing buffer...')
  await batchedWriter().flushNow()

  console.log('[smoke] counting rows...')
  for (const t of ['events', 'pageviews', 'sdk_logs', 'task_responses'] as const) {
    const r = await client.execute(`SELECT COUNT(*) AS n FROM ${t}`)
    console.log(`[smoke]   ${t}: ${r.rows[0].n}`)
  }

  console.log('[smoke] ✅ OK')
  process.exit(0)
}

main().catch((err) => {
  console.error('[smoke] ❌', err)
  process.exit(1)
})
