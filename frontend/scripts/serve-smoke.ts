/**
 * Smoke test: /api/serve type-aware unit serving.
 *
 * Seeds a campaign with a banner, a POLL task, and a SURVEY task. Hits the
 * route handler with various `kind` filters and asserts the correct shape
 * is returned.
 *
 * Run with:  pnpm serve:smoke
 */
import { prisma } from '../src/lib/prisma'
import { GET as serveGet } from '../src/app/api/serve/route'

const TAG = `srv-${Date.now()}`

function mkReq(qs: Record<string, string>) {
  const params = new URLSearchParams(qs)
  return new Request(`http://localhost/api/serve?${params.toString()}`, { method: 'GET' })
}

async function jsonOf(res: Response) {
  return (await res.json()) as Record<string, unknown>
}

async function main() {
  console.log(`[serve-smoke] tag= ${TAG}`)

  const advertiser = await prisma.advertiser.create({
    data: { wallet: `0x${TAG.padEnd(40, '0').slice(0, 40)}`, name: TAG },
  })
  const campaign = await prisma.campaign.create({
    data: {
      advertiserId: advertiser.id,
      name: `${TAG}-camp`,
      bannerUrl: 'https://example.com/banner.png',
      targetUrl: 'https://example.com/landing',
      budget: 1000,
      cpc: 1,
      active: true,
      status: 'approved',
    },
  })
  const poll = await prisma.campaignTask.create({
    data: {
      campaignId: campaign.id,
      kind: 'POLL',
      label: 'Pick',
      surface: 'standalone',
      verifier: 'ORACLE',
      rewardPoints: 2,
      config: { options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] } as object,
    },
  })
  const survey = await prisma.campaignTask.create({
    data: {
      campaignId: campaign.id,
      kind: 'SURVEY',
      label: 'Mini',
      surface: 'standalone',
      verifier: 'ORACLE',
      rewardPoints: 4,
      config: {
        questions: [
          { id: 'q1', kind: 'single', label: 'Color?', required: true, options: [{ id: 'r', label: 'Red' }] },
        ],
      } as object,
    },
  })

  const siteId = `temp_${TAG}` // bypasses publisher lookup

  // 1. Default → BANNER
  let res = await serveGet(mkReq({ siteId }) as unknown as Parameters<typeof serveGet>[0])
  let body = await jsonOf(res)
  if (body.kind !== 'BANNER') throw new Error(`default expected BANNER, got ${JSON.stringify(body)}`)
  console.log('[serve-smoke] default → BANNER ✓')

  // 2. kind=POLL → must be POLL
  res = await serveGet(mkReq({ siteId, kind: 'POLL' }) as unknown as Parameters<typeof serveGet>[0])
  body = await jsonOf(res)
  if (body.kind !== 'POLL') throw new Error(`POLL expected, got ${JSON.stringify(body)}`)
  const pollTask = body.task as Record<string, unknown>
  if (pollTask.id !== poll.id) throw new Error('wrong poll returned')
  if (!Array.isArray(pollTask.options)) throw new Error('poll missing options')
  console.log('[serve-smoke] kind=POLL → POLL ✓')

  // 3. kind=SURVEY → SURVEY w/ totalSteps
  res = await serveGet(mkReq({ siteId, kind: 'SURVEY' }) as unknown as Parameters<typeof serveGet>[0])
  body = await jsonOf(res)
  if (body.kind !== 'SURVEY') throw new Error(`SURVEY expected, got ${JSON.stringify(body)}`)
  const surveyTask = body.task as Record<string, unknown>
  if (surveyTask.totalSteps !== 1) throw new Error(`totalSteps=1 expected, got ${surveyTask.totalSteps}`)
  console.log('[serve-smoke] kind=SURVEY → SURVEY ✓')

  // 4. kind=BANNER,POLL → one of {BANNER, POLL}
  res = await serveGet(mkReq({ siteId, kind: 'BANNER,POLL' }) as unknown as Parameters<typeof serveGet>[0])
  body = await jsonOf(res)
  if (body.kind !== 'BANNER' && body.kind !== 'POLL') {
    throw new Error(`union expected BANNER|POLL, got ${body.kind}`)
  }
  console.log('[serve-smoke] kind=BANNER,POLL → ', body.kind, '✓')

  // 5. kind=FEEDBACK (none seeded) → NONE
  res = await serveGet(mkReq({ siteId, kind: 'FEEDBACK' }) as unknown as Parameters<typeof serveGet>[0])
  body = await jsonOf(res)
  if (body.kind !== 'NONE') throw new Error(`expected NONE, got ${JSON.stringify(body)}`)
  console.log('[serve-smoke] kind=FEEDBACK (empty) → NONE ✓')

  // 6. Inactive parent campaign → NONE for tasks
  await prisma.campaign.update({ where: { id: campaign.id }, data: { active: false } })
  res = await serveGet(mkReq({ siteId, kind: 'POLL' }) as unknown as Parameters<typeof serveGet>[0])
  body = await jsonOf(res)
  if (body.kind !== 'NONE') throw new Error(`inactive parent: expected NONE, got ${JSON.stringify(body)}`)
  console.log('[serve-smoke] inactive parent → NONE ✓')

  // Cleanup
  await prisma.campaignTask.deleteMany({ where: { id: { in: [poll.id, survey.id] } } })
  await prisma.campaign.delete({ where: { id: campaign.id } })
  await prisma.advertiser.delete({ where: { id: advertiser.id } })
  console.log('[serve-smoke] ✅ OK')
}

main()
  .catch((e) => {
    console.error('[serve-smoke] ❌', e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
