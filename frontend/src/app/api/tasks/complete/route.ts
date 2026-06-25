/**
 * POST   /api/tasks/complete   — viewer submits proof for a CTA task.
 *   Body: {
 *     taskId:      string,
 *     wallet?:     string,
 *     fingerprint: string,
 *     proof?: { txHash?, signature?, message?, answer?, dwellMs? }
 *   }
 *   Returns: { success, completionId, awarded:{points,gs}, transaction?:{...} }
 *
 * PATCH  /api/tasks/complete   — viewer reports the signed G$ claim was submitted on-chain.
 *   Body: { completionId: string, txHash: string }
 *
 * Design notes:
 *   - Verifier-driven (see lib/tasks.ts): ORACLE | SELF_SIGNED | STAKE_PROOF | ONCHAIN_EVENT
 *   - Per-wallet limit + cooldown enforced in DB
 *   - Optional rewardGs is paid via the same signed-claim flow used by ViewerCashout,
 *     so the user submits the tx themselves (no admin gas spend).
 */

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { parseUnits } from 'viem'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  findOrCreateViewer,
  verifyProof,
  type TaskKind,
  type TaskVerifier,
  type TaskConfig,
  type SubmittedProof,
} from '@/lib/tasks'
import {
  signClaim,
  generateClaimRef,
  isOperatorWhitelisted,
  isClaimRefUsed,
  getContractBalance,
} from '@/lib/streaming-claims'
import { SOVADS_STREAMING_ADDRESS } from '@/lib/chain-config'
import { getCtaSpendForCampaign, hasRemainingBudget } from '@/lib/campaign-spend'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

interface CompleteBody {
  taskId?: string
  wallet?: string
  fingerprint?: string
  proof?: SubmittedProof
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CompleteBody
    const { taskId, fingerprint } = body
    const proof: SubmittedProof = body.proof || {}
    const wallet = body.wallet ? body.wallet.toLowerCase() : null

    if (!taskId || typeof taskId !== 'string') {
      return NextResponse.json({ error: 'taskId required' }, { status: 400, headers: corsHeaders })
    }
    if (!fingerprint || typeof fingerprint !== 'string') {
      return NextResponse.json({ error: 'fingerprint required' }, { status: 400, headers: corsHeaders })
    }
    if (wallet && !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
      return NextResponse.json({ error: 'invalid wallet' }, { status: 400, headers: corsHeaders })
    }

    // 1. Load task
    const task = await prisma.campaignTask.findUnique({ where: { id: taskId } })
    if (!task) {
      return NextResponse.json({ error: 'task not found' }, { status: 404, headers: corsHeaders })
    }
    if (!task.active) {
      return NextResponse.json({ error: 'task inactive' }, { status: 409, headers: corsHeaders })
    }
    const now = new Date()
    if (task.startDate && task.startDate > now) {
      return NextResponse.json({ error: 'task not started' }, { status: 409, headers: corsHeaders })
    }
    if (task.endDate && task.endDate < now) {
      return NextResponse.json({ error: 'task ended' }, { status: 409, headers: corsHeaders })
    }

    // 2. Per-wallet limit + cooldown
    if (wallet) {
      const prior = await prisma.taskCompletion.findMany({
        where: { taskId: task.id, wallet, status: { in: ['verified', 'paid', 'pending', 'awaiting_review'] } },
        orderBy: { createdAt: 'desc' },
      })
      if (prior.length >= task.maxPerWallet) {
        return NextResponse.json(
          { error: `Max ${task.maxPerWallet} completions per wallet reached` },
          { status: 409, headers: corsHeaders }
        )
      }
      if (task.cooldownSecs > 0 && prior[0]) {
        const elapsedSec = (now.getTime() - prior[0].createdAt.getTime()) / 1000
        if (elapsedSec < task.cooldownSecs) {
          return NextResponse.json(
            {
              error: 'cooldown active',
              retryAfterSec: Math.ceil(task.cooldownSecs - elapsedSec),
            },
            { status: 429, headers: corsHeaders }
          )
        }
      }
    } else {
      // Anonymous (fingerprint-only) completions: still rate-limit by fingerprint
      const priorAnon = await prisma.taskCompletion.count({
        where: { taskId: task.id, fingerprint, status: { in: ['verified', 'paid', 'pending', 'awaiting_review'] } },
      })
      if (priorAnon >= task.maxPerWallet) {
        return NextResponse.json(
          { error: 'already completed' },
          { status: 409, headers: corsHeaders }
        )
      }
    }

    // 3. Verify proof
    const verifier = task.verifier as TaskVerifier
    const kind = task.kind as TaskKind
    const config = (task.config as TaskConfig) || {}

    // 3a. MANUAL verifier short-circuit: skip verification, create a pending
    //     completion for the advertiser to review in their CTA queue. No
    //     points or G$ are awarded until the advertiser approves it.
    //     We use a dedicated 'awaiting_review' status so it doesn't collide
    //     with the 'pending' status used for G$ claims awaiting on-chain
    //     confirmation.
    if (verifier === 'MANUAL') {
      const viewer = await findOrCreateViewer(wallet, fingerprint)
      const proofJson = JSON.parse(
        JSON.stringify({ ...proof, verdict: { ok: false, reason: 'manual review pending' } })
      ) as Prisma.InputJsonValue
      const completion = await prisma.taskCompletion.create({
        data: {
          taskId: task.id,
          viewerId: viewer.id,
          wallet,
          fingerprint,
          proof: proofJson,
          status: 'awaiting_review',
        },
      })
      return NextResponse.json(
        {
          success: true,
          pending: true,
          completionId: completion.id,
          message: 'Submission received. The advertiser will review and award rewards.',
        },
        { headers: corsHeaders }
      )
    }

    const verdict = await verifyProof({
      verifier,
      kind,
      config,
      wallet,
      proof,
      fingerprint,
      verificationPlan: task.verificationPlan ?? undefined,
      contractAllowlist: task.contractAllowlist ?? undefined,
    })

    // 4. Resolve viewer
    const viewer = await findOrCreateViewer(wallet, fingerprint)

    const proofJson = JSON.parse(JSON.stringify({ ...proof, verdict })) as Prisma.InputJsonValue

    if (!verdict.ok) {
      // Record the failed attempt for audit but don't award anything
      await prisma.taskCompletion.create({
        data: {
          taskId: task.id,
          viewerId: viewer.id,
          wallet,
          fingerprint,
          proof: proofJson,
          status: 'rejected',
          error: verdict.reason || 'verification failed',
        },
      })
      return NextResponse.json(
        { error: 'proof rejected', reason: verdict.reason, details: verdict.details },
        { status: 400, headers: corsHeaders }
      )
    }

    // 5. Decide whether we'll pay G$ this round
    const wantsGs = !!task.rewardGs && task.rewardGs > 0

    // 5a. Unified-budget enforcement (clicks + CTAs share the campaign cap).
    //     If the parent campaign's effective spend has already met the budget,
    //     we keep accepting completions but skip the G$ payout — the viewer
    //     still gets compensated through the points fallback in step 5b so
    //     they never lose value for work they actually performed.
    //     `campaign not found` / `inactive` remain hard errors since those
    //     mean the CTA shouldn't have been served in the first place.
    let campaignBudgetExhausted = false
    if (wantsGs) {
      const campaign = await prisma.campaign.findUnique({
        where: { id: task.campaignId },
        select: { id: true, budget: true, spent: true, active: true },
      })
      if (!campaign) {
        return NextResponse.json(
          { error: 'campaign not found' },
          { status: 404, headers: corsHeaders }
        )
      }
      if (!campaign.active) {
        return NextResponse.json(
          { error: 'campaign inactive' },
          { status: 409, headers: corsHeaders }
        )
      }
      const ctaSpent = await getCtaSpendForCampaign(campaign.id)
      const currentTotal = (campaign.spent ?? 0) + ctaSpent
      if (!hasRemainingBudget(campaign.budget, currentTotal, task.rewardGs ?? 0)) {
        campaignBudgetExhausted = true
      }
    }
    const gsBudgetLeft = task.budgetGs == null ? Infinity : Math.max(task.budgetGs - task.spentGs, 0)
    const willPayGs =
      wantsGs &&
      !campaignBudgetExhausted &&
      gsBudgetLeft >= (task.rewardGs ?? 0) &&
      !!wallet

    // 5b. If we wanted to pay G$ but can't (campaign cap hit, per-task budget
    //     exhausted, or no wallet attached to the viewer), credit the
    //     equivalent value as bonus SovPoints (1 SovPoint = 1 G$). The viewer
    //     still gets paid for the work, just through the points cashout flow
    //     instead of an on-chain signed claim.
    const bonusPointsInLieuOfGs = wantsGs && !willPayGs ? (task.rewardGs ?? 0) : 0
    const totalPointsToAward = task.rewardPoints + bonusPointsInLieuOfGs
    let actualPointsAwarded = totalPointsToAward

    // 6. Create the completion record first (so claimRef has a stable id to bind to)
    const completion = await prisma.taskCompletion.create({
      data: {
        taskId: task.id,
        viewerId: viewer.id,
        wallet,
        fingerprint,
        proof: proofJson,
        status: willPayGs ? 'pending' : 'verified',
        rewardPoints: totalPointsToAward,
        rewardGs: willPayGs ? task.rewardGs : null,
        verifiedAt: now,
      },
    })

    // 7. Award SovPoints (transactional with viewer update)
    if (totalPointsToAward > 0) {
      await prisma.viewerPoints.update({
        where: { id: viewer.id },
        data: {
          totalPoints: { increment: totalPointsToAward },
          pendingPoints: { increment: totalPointsToAward },
          lastInteraction: now,
        },
      })
    }

    // 8. If paying G$, sign a single-use claim for the user to submit themselves
    let transaction:
      | {
          to: string
          functionName: string
          args: Record<string, string>
          operator: string
        }
      | undefined

    if (willPayGs && wallet) {
      try {
        const whitelisted = await isOperatorWhitelisted()
        if (!whitelisted) throw new Error('Operator not whitelisted on contract')

        const rawAmount = parseUnits((task.rewardGs as number).toFixed(18), 18)
        const balance = await getContractBalance()
        if (balance < rawAmount) throw new Error('Insufficient contract G$ balance')

        // Bind claimRef to the completion id so it's unique per task+viewer attempt
        const nonceStr = `${completion.id}:${randomUUID()}`
        const claimRef = generateClaimRef(wallet, nonceStr)
        const used = await isClaimRefUsed(claimRef)
        if (used) throw new Error('claimRef collision (retry)')

        const signed = await signClaim(wallet, rawAmount, claimRef)

        await prisma.$transaction([
          prisma.taskCompletion.update({
            where: { id: completion.id },
            data: {
              claimRef,
              nonce: signed.nonce,
              deadline: signed.deadline,
              signature: signed.signature,
            },
          }),
          prisma.campaignTask.update({
            where: { id: task.id },
            data: { spentGs: { increment: task.rewardGs ?? 0 } },
          }),
        ])

        transaction = {
          to: SOVADS_STREAMING_ADDRESS,
          functionName: 'claimWithSignature',
          args: {
            recipient: signed.recipient,
            amount: signed.amount,
            claimRef: signed.claimRef,
            nonce: signed.nonce,
            deadline: signed.deadline,
            signature: signed.signature,
          },
          operator: signed.operator,
        }
      } catch (signErr) {
        // Verification passed but signing failed. Compensate the viewer in
        // points (1 SovPoint = 1 G$) instead of leaving them empty-handed.
        const compensation = task.rewardGs ?? 0
        const errMsg = signErr instanceof Error ? signErr.message : 'sign failed'
        actualPointsAwarded = totalPointsToAward + compensation
        await prisma.$transaction([
          prisma.taskCompletion.update({
            where: { id: completion.id },
            data: {
              status: 'verified',
              rewardGs: null,
              rewardPoints: actualPointsAwarded,
              error: `${errMsg} — paid ${compensation} bonus SovPoints in lieu of G$`,
            },
          }),
          ...(compensation > 0
            ? [
                prisma.viewerPoints.update({
                  where: { id: viewer.id },
                  data: {
                    totalPoints: { increment: compensation },
                    pendingPoints: { increment: compensation },
                    lastInteraction: now,
                  },
                }),
              ]
            : []),
        ])
      }
    }

    return NextResponse.json(
      {
        success: true,
        completionId: completion.id,
        status: transaction ? 'pending' : 'verified',
        awarded: {
          points: actualPointsAwarded,
          gs: transaction ? task.rewardGs : 0,
          bonusPointsInLieuOfGs: actualPointsAwarded - task.rewardPoints,
        },
        transaction,
      },
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error('tasks/complete POST error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500, headers: corsHeaders }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { completionId, txHash } = body as { completionId?: string; txHash?: string }

    if (!completionId || typeof completionId !== 'string') {
      return NextResponse.json({ error: 'completionId required' }, { status: 400, headers: corsHeaders })
    }
    if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      return NextResponse.json({ error: 'valid txHash required' }, { status: 400, headers: corsHeaders })
    }

    const completion = await prisma.taskCompletion.findUnique({ where: { id: completionId } })
    if (!completion) {
      return NextResponse.json({ error: 'completion not found' }, { status: 404, headers: corsHeaders })
    }
    if (completion.status === 'paid') {
      return NextResponse.json({ error: 'already paid' }, { status: 409, headers: corsHeaders })
    }
    if (!completion.signature) {
      return NextResponse.json({ error: 'no signed claim on this completion' }, { status: 409, headers: corsHeaders })
    }

    await prisma.taskCompletion.update({
      where: { id: completionId },
      data: {
        status: 'paid',
        payoutTxHash: txHash,
        paidAt: new Date(),
      },
    })

    return NextResponse.json({ success: true, completionId, txHash }, { headers: corsHeaders })
  } catch (error) {
    console.error('tasks/complete PATCH error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500, headers: corsHeaders }
    )
  }
}
