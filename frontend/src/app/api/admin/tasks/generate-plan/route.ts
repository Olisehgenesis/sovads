import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { verifyAdminSignature } from '@/lib/admin'
import { generateVerificationPlan, PlanGenerationError } from '@/lib/plan-generator'

/**
 * POST /api/admin/tasks/generate-plan
 *
 * Body: {
 *   taskId: string,                         // existing CampaignTask to attach plan to
 *   prompt: string,                         // natural-language success criteria
 *   contractAllowlist?: string[],           // overrides task.contractAllowlist if provided
 *   notes?: string,
 *   model?: string,                         // optional Groq model override
 *   adminWallet, signature, message         // admin EIP-191 signature
 * }
 *
 * Bypasses approval gate (per user). The plan is generated, validated, saved.
 * It is immediately live for verification once the task's verifier is set to AI_PLAN.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      taskId,
      prompt,
      contractAllowlist,
      notes,
      model,
      adminWallet,
      signature,
      message,
    } = body as {
      taskId: string
      prompt: string
      contractAllowlist?: string[]
      notes?: string
      model?: string
      adminWallet: string
      signature: string
      message: string
    }

    if (!taskId || !prompt || !adminWallet || !signature || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const isValid = await verifyAdminSignature(adminWallet, message, signature)
    if (!isValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const task = await prisma.campaignTask.findUnique({ where: { id: taskId } })
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    const effectiveAllowlist = contractAllowlist?.length
      ? contractAllowlist
      : task.contractAllowlist || []

    let generated
    try {
      generated = await generateVerificationPlan({
        prompt,
        contractAllowlist: effectiveAllowlist,
        notes,
        model,
      })
    } catch (e) {
      if (e instanceof PlanGenerationError) {
        return NextResponse.json(
          { error: e.message, raw: e.raw, offenders: e.offenders },
          { status: e.status }
        )
      }
      throw e
    }

    const planJson = JSON.parse(JSON.stringify(generated.plan)) as Prisma.InputJsonValue
    const updated = await prisma.campaignTask.update({
      where: { id: taskId },
      data: {
        verifier: 'AI_PLAN',
        verificationPlan: planJson,
        contractAllowlist: generated.allowlist,
        planAuthor: adminWallet.toLowerCase(),
        planModel: generated.modelUsed,
        planPrompt: prompt,
        planGeneratedAt: new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      plan: generated.plan,
      task: {
        id: updated.id,
        verifier: updated.verifier,
        planGeneratedAt: updated.planGeneratedAt,
      },
    })
  } catch (error) {
    console.error('generate-plan error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
