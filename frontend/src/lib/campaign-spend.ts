/**
 * Helpers for the unified-budget billing model.
 *
 * Background:
 *   Historically `Campaign.spent` only tracked CPC charges from CLICK events.
 *   CTA completions paid out via `CampaignTask.spentGs` were a separate pool
 *   and never counted against `Campaign.budget`. That meant a campaign could
 *   serve indefinitely past its funded budget once any CTA traffic kicked in.
 *
 *   `Campaign.spent` now also includes per-IMPRESSION charges (see
 *   `lib/impression-pricing.ts`); reconciliation script enforces this.
 *
 * Unified model:
 *   effectiveSpent = Campaign.spent + Σ(CampaignTask.spentGs for this campaign)
 *                  = (clicks × cpc) + (impressions × impressionCost) + CTAs
 *   A campaign is "out of budget" when `effectiveSpent >= Campaign.budget`.
 */

import { prisma } from '@/lib/prisma'

/** Sum of `spentGs` across all tasks belonging to one campaign. */
export async function getCtaSpendForCampaign(campaignId: string): Promise<number> {
  const agg = await prisma.campaignTask.aggregate({
    where: { campaignId },
    _sum: { spentGs: true },
  })
  return agg._sum.spentGs ?? 0
}

/** Bulk version: map of campaignId → total CTA spend. */
export async function getCtaSpendByCampaignIds(
  campaignIds: string[]
): Promise<Map<string, number>> {
  if (campaignIds.length === 0) return new Map()
  const rows = await prisma.campaignTask.groupBy({
    by: ['campaignId'],
    where: { campaignId: { in: campaignIds } },
    _sum: { spentGs: true },
  })
  const map = new Map<string, number>()
  for (const r of rows) {
    map.set(r.campaignId, r._sum.spentGs ?? 0)
  }
  return map
}

/** Combine click spend + CTA spend into an effective total. */
export function combineSpend(clickSpent: number, ctaSpent: number) {
  const click = Number.isFinite(clickSpent) ? clickSpent : 0
  const cta = Number.isFinite(ctaSpent) ? ctaSpent : 0
  return {
    clickSpent: click,
    ctaSpent: cta,
    totalSpent: click + cta,
  }
}

/** True if the campaign has remaining budget for additional spend. */
export function hasRemainingBudget(budget: number, totalSpent: number, extra = 0) {
  if (!Number.isFinite(budget)) return true
  return budget > totalSpent + extra
}
