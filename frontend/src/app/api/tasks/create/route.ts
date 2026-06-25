import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { generateVerificationPlan, PlanGenerationError } from '@/lib/plan-generator'
import type { TaskVerifier } from '@/lib/tasks'
import { MIN_CTA_REWARD_GS } from '@/lib/campaign-limits'

/**
 * POST /api/tasks/create
 *
 * Owner-auth: attach a CTA task to a campaign owned by the caller's wallet.
 * Works for both draft and live campaigns.
 *
 * Body: {
 *   campaignId, wallet,
 *   kind: 'VISIT_URL' | 'SOCIAL_FOLLOW' | 'QUIZ' | 'STAKE_GS' | 'CONTRACT_CALL' | 'SIGN_MESSAGE',
 *   label, description?,
 *   verifier: 'ORACLE' | 'SELF_SIGNED' | 'STAKE_PROOF' | 'ONCHAIN_EVENT' | 'WEBHOOK' | 'AI_PLAN',
 *   config?: object,
 *   rewardPoints?: number, rewardGs?: number, budgetGs?: number,
 *   maxPerWallet?: number, cooldownSecs?: number,
 *   startDate?, endDate?,
 *
 *   // AI_PLAN-only (plan is generated inline via Groq, saved immediately):
 *   aiPrompt?: string,
 *   contractAllowlist?: string[],
 *   aiModel?: string,
 * }
 */
const VALID_KINDS = ['VISIT_URL', 'SOCIAL_FOLLOW', 'QUIZ', 'STAKE_GS', 'CONTRACT_CALL', 'SIGN_MESSAGE'] as const
const VALID_VERIFIERS: TaskVerifier[] = [
  'ORACLE',
  'SELF_SIGNED',
  'STAKE_PROOF',
  'ONCHAIN_EVENT',
  'WEBHOOK',
  'AI_PLAN',
  'MANUAL',
  'NA',
]

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      campaignId,
      wallet,
      kind,
      label,
      description,
      verifier,
      config,
      rewardPoints,
      rewardGs,
      budgetGs,
      maxPerWallet,
      cooldownSecs,
      startDate,
      endDate,
      aiPrompt,
      contractAllowlist,
      aiModel,
    } = body as Record<string, unknown>

    if (!campaignId || !wallet || !kind || !label || !verifier) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (!(VALID_KINDS as readonly string[]).includes(kind as string)) {
      return NextResponse.json({ error: `Invalid kind: ${kind}` }, { status: 400 })
    }
    if (!(VALID_VERIFIERS as string[]).includes(verifier as string)) {
      return NextResponse.json({ error: `Invalid verifier: ${verifier}` }, { status: 400 })
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId as string },
      include: { advertiser: true },
    })
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

    if (
      !campaign.advertiser?.wallet ||
      campaign.advertiser.wallet.toLowerCase() !== (wallet as string).toLowerCase()
    ) {
      return NextResponse.json({ error: 'Not campaign owner' }, { status: 403 })
    }

    // CTA reward floor — if a G$ payout is set it must clear the minimum.
    // 0 / undefined / null means "SovPoints only" and is always allowed.
    if (typeof rewardGs === 'number' && rewardGs > 0 && rewardGs < MIN_CTA_REWARD_GS) {
      return NextResponse.json(
        { error: `Minimum G$ reward per CTA completion is ${MIN_CTA_REWARD_GS} G$.` },
        { status: 400 }
      )
    }

    const configJson = JSON.parse(
      JSON.stringify(config && typeof config === 'object' ? config : {})
    ) as Prisma.InputJsonValue

    // AI_PLAN path: generate + validate the plan inline so the task lands in a
    // verifiable state. Bypasses admin approval per current product decision.
    let aiFields: {
      verificationPlan?: Prisma.InputJsonValue
      planAuthor?: string
      planModel?: string
      planPrompt?: string
      planGeneratedAt?: Date
    } = {}
    let normalizedAllowlist: string[] = Array.isArray(contractAllowlist)
      ? (contractAllowlist as string[]).map((a) => (a || '').toLowerCase()).filter(Boolean)
      : []

    if (verifier === 'AI_PLAN') {
      if (!aiPrompt || typeof aiPrompt !== 'string') {
        return NextResponse.json(
          { error: 'aiPrompt is required for AI_PLAN verifier' },
          { status: 400 }
        )
      }
      try {
        const gen = await generateVerificationPlan({
          prompt: aiPrompt,
          contractAllowlist: normalizedAllowlist,
          model: typeof aiModel === 'string' ? aiModel : undefined,
        })
        normalizedAllowlist = gen.allowlist
        aiFields = {
          verificationPlan: JSON.parse(JSON.stringify(gen.plan)) as Prisma.InputJsonValue,
          planAuthor: (wallet as string).toLowerCase(),
          planModel: gen.modelUsed,
          planPrompt: aiPrompt,
          planGeneratedAt: new Date(),
        }
      } catch (e) {
        if (e instanceof PlanGenerationError) {
          return NextResponse.json(
            { error: e.message, raw: e.raw, offenders: e.offenders },
            { status: e.status }
          )
        }
        throw e
      }
    }

    const task = await prisma.campaignTask.create({
      data: {
        campaignId: campaign.id,
        kind: kind as string,
        label: label as string,
        description: typeof description === 'string' ? description : null,
        config: configJson,
        rewardPoints: typeof rewardPoints === 'number' ? rewardPoints : 0,
        rewardGs: typeof rewardGs === 'number' ? rewardGs : null,
        budgetGs: typeof budgetGs === 'number' ? budgetGs : null,
        maxPerWallet: typeof maxPerWallet === 'number' ? Math.max(1, Math.floor(maxPerWallet)) : 1,
        cooldownSecs: typeof cooldownSecs === 'number' ? Math.max(0, Math.floor(cooldownSecs)) : 0,
        verifier: verifier as string,
        active: true,
        startDate: typeof startDate === 'string' ? new Date(startDate) : null,
        endDate: typeof endDate === 'string' ? new Date(endDate) : null,
        contractAllowlist: normalizedAllowlist,
        ...aiFields,
      },
    })

    return NextResponse.json(
      {
        success: true,
        task: {
          id: task.id,
          campaignId: task.campaignId,
          kind: task.kind,
          verifier: task.verifier,
          label: task.label,
          rewardPoints: task.rewardPoints,
          rewardGs: task.rewardGs,
          planGeneratedAt: task.planGeneratedAt,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('tasks/create error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
