import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyAdminSignature } from '@/lib/admin'
import { executeRawPlan } from '@/lib/verify-executor'

/**
 * POST /api/admin/tasks/test-plan
 *
 * Body: {
 *   taskId: string,
 *   sampleWallet?: string,
 *   sampleTxHash?: string,
 *   sampleExternalRef?: string,
 *   sampleFingerprint?: string,
 *   adminWallet, signature, message
 * }
 *
 * Runs the stored VerificationPlan against the provided sample context
 * and returns the full step-by-step trace. Read-only.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      taskId,
      sampleWallet,
      sampleTxHash,
      sampleExternalRef,
      sampleFingerprint,
      adminWallet,
      signature,
      message,
    } = body as {
      taskId: string
      sampleWallet?: string
      sampleTxHash?: string
      sampleExternalRef?: string
      sampleFingerprint?: string
      adminWallet: string
      signature: string
      message: string
    }

    if (!taskId || !adminWallet || !signature || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const isValid = await verifyAdminSignature(adminWallet, message, signature)
    if (!isValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const task = await prisma.campaignTask.findUnique({ where: { id: taskId } })
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    if (!task.verificationPlan) {
      return NextResponse.json({ error: 'Task has no verificationPlan' }, { status: 400 })
    }

    const result = await executeRawPlan(task.verificationPlan, {
      wallet: sampleWallet,
      fingerprint: sampleFingerprint,
      txHash: sampleTxHash,
      externalRef: sampleExternalRef,
      contractAllowlist: new Set((task.contractAllowlist || []).map((a) => a.toLowerCase())),
    })

    return NextResponse.json({
      success: true,
      taskId,
      result,
    })
  } catch (error) {
    console.error('test-plan error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
