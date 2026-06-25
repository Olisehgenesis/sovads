/**
 * POST /api/interactions — viewer submits a standalone attention unit
 *   (POLL / FEEDBACK / SURVEY / QUIZ ORACLE flows).
 *
 *   Body: {
 *     taskId:       string,
 *     wallet?:      string,
 *     fingerprint:  string,
 *     siteId?:      string,
 *     sessionId?:   string,           // SURVEY: continues an existing SurveySession
 *     step?:        number,           // SURVEY: index of the answered step (0-based)
 *     final?:       boolean,          // SURVEY: when true, finalises completion
 *     proof:        SubmittedProof    // payload validated by lib/tasks::verifyProof
 *   }
 *
 *   Returns one of:
 *     { ok: true, kind: 'STEP',       sessionId, currentStep, totalSteps }
 *     { ok: true, kind: 'SUBMIT',     completionId, awarded:{points,gs} }
 *     { ok: false, error, reason? }
 *
 * Design:
 *   - Postgres = source of truth (TaskCompletion + SurveySession + ViewerPoints).
 *   - Turso    = firehose (task_responses) — best-effort, awaited but non-blocking on failure.
 *   - No G$ payout from this endpoint. Standalone units are points-only for v1.
 *     If a task carries rewardGs, the legacy /api/tasks/complete path is still used.
 *   - Per-wallet caps + cooldown enforced exactly as in /api/tasks/complete.
 */

import { NextRequest, NextResponse } from 'next/server'
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
  trackTaskResponse,
  type TaskResponseKind,
} from '@/lib/analytics/track'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

const STANDALONE_KINDS = new Set<TaskKind>(['POLL', 'FEEDBACK', 'SURVEY', 'QUIZ'])

interface InteractionBody {
  taskId?: string
  wallet?: string | null
  fingerprint?: string
  siteId?: string
  sessionId?: string
  step?: number
  final?: boolean
  proof?: SubmittedProof
}

function bodyForKind(kind: TaskKind, proof: SubmittedProof): Record<string, unknown> {
  switch (kind) {
    case 'POLL':
      return { optionId: proof.optionId }
    case 'FEEDBACK':
      return { rating: proof.rating, text: proof.text }
    case 'SURVEY':
      return { answers: proof.answers ?? [] }
    case 'QUIZ':
      return { answer: proof.answer }
    default:
      return {}
  }
}

function responseKindFor(kind: TaskKind, isFinal: boolean): TaskResponseKind {
  if (kind === 'SURVEY' && !isFinal) return 'STEP'
  if (kind === 'POLL') return 'VOTE'
  if (kind === 'QUIZ') return 'ANSWER'
  if (kind === 'FEEDBACK') return 'TEXT'
  return 'SUBMIT'
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as InteractionBody
    const taskId = body.taskId
    const fingerprint = body.fingerprint
    const wallet = body.wallet ? body.wallet.toLowerCase() : null
    const siteId = body.siteId ?? null
    const proof: SubmittedProof = body.proof ?? {}

    if (!taskId) {
      return NextResponse.json({ error: 'taskId required' }, { status: 400, headers: corsHeaders })
    }
    if (!fingerprint) {
      return NextResponse.json({ error: 'fingerprint required' }, { status: 400, headers: corsHeaders })
    }
    if (wallet && !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
      return NextResponse.json({ error: 'invalid wallet' }, { status: 400, headers: corsHeaders })
    }

    const task = await prisma.campaignTask.findUnique({ where: { id: taskId } })
    if (!task) {
      return NextResponse.json({ error: 'task not found' }, { status: 404, headers: corsHeaders })
    }
    const kind = task.kind as TaskKind
    if (!STANDALONE_KINDS.has(kind)) {
      return NextResponse.json(
        { error: `kind ${kind} is not a standalone interaction; use /api/tasks/complete` },
        { status: 400, headers: corsHeaders }
      )
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

    const verifier = task.verifier as TaskVerifier
    const config = (task.config as TaskConfig) || {}
    const viewer = await findOrCreateViewer(wallet, fingerprint)

    // ---------- SURVEY STEP (no completion yet) ----------
    const isSurveyStep = kind === 'SURVEY' && body.final !== true
    if (isSurveyStep) {
      const totalSteps = (config.questions ?? []).length
      if (totalSteps === 0) {
        return NextResponse.json({ error: 'survey has no questions' }, { status: 409, headers: corsHeaders })
      }
      const stepIndex = Math.max(0, Math.min(totalSteps - 1, Number(body.step ?? 0)))

      let session = body.sessionId
        ? await prisma.surveySession.findUnique({ where: { id: body.sessionId } })
        : await prisma.surveySession.findFirst({
            where: { taskId: task.id, fingerprint, status: 'in_progress' },
            orderBy: { startedAt: 'desc' },
          })

      if (!session) {
        session = await prisma.surveySession.create({
          data: {
            taskId: task.id,
            wallet,
            fingerprint,
            totalSteps,
            currentStep: stepIndex,
          },
        })
      } else if (session.status !== 'in_progress') {
        return NextResponse.json({ error: 'session not in progress' }, { status: 409, headers: corsHeaders })
      } else {
        session = await prisma.surveySession.update({
          where: { id: session.id },
          data: {
            currentStep: Math.max(session.currentStep, stepIndex + 1),
            lastSeenAt: now,
            wallet: session.wallet ?? wallet,
          },
        })
      }

      try {
        await trackTaskResponse({
          taskId: task.id,
          campaignId: task.campaignId,
          siteId,
          viewerId: viewer.id,
          fingerprint,
          wallet,
          kind: 'STEP',
          payload: {
            sessionId: session.id,
            step: stepIndex,
            answer: proof.answers?.[0] ?? null,
          },
        })
      } catch (e) {
        console.warn('[interactions] turso step write failed', e)
      }

      return NextResponse.json(
        {
          ok: true,
          kind: 'STEP' as const,
          sessionId: session.id,
          currentStep: session.currentStep,
          totalSteps: session.totalSteps,
        },
        { headers: corsHeaders }
      )
    }

    // ---------- Per-wallet / per-fingerprint caps for the final submit ----------
    if (wallet) {
      const prior = await prisma.taskCompletion.count({
        where: { taskId: task.id, wallet, status: { in: ['verified', 'paid', 'pending', 'awaiting_review'] } },
      })
      if (prior >= task.maxPerWallet) {
        return NextResponse.json(
          { error: `Max ${task.maxPerWallet} completions per wallet reached` },
          { status: 409, headers: corsHeaders }
        )
      }
    } else {
      const priorAnon = await prisma.taskCompletion.count({
        where: { taskId: task.id, fingerprint, status: { in: ['verified', 'paid', 'pending', 'awaiting_review'] } },
      })
      if (priorAnon >= task.maxPerWallet) {
        return NextResponse.json({ error: 'already completed' }, { status: 409, headers: corsHeaders })
      }
    }

    // ---------- Verify proof ----------
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

    const proofJson = JSON.parse(JSON.stringify({ ...proof, verdict })) as Prisma.InputJsonValue

    if (!verdict.ok) {
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
        { ok: false, error: 'proof rejected', reason: verdict.reason, details: verdict.details },
        { status: 400, headers: corsHeaders }
      )
    }

    // ---------- Create the completion (verified, points-only) ----------
    // Standalone interactions don't pay G$ from this endpoint — keeps the surface
    // free of the on-chain claim flow, which still lives in /api/tasks/complete.
    const completion = await prisma.taskCompletion.create({
      data: {
        taskId: task.id,
        viewerId: viewer.id,
        wallet,
        fingerprint,
        proof: proofJson,
        status: 'verified',
        rewardPoints: task.rewardPoints,
        rewardGs: null,
        verifiedAt: now,
      },
    })

    if (task.rewardPoints > 0) {
      await prisma.viewerPoints.update({
        where: { id: viewer.id },
        data: {
          totalPoints: { increment: task.rewardPoints },
          pendingPoints: { increment: task.rewardPoints },
          lastInteraction: now,
        },
      })
    }

    // ---------- Finalise SurveySession if applicable ----------
    if (kind === 'SURVEY' && body.sessionId) {
      await prisma.surveySession.updateMany({
        where: { id: body.sessionId, status: 'in_progress' },
        data: { status: 'completed', completedAt: now, lastSeenAt: now },
      })
    }

    // ---------- Firehose: Turso task_responses (best-effort) ----------
    try {
      await trackTaskResponse({
        taskId: task.id,
        completionId: completion.id,
        campaignId: task.campaignId,
        siteId,
        viewerId: viewer.id,
        fingerprint,
        wallet,
        kind: responseKindFor(kind, true),
        payload: bodyForKind(kind, proof),
      })
    } catch (e) {
      console.warn('[interactions] turso submit write failed', e)
    }

    return NextResponse.json(
      {
        ok: true,
        kind: 'SUBMIT' as const,
        completionId: completion.id,
        awarded: { points: task.rewardPoints, gs: 0 },
      },
      { headers: corsHeaders }
    )
  } catch (e) {
    console.error('[interactions] error', e)
    const msg = e instanceof Error ? e.message : 'unknown error'
    return NextResponse.json({ error: 'internal_error', message: msg }, { status: 500, headers: corsHeaders })
  }
}
