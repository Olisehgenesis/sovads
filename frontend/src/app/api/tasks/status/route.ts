/**
 * GET /api/tasks/status
 *
 * Query params (one of):
 *   - taskId        → return that single task + viewer eligibility
 *   - campaignId    → return all active tasks for the campaign + viewer eligibility per task
 *
 * Optional:
 *   - wallet
 *   - fingerprint
 *
 * Response (per task):
 *   {
 *     id, kind, label, description, verifier, rewardPoints, rewardGs, config,
 *     budget: { totalGs, spentGs, remainingGs },
 *     eligibility: {
 *       eligible: boolean,
 *       reason?: string,
 *       completionsUsed: number,
 *       maxPerWallet: number,
 *       cooldownSecs: number,
 *       retryAfterSec?: number,
 *     },
 *     completions: [ { id, status, createdAt, payoutTxHash, claimRef, rewardPoints, rewardGs } ]
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

type TaskRow = Awaited<ReturnType<typeof prisma.campaignTask.findMany>>[number]
type CompletionRow = Awaited<ReturnType<typeof prisma.taskCompletion.findMany>>[number]

function safeConfig(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function shapeTask(task: TaskRow, completions: CompletionRow[]) {
  const active = completions.filter((c) => ['verified', 'paid', 'pending'].includes(c.status))
  const sortedActive = [...active].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  )
  const completionsUsed = active.length

  let eligible = task.active
  let reason: string | undefined
  let retryAfterSec: number | undefined

  if (!task.active) {
    reason = 'inactive'
  } else {
    const now = Date.now()
    if (task.startDate && task.startDate.getTime() > now) {
      eligible = false
      reason = 'not_started'
    } else if (task.endDate && task.endDate.getTime() < now) {
      eligible = false
      reason = 'ended'
    } else if (completionsUsed >= task.maxPerWallet) {
      eligible = false
      reason = 'max_reached'
    } else if (task.cooldownSecs > 0 && sortedActive[0]) {
      const elapsed = (now - sortedActive[0].createdAt.getTime()) / 1000
      if (elapsed < task.cooldownSecs) {
        eligible = false
        reason = 'cooldown'
        retryAfterSec = Math.ceil(task.cooldownSecs - elapsed)
      }
    } else if (
      task.budgetGs != null &&
      task.rewardGs != null &&
      task.rewardGs > 0 &&
      task.budgetGs - task.spentGs < task.rewardGs
    ) {
      eligible = false
      reason = 'budget_depleted'
    }
  }

  return {
    id: task.id,
    campaignId: task.campaignId,
    kind: task.kind,
    label: task.label,
    description: task.description,
    verifier: task.verifier,
    rewardPoints: task.rewardPoints,
    rewardGs: task.rewardGs,
    config: safeConfig(task.config),
    budget: {
      totalGs: task.budgetGs,
      spentGs: task.spentGs,
      remainingGs: task.budgetGs == null ? null : Math.max(task.budgetGs - task.spentGs, 0),
    },
    schedule: {
      startDate: task.startDate,
      endDate: task.endDate,
    },
    eligibility: {
      eligible,
      reason,
      completionsUsed,
      maxPerWallet: task.maxPerWallet,
      cooldownSecs: task.cooldownSecs,
      retryAfterSec,
    },
    completions: completions
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10)
      .map((c) => ({
        id: c.id,
        status: c.status,
        createdAt: c.createdAt,
        verifiedAt: c.verifiedAt,
        paidAt: c.paidAt,
        rewardPoints: c.rewardPoints,
        rewardGs: c.rewardGs,
        claimRef: c.claimRef,
        payoutTxHash: c.payoutTxHash,
        error: c.error,
      })),
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const taskId = searchParams.get('taskId') || undefined
    const campaignId = searchParams.get('campaignId') || undefined
    const wallet = searchParams.get('wallet')?.toLowerCase() || null
    const fingerprint = searchParams.get('fingerprint') || null

    if (!taskId && !campaignId) {
      return NextResponse.json(
        { error: 'taskId or campaignId required' },
        { status: 400, headers: corsHeaders }
      )
    }
    if (wallet && !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
      return NextResponse.json({ error: 'invalid wallet' }, { status: 400, headers: corsHeaders })
    }

    const tasks = taskId
      ? await prisma.campaignTask.findMany({ where: { id: taskId } })
      : await prisma.campaignTask.findMany({
          where: { campaignId: campaignId!, active: true },
          orderBy: { createdAt: 'asc' },
        })

    if (tasks.length === 0) {
      return NextResponse.json({ tasks: [] }, { headers: corsHeaders })
    }

    // Pull this viewer's completions for the relevant tasks (if any identity given)
    const identityFilter =
      wallet || fingerprint
        ? {
            taskId: { in: tasks.map((t) => t.id) },
            OR: [
              ...(wallet ? [{ wallet }] : []),
              ...(fingerprint ? [{ fingerprint }] : []),
            ],
          }
        : null

    const completions = identityFilter
      ? await prisma.taskCompletion.findMany({ where: identityFilter })
      : []

    const byTask = new Map<string, CompletionRow[]>()
    for (const c of completions) {
      const arr = byTask.get(c.taskId) || []
      arr.push(c)
      byTask.set(c.taskId, arr)
    }

    const shaped = tasks.map((t) => shapeTask(t, byTask.get(t.id) || []))

    if (taskId) {
      return NextResponse.json({ task: shaped[0] }, { headers: corsHeaders })
    }
    return NextResponse.json({ tasks: shaped }, { headers: corsHeaders })
  } catch (error) {
    console.error('tasks/status GET error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500, headers: corsHeaders }
    )
  }
}
