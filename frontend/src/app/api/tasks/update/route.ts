import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { MIN_CTA_REWARD_GS } from '@/lib/campaign-limits'

/**
 * PUT /api/tasks/update
 *
 * Owner-authed mutation of a CTA's display + reward parameters. Lets the
 * advertiser bump rewards or tighten per-wallet caps on a live campaign
 * without recreating the task.
 *
 * Body: {
 *   wallet, taskId,
 *   updates: {
 *     label?, description?,
 *     rewardPoints?, rewardGs?,
 *     maxPerWallet?, cooldownSecs?,
 *     active?,
 *   }
 * }
 *
 * Notes:
 *  - We intentionally do NOT allow changing `kind`, `verifier`, `config`,
 *    or `verificationPlan` here \u2014 those are semantically the task and
 *    should go through the create + delete flow if they need to change.
 *  - Numeric fields must be finite and non-negative. Rewards bump
 *    immediately; viewers who already completed the task earned the old
 *    amount and aren't re-paid.
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { wallet, taskId, updates } = body as {
      wallet?: string
      taskId?: string
      updates?: Record<string, unknown>
    }

    if (!wallet || !taskId || !updates) {
      return NextResponse.json({ error: 'wallet, taskId, and updates are required' }, { status: 400 })
    }

    const task = await prisma.campaignTask.findUnique({
      where: { id: taskId },
      include: { campaign: { include: { advertiser: true } } },
    })
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    const ownerWallet = task.campaign?.advertiser?.wallet
    if (!ownerWallet || ownerWallet.toLowerCase() !== wallet.toLowerCase()) {
      return NextResponse.json({ error: 'Not campaign owner' }, { status: 403 })
    }

    const patch: Record<string, unknown> = {}

    if (typeof updates.label === 'string') {
      const v = updates.label.trim()
      if (!v) return NextResponse.json({ error: 'Label cannot be empty.' }, { status: 400 })
      patch.label = v
    }
    if (typeof updates.description === 'string') patch.description = updates.description.trim()
    if (typeof updates.active === 'boolean') patch.active = updates.active

    const positiveNumber = (key: 'rewardPoints' | 'rewardGs' | 'maxPerWallet' | 'cooldownSecs', allowFloat: boolean) => {
      if (updates[key] === undefined) return null
      const raw = updates[key]
      if (raw === null || raw === '') {
        // Treat null/'' as "clear" \u2014 only rewardGs is nullable in the schema.
        return key === 'rewardGs' ? { value: null } : { error: `${key} cannot be cleared.` }
      }
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0) {
        return { error: `${key} must be a non-negative number.` }
      }
      if (!allowFloat && !Number.isInteger(n)) {
        return { error: `${key} must be a whole number.` }
      }
      return { value: n }
    }

    for (const [key, allowFloat] of [
      ['rewardPoints', true],
      ['rewardGs', true],
      ['maxPerWallet', false],
      ['cooldownSecs', false],
    ] as const) {
      const res = positiveNumber(key, allowFloat)
      if (!res) continue
      if ('error' in res) return NextResponse.json({ error: res.error }, { status: 400 })
      patch[key] = res.value
    }

    // CTA reward floor — if the advertiser is paying G$, the amount must
    // clear the network minimum. 0 / null means "SovPoints only" and is
    // always allowed.
    const finalRewardGs = patch.rewardGs !== undefined ? patch.rewardGs : task.rewardGs
    if (
      typeof finalRewardGs === 'number' &&
      finalRewardGs > 0 &&
      finalRewardGs < MIN_CTA_REWARD_GS
    ) {
      return NextResponse.json(
        { error: `Minimum G$ reward per CTA completion is ${MIN_CTA_REWARD_GS} G$.` },
        { status: 400 }
      )
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No editable fields supplied.' }, { status: 400 })
    }

    const updated = await prisma.campaignTask.update({
      where: { id: taskId },
      data: patch,
    })

    return NextResponse.json({
      success: true,
      task: {
        id: updated.id,
        kind: updated.kind,
        label: updated.label,
        description: updated.description ?? null,
        verifier: updated.verifier,
        rewardPoints: updated.rewardPoints,
        rewardGs: updated.rewardGs,
        budgetGs: updated.budgetGs,
        maxPerWallet: updated.maxPerWallet,
        cooldownSecs: updated.cooldownSecs,
        active: updated.active,
        startDate: updated.startDate ? updated.startDate.toISOString() : null,
        endDate: updated.endDate ? updated.endDate.toISOString() : null,
      },
    })
  } catch (error) {
    console.error('Update task error:', error)
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 })
  }
}
