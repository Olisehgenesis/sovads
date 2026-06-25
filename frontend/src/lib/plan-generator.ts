/**
 * Shared plan-generation helper. Used by both the admin generate-plan route
 * and the owner-facing /api/tasks/create route so we don't duplicate Groq +
 * validation + allowlist-enforcement logic.
 */

import { groqJson, isGroqConfigured } from './groq'
import { buildPlanGenerationMessages } from './plan-prompt'
import { validateVerificationPlan, type VerificationPlan } from './plan-schemas'

export interface PlanGenerationInput {
  prompt: string
  contractAllowlist: string[]
  notes?: string
  model?: string
}

export interface PlanGenerationResult {
  plan: VerificationPlan
  modelUsed: string
  allowlist: string[] // lowercased + deduped
}

const DEFAULT_MODEL = 'llama-3.3-70b-versatile'

export class PlanGenerationError extends Error {
  status: number
  raw?: unknown
  offenders?: string[]
  constructor(message: string, status: number, extra?: { raw?: unknown; offenders?: string[] }) {
    super(message)
    this.status = status
    this.raw = extra?.raw
    this.offenders = extra?.offenders
  }
}

export async function generateVerificationPlan(
  input: PlanGenerationInput
): Promise<PlanGenerationResult> {
  if (!isGroqConfigured) {
    throw new PlanGenerationError('GROQ_API_KEY not configured', 500)
  }
  if (!input.prompt || !input.prompt.trim()) {
    throw new PlanGenerationError('prompt is required', 400)
  }

  const allowlist = Array.from(
    new Set((input.contractAllowlist || []).map((a) => (a || '').toLowerCase()).filter(Boolean))
  )
  if (allowlist.length === 0) {
    throw new PlanGenerationError('contractAllowlist must be non-empty', 400)
  }

  const modelUsed = input.model || process.env.GROQ_MODEL || DEFAULT_MODEL

  const messages = buildPlanGenerationMessages({
    prompt: input.prompt,
    contractAllowlist: allowlist,
    notes: input.notes,
  })

  const raw = await groqJson<Record<string, unknown>>({
    messages,
    model: modelUsed,
    temperature: 0.1,
  })

  if (raw && typeof raw === 'object' && 'error' in raw && typeof raw.error === 'string') {
    throw new PlanGenerationError(`model refused: ${raw.error}`, 422, { raw })
  }

  let plan: VerificationPlan
  try {
    plan = validateVerificationPlan(raw)
  } catch (e) {
    throw new PlanGenerationError(
      'invalid plan: ' + (e instanceof Error ? e.message : 'unknown'),
      422,
      { raw }
    )
  }

  const allowSet = new Set(allowlist)
  const used: string[] = []
  for (const step of plan.steps) {
    if (step.kind === 'readContract') used.push(step.address.toLowerCase())
    if (step.kind === 'getBalance' && step.tokenAddress)
      used.push(step.tokenAddress.toLowerCase())
  }
  const offenders = used.filter((a) => !allowSet.has(a))
  if (offenders.length) {
    throw new PlanGenerationError(
      'plan references non-allowlisted addresses',
      422,
      { offenders, raw: plan }
    )
  }

  return { plan, modelUsed, allowlist }
}
