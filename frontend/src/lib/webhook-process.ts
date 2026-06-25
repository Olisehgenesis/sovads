/**
 * Shared completion logic for WEBHOOK-verifier postbacks.
 *
 * Used by:
 *   - POST /api/cta-postback   (S2S JSON)
 *   - GET  /api/cta-pixel      (1×1 GIF beacon)
 *
 * Behaviour:
 *   1. Load task, ensure verifier === 'WEBHOOK' and active.
 *   2. Verify HMAC + replay window (via verifyWebhook).
 *   3. Resolve / create viewer (wallet preferred, fingerprint fallback).
 *   4. Enforce per-task limits + externalRef dedup.
 *   5. Sign G$ claim (if task has rewardGs) using existing operator flow.
 *   6. Increment SovPoints atomically.
 *   7. Always write a CallbackLog entry for audit.
 *
 * Returns a structured result so the route can map it to HTTP / pixel response.
 */

import { randomUUID } from 'crypto'
import { Prisma } from '@prisma/client'
import { parseUnits } from 'viem'
import { prisma } from './prisma'
import { findOrCreateViewer } from './tasks'
import { logCallback } from './debug-logger'
import {
  verifyWebhook,
  type WebhookConfig,
  type WebhookPayload,
} from './webhook-verify'
import {
  signClaim,
  generateClaimRef,
  isOperatorWhitelisted,
  isClaimRefUsed,
  getContractBalance,
} from './streaming-claims'

export interface ProcessPostbackResult {
  ok: boolean
  status: number
  body: Record<string, unknown>
  completionId?: string
  // Only included when the request also identifies a wallet AND the task pays G$.
  // The advertiser usually won't surface this — it's mainly useful for the
  // redirect-mode flow where the user's browser hits the postback handler.
  transaction?: {
    to: string
    functionName: 'claimWithSignature'
    args: Record<string, string>
    operator: string
  }
}

export async function processPostback(args: {
  payload: WebhookPayload
  providedSig: string
  ip?: string
  userAgent?: string
  referer?: string
  endpoint: 'postback' | 'pixel' | 'redirect'
}): Promise<ProcessPostbackResult> {
  const { payload, providedSig, ip, userAgent, referer, endpoint } = args

  const logBase = {
    type: `CTA_${endpoint.toUpperCase()}`,
    endpoint: `/api/cta-${endpoint}`,
    ipAddress: ip || undefined,
    userAgent: userAgent || undefined,
    fingerprint: payload.fingerprint || undefined,
  }
  const safeLog = async (data: Record<string, unknown>) => {
    try {
      await logCallback({
        ...logBase,
        payload: data,
        statusCode: (data.statusCode as number | null) ?? undefined,
        error: (data.error as string) || undefined,
      })
    } catch (e) {
      // Never let logging failures break the postback path.
      console.error('Callback log write failed:', e)
    }
  }

  if (!payload.taskId) {
    await safeLog({ payload, error: 'missing taskId', statusCode: 400 })
    return { ok: false, status: 400, body: { error: 'taskId required' } }
  }

  // 1. Load task + assert verifier
  const task = await prisma.campaignTask.findUnique({ where: { id: payload.taskId } })
  if (!task) {
    await safeLog({ payload, error: 'task not found', statusCode: 404 })
    return { ok: false, status: 404, body: { error: 'task not found' } }
  }
  if (task.verifier !== 'WEBHOOK') {
    await safeLog({ payload, error: 'task verifier not WEBHOOK', statusCode: 409 })
    return { ok: false, status: 409, body: { error: 'task verifier mismatch' } }
  }
  if (!task.active) {
    await safeLog({ payload, error: 'task inactive', statusCode: 409 })
    return { ok: false, status: 409, body: { error: 'task inactive' } }
  }
  const now = new Date()
  if (task.startDate && task.startDate > now) {
    await safeLog({ payload, error: 'task not started', statusCode: 409 })
    return { ok: false, status: 409, body: { error: 'task not started' } }
  }
  if (task.endDate && task.endDate < now) {
    await safeLog({ payload, error: 'task ended', statusCode: 409 })
    return { ok: false, status: 409, body: { error: 'task ended' } }
  }

  // 2. Parse webhook config + verify HMAC
  const cfg = (task.config as { webhook?: WebhookConfig })?.webhook
  if (!cfg) {
    await safeLog({ payload, error: 'task webhook not configured', statusCode: 500 })
    return { ok: false, status: 500, body: { error: 'task missing webhook config' } }
  }

  // Pixel-mode origin check
  if (endpoint === 'pixel' && cfg.allowedOrigins && cfg.allowedOrigins.length > 0) {
    let refererHost: string | null = null
    try {
      if (referer) refererHost = new URL(referer).host.toLowerCase()
    } catch { /* ignore */ }
    if (!refererHost || !cfg.allowedOrigins.map((o) => o.toLowerCase()).includes(refererHost)) {
      await safeLog({ payload, error: `bad referer host=${refererHost}`, statusCode: 403 })
      return { ok: false, status: 403, body: { error: 'origin not allowed' } }
    }
  }

  const verdict = verifyWebhook({ config: cfg, payload, providedSig })
  if (!verdict.ok) {
    await safeLog({ payload, error: verdict.reason, statusCode: 401 })
    return { ok: false, status: 401, body: { error: 'verification failed', reason: verdict.reason } }
  }

  // 3. Identity + dedup
  const wallet = payload.wallet ? payload.wallet.toLowerCase() : null
  const fingerprint = payload.fingerprint || `webhook:${payload.externalRef || randomUUID()}`

  if (wallet && !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    await safeLog({ payload, error: 'invalid wallet', statusCode: 400 })
    return { ok: false, status: 400, body: { error: 'invalid wallet' } }
  }

  if (cfg.deduplicateBy === 'externalRef' && payload.externalRef) {
    const existing = await prisma.taskCompletion.findFirst({
      where: {
        taskId: task.id,
        status: { in: ['verified', 'paid', 'pending'] },
        proof: { path: ['externalRef'], equals: payload.externalRef },
      },
    })
    if (existing) {
      await safeLog({ payload, error: 'duplicate externalRef', statusCode: 200, completionId: existing.id })
      return {
        ok: true,
        status: 200,
        body: { success: true, deduplicated: true, completionId: existing.id },
        completionId: existing.id,
      }
    }
  }

  // 4. Per-wallet / per-fingerprint cap
  const limitFilter = wallet
    ? { taskId: task.id, wallet, status: { in: ['verified', 'paid', 'pending'] } }
    : { taskId: task.id, fingerprint, status: { in: ['verified', 'paid', 'pending'] } }
  const used = await prisma.taskCompletion.count({ where: limitFilter })
  if (used >= task.maxPerWallet) {
    await safeLog({ payload, error: 'max per wallet reached', statusCode: 409 })
    return { ok: false, status: 409, body: { error: 'max completions reached' } }
  }

  const viewer = await findOrCreateViewer(wallet, fingerprint)

  // 5. Decide G$ payout
  const wantsGs = !!task.rewardGs && task.rewardGs > 0
  const gsBudgetLeft = task.budgetGs == null ? Infinity : Math.max(task.budgetGs - task.spentGs, 0)
  const willPayGs = wantsGs && gsBudgetLeft >= (task.rewardGs ?? 0) && !!wallet

  // 6. Create completion + award points
  const proofJson: Prisma.InputJsonValue = JSON.parse(
    JSON.stringify({
      externalRef: payload.externalRef,
      ts: payload.ts,
      via: endpoint,
    })
  )

  const completion = await prisma.taskCompletion.create({
    data: {
      taskId: task.id,
      viewerId: viewer.id,
      wallet,
      fingerprint,
      proof: proofJson,
      status: willPayGs ? 'pending' : 'verified',
      rewardPoints: task.rewardPoints,
      rewardGs: willPayGs ? task.rewardGs : null,
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

  // 7. Sign G$ claim (best-effort; failure leaves completion as 'verified' with points)
  let transaction: ProcessPostbackResult['transaction']
  if (willPayGs && wallet) {
    try {
      const whitelisted = await isOperatorWhitelisted()
      if (!whitelisted) throw new Error('operator not whitelisted')

      const rawAmount = parseUnits((task.rewardGs as number).toFixed(18), 18)
      const balance = await getContractBalance()
      if (balance < rawAmount) throw new Error('insufficient contract G$ balance')

      const nonceStr = `${completion.id}:${randomUUID()}`
      const claimRef = generateClaimRef(wallet, nonceStr)
      const usedRef = await isClaimRefUsed(claimRef)
      if (usedRef) throw new Error('claimRef collision')

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

      const { SOVADS_STREAMING_ADDRESS } = await import('./chain-config')
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
      await prisma.taskCompletion.update({
        where: { id: completion.id },
        data: {
          status: 'verified',
          rewardGs: null,
          error: signErr instanceof Error ? signErr.message : 'sign failed',
        },
      })
    }
  }

  await safeLog({ payload, statusCode: 200, completionId: completion.id })

  return {
    ok: true,
    status: 200,
    body: {
      success: true,
      completionId: completion.id,
      awarded: {
        points: task.rewardPoints,
        gs: transaction ? task.rewardGs : 0,
      },
      ...(transaction ? { transaction } : {}),
    },
    completionId: completion.id,
    transaction,
  }
}
