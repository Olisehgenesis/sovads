import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyProof, type SubmittedProof, type TaskConfig, type TaskKind, type TaskVerifier } from '@/lib/tasks'

/**
 * POST /api/tasks/test
 *
 * Dry-run verifier for advertisers. Calls verifyProof() with the supplied
 * sample inputs but writes NOTHING and pays NOTHING. Returns the verdict
 * (and, for AI_PLAN, the per-step RPC trace) so the advertiser can confirm
 * a real user with the given context WOULD satisfy the CTA.
 *
 * Body: {
 *   taskId, wallet,            // wallet = campaign owner (auth)
 *   sample: {
 *     wallet?, fingerprint?,
 *     txHash?, signature?, message?, answer?, dwellMs?, externalRef?
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { taskId, wallet, sample } = body as {
      taskId: string
      wallet: string
      sample?: SubmittedProof & { wallet?: string; fingerprint?: string }
    }

    if (!taskId || !wallet) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const task = await prisma.campaignTask.findUnique({
      where: { id: taskId },
      include: { campaign: { include: { advertiser: true } } },
    })
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    const ownerWallet = task.campaign?.advertiser?.wallet || ''
    if (!ownerWallet || ownerWallet.toLowerCase() !== wallet.toLowerCase()) {
      return NextResponse.json({ error: 'Not campaign owner' }, { status: 403 })
    }

    const s = sample || {}
    const sampleWallet = (s as { wallet?: string }).wallet || null
    const sampleFingerprint = (s as { fingerprint?: string }).fingerprint || 'test-fingerprint'

    const proof: SubmittedProof = {
      txHash: s.txHash,
      signature: s.signature,
      message: s.message,
      answer: s.answer,
      dwellMs: s.dwellMs,
      externalRef: s.externalRef,
    }

    const verdict = await verifyProof({
      verifier: task.verifier as TaskVerifier,
      kind: task.kind as TaskKind,
      config: (task.config as TaskConfig) || {},
      wallet: sampleWallet,
      proof,
      fingerprint: sampleFingerprint,
      verificationPlan: task.verificationPlan ?? undefined,
      contractAllowlist: task.contractAllowlist ?? undefined,
    })

    return NextResponse.json({
      success: true,
      dryRun: true,
      taskId,
      verifier: task.verifier,
      kind: task.kind,
      verdict,
    })
  } catch (error) {
    console.error('tasks/test error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
