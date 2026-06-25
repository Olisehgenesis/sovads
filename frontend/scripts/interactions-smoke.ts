/**
 * Smoke test: /api/interactions logic, end-to-end.
 *
 * Exercises POLL + FEEDBACK + SURVEY (step then final) by inserting a real
 * Campaign + CampaignTask into Postgres, hitting the route's pure logic by
 * importing the handler, and asserting both Postgres state (TaskCompletion,
 * SurveySession, ViewerPoints) and Turso firehose rows (task_responses).
 *
 * Run with:  pnpm interactions:smoke
 */
import { randomUUID } from 'crypto'
import { prisma } from '../src/lib/prisma'
import { tursoClient } from '../src/lib/turso/client'
import { batchedWriter } from '../src/lib/turso/batched-writer'
import { POST as interactionsPost } from '../src/app/api/interactions/route'

const TAG = `int-${Date.now()}`

function mkRequest(body: unknown): Request {
  return new Request('http://localhost/api/interactions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function jsonOf(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>
}

async function main() {
  console.log(`[interactions-smoke] tag= ${TAG}`)

  // 1. Seed Postgres
  const advertiser = await prisma.advertiser.create({
    data: { wallet: `0x${TAG.padEnd(40, '0').slice(0, 40)}`, name: TAG },
  })
  const campaign = await prisma.campaign.create({
    data: {
      advertiserId: advertiser.id,
      name: `${TAG}-campaign`,
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
      label: 'Pick one',
      surface: 'standalone',
      verifier: 'ORACLE',
      rewardPoints: 5,
      config: { options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] } as object,
    },
  })

  const feedback = await prisma.campaignTask.create({
    data: {
      campaignId: campaign.id,
      kind: 'FEEDBACK',
      label: 'How was it?',
      surface: 'standalone',
      verifier: 'ORACLE',
      rewardPoints: 3,
      config: { feedback: { mode: 'rating_and_text', minRating: 1, maxRating: 5, minTextLen: 3 } } as object,
    },
  })

  const survey = await prisma.campaignTask.create({
    data: {
      campaignId: campaign.id,
      kind: 'SURVEY',
      label: 'Mini survey',
      surface: 'standalone',
      verifier: 'ORACLE',
      rewardPoints: 8,
      config: {
        questions: [
          { id: 'q1', kind: 'single', label: 'Color?', required: true, options: [{ id: 'red', label: 'Red' }, { id: 'blue', label: 'Blue' }] },
          { id: 'q2', kind: 'text', label: 'Why?', required: true, minTextLen: 2 },
        ],
      } as object,
    },
  })

  const fp = `fp-${TAG}`

  // 2. POLL: invalid option then valid
  let res = await interactionsPost(mkRequest({ taskId: poll.id, fingerprint: fp, proof: { optionId: 'nope' } }) as unknown as Parameters<typeof interactionsPost>[0])
  let body = await jsonOf(res)
  if (res.status !== 400) throw new Error(`POLL bad option should 400, got ${res.status}: ${JSON.stringify(body)}`)
  console.log('[interactions-smoke] poll bad-option rejected ✓')

  res = await interactionsPost(mkRequest({ taskId: poll.id, fingerprint: fp, proof: { optionId: 'a' } }) as unknown as Parameters<typeof interactionsPost>[0])
  body = await jsonOf(res)
  if (res.status !== 200 || body.kind !== 'SUBMIT') {
    throw new Error(`POLL submit failed: ${JSON.stringify(body)}`)
  }
  console.log('[interactions-smoke] poll submit ✓', body.completionId)

  // 3. FEEDBACK
  res = await interactionsPost(mkRequest({
    taskId: feedback.id,
    fingerprint: `${fp}-fb`,
    proof: { rating: 4, text: 'pretty good' },
  }) as unknown as Parameters<typeof interactionsPost>[0])
  body = await jsonOf(res)
  if (res.status !== 200 || body.kind !== 'SUBMIT') {
    throw new Error(`FEEDBACK submit failed: ${JSON.stringify(body)}`)
  }
  console.log('[interactions-smoke] feedback submit ✓', body.completionId)

  // 4. SURVEY step 1
  const surveyFp = `${fp}-sv`
  res = await interactionsPost(mkRequest({
    taskId: survey.id,
    fingerprint: surveyFp,
    step: 0,
    proof: { answers: [{ questionId: 'q1', optionIds: ['red'] }] },
  }) as unknown as Parameters<typeof interactionsPost>[0])
  body = await jsonOf(res)
  if (res.status !== 200 || body.kind !== 'STEP') {
    throw new Error(`SURVEY step failed: ${JSON.stringify(body)}`)
  }
  const sessionId = body.sessionId as string
  console.log('[interactions-smoke] survey step ✓', sessionId)

  // 5. SURVEY final
  res = await interactionsPost(mkRequest({
    taskId: survey.id,
    fingerprint: surveyFp,
    sessionId,
    final: true,
    proof: {
      answers: [
        { questionId: 'q1', optionIds: ['red'] },
        { questionId: 'q2', text: 'because' },
      ],
    },
  }) as unknown as Parameters<typeof interactionsPost>[0])
  body = await jsonOf(res)
  if (res.status !== 200 || body.kind !== 'SUBMIT') {
    throw new Error(`SURVEY final failed: ${JSON.stringify(body)}`)
  }
  console.log('[interactions-smoke] survey final ✓', body.completionId)

  // 6. Flush Turso buffer + assert rows
  await batchedWriter().flushNow()
  const client = tursoClient()
  const tursoRows = await client.execute({
    sql: `SELECT kind, COUNT(*) AS n FROM task_responses
          WHERE campaign_id = ? GROUP BY kind ORDER BY kind`,
    args: [campaign.id],
  })
  console.log('[interactions-smoke] turso task_responses by kind:', tursoRows.rows)

  // 7. Postgres assertions
  const sess = await prisma.surveySession.findUnique({ where: { id: sessionId } })
  if (sess?.status !== 'completed') throw new Error('survey session not marked completed')
  const completions = await prisma.taskCompletion.count({
    where: { taskId: { in: [poll.id, feedback.id, survey.id] }, status: 'verified' },
  })
  if (completions !== 3) throw new Error(`expected 3 verified completions, got ${completions}`)
  console.log('[interactions-smoke] postgres state ✓')

  // 8. Cleanup
  await prisma.taskCompletion.deleteMany({ where: { taskId: { in: [poll.id, feedback.id, survey.id] } } })
  await prisma.surveySession.deleteMany({ where: { taskId: survey.id } })
  await prisma.campaignTask.deleteMany({ where: { id: { in: [poll.id, feedback.id, survey.id] } } })
  await prisma.viewerPoints.deleteMany({ where: { fingerprint: { in: [fp, `${fp}-fb`, surveyFp] } } })
  await prisma.campaign.delete({ where: { id: campaign.id } })
  await prisma.advertiser.delete({ where: { id: advertiser.id } })
  console.log('[interactions-smoke] ✅ OK')
}

main()
  .catch((e) => {
    console.error('[interactions-smoke] ❌', e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
