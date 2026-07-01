/**
 * CTA task helpers — proof verification + viewer resolution.
 *
 * Verifier types:
 *   - SELF_SIGNED   → user signs `task.config.signMessage` with their wallet
 *   - STAKE_PROOF   → on-chain read: stakers(wallet).stakedAmount >= config.minAmount
 *   - ONCHAIN_EVENT → tx receipt must come from wallet, hit config.targetContract,
 *                     and (optionally) include a log with topics[0] === config.eventSig
 *   - ORACLE        → trust client-supplied proof (dwell time, quiz answer, etc.).
 *                     We still apply lightweight server-side checks here.
 */

import { createPublicClient, http, verifyMessage, parseUnits } from 'viem'
import { celo } from 'viem/chains'
import { SOVADS_STREAMING_ADDRESS } from './chain-config'
import { sovAdsStreamingAbi } from '../contract/sovAdsStreamingAbi'
import { prisma } from './prisma'
import { executeRawPlan } from './verify-executor'

const RPC = (process.env.CELO_MAINNET_RPC_URL || 'https://rpc.ankr.com/celo').trim()

const publicClient = createPublicClient({
  chain: celo,
  transport: http(RPC),
})

export type TaskVerifier = 'ORACLE' | 'SELF_SIGNED' | 'STAKE_PROOF' | 'ONCHAIN_EVENT' | 'WEBHOOK' | 'AI_PLAN' | 'MANUAL' | 'NA'
export type TaskKind =
  | 'VISIT_URL'
  | 'SOCIAL_FOLLOW'
  | 'QUIZ'
  | 'STAKE_GS'
  | 'CONTRACT_CALL'
  | 'SIGN_MESSAGE'
  // Multi-type attention units (verified via ORACLE; payload schema in config):
  | 'POLL'      // single-question, fixed options
  | 'FEEDBACK'  // free-text / rating
  | 'SURVEY'    // multi-step, uses SurveySession

export type TaskSurface = 'attached' | 'standalone' | 'embed'

export interface TaskConfig {
  url?: string
  minDwellMs?: number
  expectedAnswer?: string
  signMessage?: string
  minAmount?: number // SOV / G$ for STAKE_PROOF (human units, 18 decimals applied)
  targetContract?: string
  eventSig?: string // bytes32 topic0
  // Optional override for the SDK button text. Falls back to task.label when absent.
  buttonLabel?: string
  // POLL / QUIZ — shared options array. `correct` is QUIZ-only and is
  // STRIPPED from any client-facing payload (see publicTaskShape / SDK).
  options?: Array<{ id: string; label: string; correct?: boolean }>
  // FEEDBACK
  feedback?: {
    mode?: 'rating' | 'text' | 'rating_and_text'
    minRating?: number
    maxRating?: number
    minTextLen?: number
    maxTextLen?: number
  }
  // SURVEY
  questions?: Array<{
    id: string
    kind: 'single' | 'multi' | 'text' | 'rating'
    label: string
    required?: boolean
    options?: Array<{ id: string; label: string }>
    minRating?: number
    maxRating?: number
    minTextLen?: number
    maxTextLen?: number
  }>
}

export interface SubmittedProof {
  txHash?: string
  signature?: string
  message?: string
  answer?: string
  dwellMs?: number
  externalRef?: string
  // POLL
  optionId?: string
  // FEEDBACK
  rating?: number
  text?: string
  // SURVEY
  answers?: Array<{
    questionId: string
    optionIds?: string[]
    text?: string
    rating?: number
  }>
}

export interface VerifyResult {
  ok: boolean
  reason?: string
  details?: Record<string, unknown>
}

const isHex32 = (s: string) => /^0x[0-9a-fA-F]{64}$/.test(s)
const isAddress = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s)

/**
 * Find an existing viewer by wallet (preferred) or fingerprint, otherwise create one.
 * Mirrors the upsert-by-wallet-or-fingerprint pattern used in /api/viewers/points.
 */
export async function findOrCreateViewer(
  wallet: string | null,
  fingerprint: string
): Promise<{ id: string; wallet: string | null; fingerprint: string }> {
  const normalizedWallet = wallet ? wallet.toLowerCase() : null

  let viewer = normalizedWallet
    ? await prisma.viewerPoints.findFirst({ where: { wallet: normalizedWallet } })
    : await prisma.viewerPoints.findFirst({ where: { fingerprint, wallet: null } })

  if (!viewer) {
    viewer = await prisma.viewerPoints.create({
      data: {
        wallet: normalizedWallet,
        fingerprint: fingerprint || 'unknown',
        totalPoints: 0,
        claimedPoints: 0,
        pendingPoints: 0,
      },
    })
  }

  return { id: viewer.id, wallet: viewer.wallet, fingerprint: viewer.fingerprint }
}

/**
 * Verify a submitted proof against a task's verifier+config.
 * Does not award anything; pure check.
 *
 * For AI_PLAN tasks, callers must also pass `verificationPlan` and
 * `contractAllowlist` (populated by /api/admin/tasks/generate-plan).
 */
export async function verifyProof(args: {
  verifier: TaskVerifier
  kind: TaskKind
  config: TaskConfig
  wallet: string | null
  proof: SubmittedProof
  fingerprint?: string
  verificationPlan?: unknown
  contractAllowlist?: string[]
}): Promise<VerifyResult> {
  const { verifier, kind, config, wallet, proof, fingerprint, verificationPlan, contractAllowlist } = args

  switch (verifier) {
    case 'SELF_SIGNED': {
      if (!wallet || !isAddress(wallet)) return { ok: false, reason: 'wallet required' }
      if (!proof.signature || !proof.message) return { ok: false, reason: 'signature+message required' }
      // If task fixes a message, enforce it
      if (config.signMessage && proof.message !== config.signMessage) {
        return { ok: false, reason: 'message mismatch' }
      }
      try {
        const valid = await verifyMessage({
          address: wallet as `0x${string}`,
          message: proof.message,
          signature: proof.signature as `0x${string}`,
        })
        return valid ? { ok: true } : { ok: false, reason: 'invalid signature' }
      } catch (e) {
        return { ok: false, reason: e instanceof Error ? e.message : 'sig verify failed' }
      }
    }

    case 'STAKE_PROOF': {
      if (!wallet || !isAddress(wallet)) return { ok: false, reason: 'wallet required' }
      const minAmount = Number(config.minAmount ?? 0)
      if (minAmount <= 0) return { ok: false, reason: 'task minAmount invalid' }
      try {
        const result = (await publicClient.readContract({
          address: SOVADS_STREAMING_ADDRESS as `0x${string}`,
          abi: sovAdsStreamingAbi,
          functionName: 'getStakerInfo',
          args: [wallet as `0x${string}`],
        })) as [bigint, bigint, bigint]
        const stakedAmount = result[0]
        const required = parseUnits(minAmount.toString(), 18)
        if (stakedAmount < required) {
          return {
            ok: false,
            reason: `staked ${stakedAmount.toString()} < required ${required.toString()}`,
            details: { stakedAmount: stakedAmount.toString(), required: required.toString() },
          }
        }
        return { ok: true, details: { stakedAmount: stakedAmount.toString() } }
      } catch (e) {
        return { ok: false, reason: e instanceof Error ? e.message : 'stake read failed' }
      }
    }

    case 'ONCHAIN_EVENT': {
      if (!proof.txHash || !isHex32(proof.txHash)) return { ok: false, reason: 'txHash required' }
      if (!wallet || !isAddress(wallet)) return { ok: false, reason: 'wallet required' }
      try {
        const receipt = await publicClient.getTransactionReceipt({ hash: proof.txHash as `0x${string}` })
        if (receipt.status !== 'success') return { ok: false, reason: 'tx reverted' }

        const tx = await publicClient.getTransaction({ hash: proof.txHash as `0x${string}` })
        if (tx.from.toLowerCase() !== wallet.toLowerCase()) {
          return { ok: false, reason: 'tx not sent by wallet' }
        }
        if (config.targetContract) {
          const target = config.targetContract.toLowerCase()
          const to = (tx.to || '').toLowerCase()
          if (to !== target) return { ok: false, reason: 'tx target mismatch' }
        }
        if (config.eventSig) {
          const want = config.eventSig.toLowerCase()
          const hasLog = receipt.logs.some((l) => (l.topics[0] || '').toLowerCase() === want)
          if (!hasLog) return { ok: false, reason: 'expected event not found' }
        }
        return { ok: true, details: { blockNumber: receipt.blockNumber.toString() } }
      } catch (e) {
        return { ok: false, reason: e instanceof Error ? e.message : 'receipt fetch failed' }
      }
    }

    case 'ORACLE': {
      // Lightweight server-side checks per kind. Anti-fraud here is best-effort —
      // tasks needing strong guarantees should use SELF_SIGNED / STAKE_PROOF / ONCHAIN_EVENT.
      if (kind === 'VISIT_URL') {
        const minDwell = Number(config.minDwellMs ?? 3000)
        const reported = Number(proof.dwellMs ?? 0)
        if (!Number.isFinite(reported) || reported < minDwell) {
          return { ok: false, reason: `dwell ${reported}ms < required ${minDwell}ms` }
        }
        return { ok: true, details: { dwellMs: reported } }
      }
      if (kind === 'QUIZ') {
        // Two acceptable proof shapes:
        //   1. New: { optionId } — server looks up `correct` on the option
        //      so option labels can change without invalidating the verifier.
        //   2. Legacy: { answer } — text-match against config.expectedAnswer.
        const options = config.options ?? []
        if (proof.optionId && options.length > 0) {
          const picked = options.find((o) => o.id === proof.optionId)
          if (!picked) return { ok: false, reason: 'unknown optionId' }
          return picked.correct === true
            ? { ok: true, details: { optionId: picked.id } }
            : { ok: false, reason: 'wrong answer' }
        }
        const expected = (config.expectedAnswer ?? '').trim().toLowerCase()
        const got = (proof.answer ?? '').trim().toLowerCase()
        if (!expected) return { ok: false, reason: 'task missing expectedAnswer' }
        return got === expected ? { ok: true } : { ok: false, reason: 'wrong answer' }
      }
      if (kind === 'POLL') {
        const options = config.options ?? []
        if (options.length === 0) return { ok: false, reason: 'task missing options' }
        const choice = (proof.optionId ?? '').trim()
        if (!choice) return { ok: false, reason: 'optionId required' }
        const valid = options.some((o) => o.id === choice)
        if (!valid) return { ok: false, reason: 'unknown optionId' }
        return { ok: true, details: { optionId: choice } }
      }
      if (kind === 'FEEDBACK') {
        const cfg = config.feedback ?? {}
        const mode = cfg.mode ?? 'rating_and_text'
        const ratingNeeded = mode !== 'text'
        const textNeeded = mode !== 'rating'

        if (ratingNeeded) {
          const r = Number(proof.rating)
          const min = Number(cfg.minRating ?? 1)
          const max = Number(cfg.maxRating ?? 5)
          if (!Number.isFinite(r) || r < min || r > max) {
            return { ok: false, reason: `rating must be in [${min},${max}]` }
          }
        }
        if (textNeeded) {
          const t = (proof.text ?? '').trim()
          const minLen = Number(cfg.minTextLen ?? (mode === 'text' ? 1 : 0))
          const maxLen = Number(cfg.maxTextLen ?? 2000)
          if (t.length < minLen) return { ok: false, reason: `text too short (min ${minLen})` }
          if (t.length > maxLen) return { ok: false, reason: `text too long (max ${maxLen})` }
        }
        return { ok: true, details: { rating: proof.rating, textLen: (proof.text ?? '').length } }
      }
      if (kind === 'SURVEY') {
        const questions = config.questions ?? []
        if (questions.length === 0) return { ok: false, reason: 'task missing questions' }
        const answers = proof.answers ?? []
        const byId = new Map(answers.map((a) => [a.questionId, a]))
        for (const q of questions) {
          const a = byId.get(q.id)
          const required = q.required !== false
          if (!a) {
            if (required) return { ok: false, reason: `missing answer for ${q.id}` }
            continue
          }
          if (q.kind === 'single') {
            if (!a.optionIds || a.optionIds.length !== 1) {
              return { ok: false, reason: `${q.id}: exactly one option required` }
            }
            const opts = q.options ?? []
            if (!opts.some((o) => o.id === a.optionIds![0])) {
              return { ok: false, reason: `${q.id}: unknown option` }
            }
          } else if (q.kind === 'multi') {
            const ids = a.optionIds ?? []
            if (required && ids.length === 0) {
              return { ok: false, reason: `${q.id}: at least one option required` }
            }
            const opts = q.options ?? []
            const optSet = new Set(opts.map((o) => o.id))
            if (ids.some((id) => !optSet.has(id))) {
              return { ok: false, reason: `${q.id}: unknown option` }
            }
          } else if (q.kind === 'text') {
            const t = (a.text ?? '').trim()
            const minLen = Number(q.minTextLen ?? (required ? 1 : 0))
            const maxLen = Number(q.maxTextLen ?? 2000)
            if (t.length < minLen) return { ok: false, reason: `${q.id}: text too short` }
            if (t.length > maxLen) return { ok: false, reason: `${q.id}: text too long` }
          } else if (q.kind === 'rating') {
            const r = Number(a.rating)
            const min = Number(q.minRating ?? 1)
            const max = Number(q.maxRating ?? 5)
            if (!Number.isFinite(r) || r < min || r > max) {
              return { ok: false, reason: `${q.id}: rating out of range` }
            }
          }
        }
        return { ok: true, details: { answeredCount: answers.length } }
      }
      // SOCIAL_FOLLOW / SIGN_MESSAGE / CONTRACT_CALL under ORACLE → accept without checks.
      // The task creator opted out of strong verification.
      return { ok: true, details: { trust: 'oracle' } }
    }

    case 'WEBHOOK': {
      // WEBHOOK verification is asynchronous: the advertiser's server (or pixel) calls
      // /api/cta-postback or /api/cta-pixel directly. The user-initiated /api/tasks/complete
      // path is only used for the "redirect" sub-mode where the user's browser brings the
      // signed callback back to us. In that case proof must include `externalRef` and the
      // postback should already have landed (or arrive within a short grace period).
      //
      // Returning ok:false with reason 'pending' here means /api/tasks/complete will record
      // a rejected attempt; the actual successful completion is created by webhook-process
      // when the signed callback arrives. This intentionally prevents users from claiming
      // via the wrong endpoint.
      return { ok: false, reason: 'webhook verifier — use /api/cta-postback or /api/cta-pixel' }
    }

    case 'AI_PLAN': {
      if (!verificationPlan) return { ok: false, reason: 'task has no verificationPlan' }
      const allowSet = new Set(
        (contractAllowlist || []).map((a) => a.toLowerCase())
      )
      if (allowSet.size === 0) {
        return { ok: false, reason: 'task has empty contractAllowlist' }
      }
      const result = await executeRawPlan(verificationPlan, {
        wallet: wallet || undefined,
        fingerprint,
        txHash: proof.txHash,
        externalRef: proof.externalRef,
        contractAllowlist: allowSet,
      })
      if (!result.ok) {
        return {
          ok: false,
          reason: result.error || 'plan failed',
          details: { trace: result.steps, rpcCalls: result.rpcCalls },
        }
      }
      return {
        ok: true,
        details: { trace: result.steps, rpcCalls: result.rpcCalls, durationMs: result.durationMs },
      }
    }

    case 'NA': {
      // No verification — trust the submission like ORACLE-opt-out.
      return { ok: true, details: { trust: 'na' } }
    }

    case 'MANUAL': {
      // Sentinel: tasks/complete intercepts MANUAL before this point and
      // creates a pending completion for advertiser review. Reaching here
      // means caller used the wrong path.
      return { ok: false, reason: 'manual verifier — awaiting advertiser review' }
    }

    default:
      return { ok: false, reason: 'unknown verifier' }
  }
}
