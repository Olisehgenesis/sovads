/**
 * GET  /api/advertiser/review?wallet=0x…&campaignId=…&status=awaiting_review
 *      → list TaskCompletion rows awaiting (or recently decided) for this
 *        advertiser's campaigns. Only the advertiser that owns the campaign
 *        can see them.
 *
 * POST /api/advertiser/review
 *      Body: { wallet: '0x…', completionId: '…', action: 'approve'|'reject', note?: string }
 *      → approve: awards rewardPoints + signs G$ claim (same flow as automatic verification).
 *      → reject:  marks completion 'rejected' with the supplied note (no payout).
 *
 * Notes:
 *   - Auth = advertiser must own the parent campaign (by wallet match on Advertiser table).
 *   - On approve, we run the SAME budget checks as /api/tasks/complete: if budget is gone,
 *     points are still awarded but G$ is skipped.
 *   - On approve, if G$ was supposed to be paid, we sign a single-use claim and return the
 *     transaction blob in the response. Today this is informational (the advertiser is the
 *     one approving, not the viewer — so they can't submit the tx themselves). We surface
 *     it so a follow-up flow can push it to the viewer.
 */

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { parseUnits } from 'viem'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
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
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

const VALID_STATUSES = new Set([
  'awaiting_review',
  'verified',
  'paid',
  'pending',
  'rejected',
])

async function loadAdvertiser(wallet: string | null) {
  if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) return null
  return prisma.advertiser.findFirst({ where: { wallet: wallet.toLowerCase() } })
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const walletParam = url.searchParams.get('wallet')
    const campaignIdParam = url.searchParams.get('campaignId')
    const statusParam = url.searchParams.get('status') || 'awaiting_review'
    const limitParam = url.searchParams.get('limit')
    const limit = Math.min(Math.max(parseInt(limitParam ?? '50', 10) || 50, 1), 200)

    if (!VALID_STATUSES.has(statusParam)) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400, headers: corsHeaders })
    }
    const advertiser = await loadAdvertiser(walletParam)
    if (!advertiser) {
      return NextResponse.json({ error: 'advertiser not found for wallet' }, { status: 404, headers: corsHeaders })
    }

    // Constrain to this advertiser's campaigns (and optionally a single campaign).
    const campaigns = await prisma.campaign.findMany({
      where: {
        advertiserId: advertiser.id,
        ...(campaignIdParam ? { id: campaignIdParam } : {}),
      },
      select: { id: true, name: true },
    })
    const campaignIds = campaigns.map((c) => c.id)
    const campaignMap = new Map(campaigns.map((c) => [c.id, c.name] as const))
    if (campaignIds.length === 0) {
      return NextResponse.json({ items: [], total: 0 }, { headers: corsHeaders })
    }

    const completions = await prisma.taskCompletion.findMany({
      where: {
        status: statusParam,
        task: { campaignId: { in: campaignIds } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        task: {
          select: {
            id: true,
            label: true,
            kind: true,
            verifier: true,
            rewardPoints: true,
            rewardGs: true,
            campaignId: true,
            config: true,
          },
        },
      },
    })

    const items = completions.map((c) => ({
      id: c.id,
      wallet: c.wallet,
      fingerprint: c.fingerprint,
      proof: c.proof,
      status: c.status,
      createdAt: c.createdAt,
      verifiedAt: c.verifiedAt,
      error: c.error,
      task: {
        id: c.task.id,
        label: c.task.label,
        kind: c.task.kind,
        verifier: c.task.verifier,
        rewardPoints: c.task.rewardPoints,
        rewardGs: c.task.rewardGs,
        config: c.task.config,
        campaignId: c.task.campaignId,
        campaignName: campaignMap.get(c.task.campaignId) ?? null,
      },
    }))

    return NextResponse.json({ items, total: items.length }, { headers: corsHeaders })
  } catch (error) {
    console.error('advertiser/review GET error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500, headers: corsHeaders }
    )
  }
}

interface ReviewBody {
  wallet?: string
  completionId?: string
  action?: 'approve' | 'reject'
  note?: string
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ReviewBody
    const advertiser = await loadAdvertiser(body.wallet ?? null)
    if (!advertiser) {
      return NextResponse.json({ error: 'advertiser not found for wallet' }, { status: 404, headers: corsHeaders })
    }
    if (!body.completionId || typeof body.completionId !== 'string') {
      return NextResponse.json({ error: 'completionId required' }, { status: 400, headers: corsHeaders })
    }
    if (body.action !== 'approve' && body.action !== 'reject') {
      return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400, headers: corsHeaders })
    }

    const completion = await prisma.taskCompletion.findUnique({
      where: { id: body.completionId },
      include: {
        task: {
          select: {
            id: true,
            campaignId: true,
            rewardPoints: true,
            rewardGs: true,
            budgetGs: true,
            spentGs: true,
          },
        },
      },
    })
    if (!completion) {
      return NextResponse.json({ error: 'completion not found' }, { status: 404, headers: corsHeaders })
    }
    if (completion.status !== 'awaiting_review') {
      return NextResponse.json(
        { error: `cannot review completion in status '${completion.status}'` },
        { status: 409, headers: corsHeaders }
      )
    }

    // Verify the advertiser owns the parent campaign.
    const campaign = await prisma.campaign.findUnique({
      where: { id: completion.task.campaignId },
      select: { id: true, advertiserId: true, budget: true, spent: true, tokenAddress: true },
    })
    if (!campaign || campaign.advertiserId !== advertiser.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: corsHeaders })
    }

    // ── REJECT ────────────────────────────────────────────────────────────
    if (body.action === 'reject') {
      const note = (body.note || '').slice(0, 500)
      await prisma.taskCompletion.update({
        where: { id: completion.id },
        data: {
          status: 'rejected',
          error: note || 'rejected by advertiser',
          verifiedAt: new Date(),
        },
      })
      return NextResponse.json(
        { success: true, status: 'rejected', completionId: completion.id },
        { headers: corsHeaders }
      )
    }

    // ── APPROVE ───────────────────────────────────────────────────────────
    const task = completion.task
    const wallet = completion.wallet
    const wantsGs = !!task.rewardGs && task.rewardGs > 0
    const now = new Date()

    // Budget check (same as tasks/complete step 5a): clicks + ctas share campaign.spent.
    let willPayGs = wantsGs && !!wallet
    if (willPayGs) {
      const ctaSpend = await getCtaSpendForCampaign(campaign.id)
      const currentTotal = (campaign.spent ?? 0) + ctaSpend
      if (!hasRemainingBudget(campaign.budget, currentTotal, task.rewardGs ?? 0)) {
        willPayGs = false
      }
    }
    const gsBudgetLeft = task.budgetGs == null ? Infinity : Math.max(task.budgetGs - task.spentGs, 0)
    if (willPayGs && gsBudgetLeft < (task.rewardGs ?? 0)) willPayGs = false

    // If we can't pay G$, compensate the viewer with equivalent SovPoints
    // (1 SovPoint = 1 G$) so the work is still rewarded.
    const bonusPointsInLieuOfGs = wantsGs && !willPayGs ? (task.rewardGs ?? 0) : 0
    const totalPointsToAward = task.rewardPoints + bonusPointsInLieuOfGs
    let actualPointsAwarded = totalPointsToAward

    // 1. Flip the completion to verified + record approval.
    const existingProof = (completion.proof as Prisma.JsonObject) || {}
    const proofWithApproval = JSON.parse(
      JSON.stringify({
        ...existingProof,
        verdict: {
          ok: true,
          reason: 'approved by advertiser',
          reviewerWallet: advertiser.wallet,
          note: (body.note || '').slice(0, 500) || undefined,
        },
      })
    ) as Prisma.InputJsonValue

    await prisma.taskCompletion.update({
      where: { id: completion.id },
      data: {
        status: willPayGs ? 'pending' : 'verified',
        rewardPoints: totalPointsToAward,
        rewardGs: willPayGs ? task.rewardGs : null,
        proof: proofWithApproval,
        verifiedAt: now,
      },
    })

    // 2. Award SovPoints (includes G$-equivalent bonus when applicable).
    if (totalPointsToAward > 0) {
      await prisma.viewerPoints.update({
        where: { id: completion.viewerId },
        data: {
          totalPoints: { increment: totalPointsToAward },
          pendingPoints: { increment: totalPointsToAward },
          lastInteraction: now,
        },
      })
    }

    // 3. If paying G$, sign a single-use claim (viewer will submit it themselves).
    let transaction:
      | {
          to: string
          functionName: string
          args: Record<string, string>
          operator: string
        }
      | undefined
    let signError: string | undefined

    if (willPayGs && wallet) {
      try {
        const whitelisted = await isOperatorWhitelisted()
        if (!whitelisted) throw new Error('Operator not whitelisted on contract')

        const rawAmount = parseUnits((task.rewardGs as number).toFixed(18), 18)
        const balance = await getContractBalance()
        if (balance < rawAmount) throw new Error('Insufficient contract G$ balance')

        const nonceStr = `${completion.id}:${randomUUID()}`
        const claimRef = generateClaimRef(wallet, nonceStr)
        if (await isClaimRefUsed(claimRef)) throw new Error('claimRef collision (retry)')

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
      } catch (err) {
        // Points already awarded (including bonus if budget was tight). Sign
        // failed for an operational reason — compensate the viewer in points
        // for the G$ portion they should have received.
        signError = err instanceof Error ? err.message : 'sign failed'
        const compensation = task.rewardGs ?? 0
        actualPointsAwarded = totalPointsToAward + compensation
        await prisma.$transaction([
          prisma.taskCompletion.update({
            where: { id: completion.id },
            data: {
              status: 'verified',
              rewardGs: null,
              rewardPoints: actualPointsAwarded,
              error: `${signError} — paid ${compensation} bonus SovPoints in lieu of G$`,
            },
          }),
          ...(compensation > 0
            ? [
                prisma.viewerPoints.update({
                  where: { id: completion.viewerId },
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
        status: transaction ? 'pending' : 'verified',
        completionId: completion.id,
        awarded: {
          points: actualPointsAwarded,
          gs: transaction ? task.rewardGs : 0,
          bonusPointsInLieuOfGs: actualPointsAwarded - task.rewardPoints,
        },
        transaction,
        signError,
      },
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error('advertiser/review POST error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500, headers: corsHeaders }
    )
  }
}
