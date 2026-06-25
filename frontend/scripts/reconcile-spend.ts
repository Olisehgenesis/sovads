/**
 * Reconcile Campaign + CampaignTask spend counters against source-of-truth events.
 *
 * Why this exists:
 *   `Campaign.spent` and `CampaignTask.spentGs` are append-only counters that get
 *   bumped at click time / claim-signing time. If a counter drifts (bug, partial
 *   write, manual DB edit, replay), the dashboard shows wrong numbers and the
 *   unified-budget cap stops working.
 *
 * Source of truth:
 *   - Clicks: Event rows with type='CLICK' for the campaign.
 *     clickCost = count(CLICK events) * campaign.cpc
 *   - Impressions: Event rows with type='IMPRESSION' for the campaign.
 *     impressionCost = count(IMPRESSION events) * impressionCostInToken(now)
 *     (uses CURRENT token price; historical impressions may have been billed
 *     at a different rate, so small drift is expected if token price moved.)
 *   - truthCampaignSpend = clickCost + impressionCost
 *   - CTAs: TaskCompletion rows with claimRef NOT NULL (= a signed claim was
 *     issued for this completion). truthSpentGs = Σ(rewardGs).
 *
 * Usage:
 *   pnpm tsx scripts/reconcile-spend.ts                # dry-run, all campaigns
 *   pnpm tsx scripts/reconcile-spend.ts --campaign=ID  # one campaign
 *   pnpm tsx scripts/reconcile-spend.ts --fix          # apply fixes
 *   pnpm tsx scripts/reconcile-spend.ts --fix --only=ctas
 *   pnpm tsx scripts/reconcile-spend.ts --fix --only=clicks
 *
 * Via package.json: `pnpm db:reconcile` (dry) / `pnpm db:reconcile:fix`.
 */

import { PrismaClient } from '@prisma/client'
import { getImpressionCostInToken } from '../src/lib/impression-pricing'

const prisma = new PrismaClient()

type Args = {
  fix: boolean
  campaignId: string | null
  only: 'clicks' | 'ctas' | 'both'
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const get = (flag: string) => {
    const m = argv.find((a) => a.startsWith(flag + '='))
    return m ? m.slice(flag.length + 1) : null
  }
  const onlyRaw = get('--only')
  const only: Args['only'] =
    onlyRaw === 'clicks' || onlyRaw === 'ctas' ? onlyRaw : 'both'
  return {
    fix: argv.includes('--fix'),
    campaignId: get('--campaign'),
    only,
  }
}

function fmt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 })
}

function rowDelta(label: string, stored: number, truth: number) {
  const delta = truth - stored
  const tag =
    Math.abs(delta) < 1e-9 ? 'OK  ' : delta > 0 ? 'LOW ' : 'HIGH'
  return `    ${tag} ${label.padEnd(14)} stored=${fmt(stored).padStart(14)}   truth=${fmt(truth).padStart(14)}   Δ=${fmt(delta)}`
}

async function main() {
  const args = parseArgs()
  console.log(
    `Reconcile spend  —  ${args.fix ? 'APPLY' : 'DRY-RUN'}  (only=${args.only}${args.campaignId ? `, campaign=${args.campaignId}` : ''})\n`,
  )

  const campaigns = await prisma.campaign.findMany({
    where: args.campaignId ? { id: args.campaignId } : {},
    select: {
      id: true,
      name: true,
      cpc: true,
      budget: true,
      spent: true,
      tokenAddress: true,
      tasks: {
        select: {
          id: true,
          label: true,
          rewardGs: true,
          spentGs: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  if (campaigns.length === 0) {
    console.log('No campaigns matched.')
    return
  }

  let totalDriftClicks = 0
  let totalDriftCtas = 0
  let updates = 0

  for (const c of campaigns) {
    console.log(`\n■ ${c.name}  [${c.id}]`)
    console.log(`    budget=${fmt(c.budget)}   cpc=${fmt(c.cpc)}   token=${c.tokenAddress ?? '(none)'}`)

    // ── Clicks + Impressions ─────────────────────────────────────────────
    const [clickCount, impressionCount, impressionCost] = await Promise.all([
      prisma.event.count({ where: { campaignId: c.id, type: 'CLICK' } }),
      prisma.event.count({ where: { campaignId: c.id, type: 'IMPRESSION' } }),
      getImpressionCostInToken(c.tokenAddress),
    ])
    const truthClickSpend = clickCount * c.cpc
    const truthImpressionSpend = impressionCount * impressionCost
    const truthCampaignSpend = truthClickSpend + truthImpressionSpend
    console.log(`    clicks=${clickCount} @ ${fmt(c.cpc)} = ${fmt(truthClickSpend)}`)
    console.log(`    impressions=${impressionCount} @ ${fmt(impressionCost)} = ${fmt(truthImpressionSpend)}  (current rate)`)
    console.log(rowDelta('Campaign.spent', c.spent, truthCampaignSpend))
    totalDriftClicks += Math.abs(truthCampaignSpend - c.spent)

    if (args.fix && args.only !== 'ctas' && Math.abs(truthCampaignSpend - c.spent) > 1e-9) {
      await prisma.campaign.update({
        where: { id: c.id },
        data: { spent: truthCampaignSpend },
      })
      console.log(`    ✓ updated Campaign.spent → ${fmt(truthCampaignSpend)}`)
      updates++
    }

    // ── CTAs ──────────────────────────────────────────────────────────────
    if (c.tasks.length === 0) {
      console.log('    (no CTA tasks)')
      continue
    }

    // For each task: sum rewardGs across completions that have a signed claim.
    // We use claimRef NOT NULL as the signal that spentGs was supposed to bump.
    const taskIds = c.tasks.map((t) => t.id)
    const signed = await prisma.taskCompletion.groupBy({
      by: ['taskId'],
      where: { taskId: { in: taskIds }, claimRef: { not: null } },
      _sum: { rewardGs: true },
      _count: { _all: true },
    })
    const signedByTask = new Map<string, { sum: number; count: number }>()
    for (const r of signed) {
      signedByTask.set(r.taskId, {
        sum: r._sum.rewardGs ?? 0,
        count: r._count._all,
      })
    }

    let campaignCtaStored = 0
    let campaignCtaTruth = 0
    for (const t of c.tasks) {
      const s = signedByTask.get(t.id) ?? { sum: 0, count: 0 }
      campaignCtaStored += t.spentGs
      campaignCtaTruth += s.sum
      console.log(`    • ${t.label}  [${t.id}]  rewardGs=${fmt(t.rewardGs ?? 0)}  signedClaims=${s.count}`)
      console.log(rowDelta('task.spentGs', t.spentGs, s.sum))

      if (args.fix && args.only !== 'clicks' && Math.abs(s.sum - t.spentGs) > 1e-9) {
        await prisma.campaignTask.update({
          where: { id: t.id },
          data: { spentGs: s.sum },
        })
        console.log(`      ✓ updated task.spentGs → ${fmt(s.sum)}`)
        updates++
      }
    }

    totalDriftCtas += Math.abs(campaignCtaTruth - campaignCtaStored)
    const totalStored = c.spent + campaignCtaStored
    const totalTruth = truthCampaignSpend + campaignCtaTruth
    console.log(
      `    ────  unified totalSpent  stored=${fmt(totalStored)}   truth=${fmt(totalTruth)}   budget=${fmt(c.budget)}   ${totalTruth >= c.budget ? '⚠ OVER BUDGET' : ''}`,
    )
  }

  console.log(
    `\nSummary — campaigns=${campaigns.length}  driftClicks=${fmt(totalDriftClicks)}  driftCtas=${fmt(totalDriftCtas)}  ${args.fix ? `updates=${updates}` : '(re-run with --fix to apply)'}`,
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
