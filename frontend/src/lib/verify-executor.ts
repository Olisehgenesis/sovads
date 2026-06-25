/**
 * Read-only executor for VerificationPlan JSON.
 *
 * Safety boundaries:
 *   - Only the 3 viem read primitives are exposed (readContract / getBalance /
 *     getTransactionReceipt). No `writeContract`, ever.
 *   - All contract addresses used by the plan MUST appear in the per-task
 *     contractAllowlist passed in here. Anything else → hard reject.
 *   - Total RPC calls capped (MAX_RPC_CALLS).
 *   - Args resolve from a small literal set; `wallet`, `txHash`, etc. come
 *     from the runtime context, never from environment / DB lookups.
 *   - All assertions return per-step pass/fail with a structured trace so
 *     the admin "test plan" UI can show what happened.
 */

import {
  createPublicClient,
  http,
  parseAbiItem,
  type AbiFunction,
  type Address,
  type Hash,
  type PublicClient,
  type Log,
} from 'viem'
import { celo } from 'viem/chains'
import {
  MAX_RPC_CALLS,
  validateVerificationPlan,
  type ArgValue,
  type AssertSpec,
  type VerificationPlan,
  type VerifyStep,
} from './plan-schemas'

const RPC_CELO = (process.env.CELO_MAINNET_RPC_URL || 'https://rpc.ankr.com/celo').trim()

function clientFor(chainId: number): PublicClient {
  if (chainId === 42220) {
    return createPublicClient({ chain: celo, transport: http(RPC_CELO) }) as PublicClient
  }
  throw new Error(`unsupported chainId ${chainId}`)
}

export interface ExecuteContext {
  wallet?: string
  fingerprint?: string
  txHash?: string
  externalRef?: string
  /** Per-task whitelist of allowed contract addresses (lowercased). */
  contractAllowlist: Set<string>
}

export interface StepTrace {
  index: number
  kind: VerifyStep['kind']
  ok: boolean
  message: string
  details?: Record<string, unknown>
}

export interface ExecuteResult {
  ok: boolean
  combine: 'AND' | 'OR'
  steps: StepTrace[]
  rpcCalls: number
  durationMs: number
  error?: string
}

function lower(a: string | undefined | null): string {
  return (a || '').toLowerCase()
}

function resolveArg(arg: ArgValue, ctx: ExecuteContext): unknown {
  if (arg && typeof arg === 'object' && 'ref' in arg) {
    switch (arg.ref) {
      case 'wallet':
        if (!ctx.wallet) throw new Error('wallet ref unresolved')
        return ctx.wallet
      case 'fingerprint':
        if (!ctx.fingerprint) throw new Error('fingerprint ref unresolved')
        return ctx.fingerprint
      case 'now':
        return Math.floor(Date.now() / 1000).toString()
      case 'txHash':
        if (!ctx.txHash) throw new Error('txHash ref unresolved')
        return ctx.txHash
      case 'externalRef':
        if (!ctx.externalRef) throw new Error('externalRef ref unresolved')
        return ctx.externalRef
    }
  }
  return arg
}

function compare(op: AssertSpec['op'], a: unknown, b: string): boolean {
  // Bigint comparison if both look numeric.
  const isNumericStr = (s: string) => /^-?\d+$/.test(s)
  const aStr = typeof a === 'bigint' ? a.toString() : String(a)

  if (isNumericStr(aStr) && isNumericStr(b)) {
    const ai = BigInt(aStr)
    const bi = BigInt(b)
    switch (op) {
      case '==':
        return ai === bi
      case '!=':
        return ai !== bi
      case '>':
        return ai > bi
      case '>=':
        return ai >= bi
      case '<':
        return ai < bi
      case '<=':
        return ai <= bi
    }
  }
  // Address / bytes / string equality only.
  if (op === '==') return lower(aStr) === lower(b)
  if (op === '!=') return lower(aStr) !== lower(b)
  throw new Error(`operator ${op} not valid for non-numeric value`)
}

function selectField(result: unknown, field: AssertSpec['field']): unknown {
  if (field === undefined || field === null) return result
  if (Array.isArray(result)) {
    const idx = typeof field === 'number' ? field : Number(field)
    if (!Number.isFinite(idx) || idx < 0 || idx >= result.length) {
      throw new Error(`field index ${field} out of range`)
    }
    return result[idx]
  }
  if (result && typeof result === 'object') {
    if (typeof field === 'string' && field in (result as Record<string, unknown>)) {
      return (result as Record<string, unknown>)[field]
    }
  }
  throw new Error(`cannot select field "${String(field)}" on non-tuple result`)
}

function ensureAllowed(addr: string, ctx: ExecuteContext): void {
  if (!ctx.contractAllowlist.has(addr.toLowerCase())) {
    throw new Error(`address ${addr} not in contractAllowlist`)
  }
}

async function runStep(
  step: VerifyStep,
  ctx: ExecuteContext,
  budget: { rpcCalls: number }
): Promise<{ ok: boolean; message: string; details?: Record<string, unknown> }> {
  if (budget.rpcCalls >= MAX_RPC_CALLS) throw new Error('RPC budget exhausted')

  const client = clientFor(step.chainId)

  switch (step.kind) {
    case 'readContract': {
      ensureAllowed(step.address, ctx)
      let abiItem: AbiFunction
      try {
        const parsed = parseAbiItem(`function ${step.abiFunction}`)
        if (parsed.type !== 'function') throw new Error('not a function')
        abiItem = parsed as AbiFunction
      } catch (e) {
        return { ok: false, message: `bad abiFunction: ${e instanceof Error ? e.message : 'parse error'}` }
      }
      const resolvedArgs = step.args.map((a) => resolveArg(a, ctx))
      budget.rpcCalls++
      let raw: unknown
      try {
        raw = await client.readContract({
          address: step.address as Address,
          abi: [abiItem],
          functionName: abiItem.name as string,
          args: resolvedArgs as readonly unknown[],
        })
      } catch (e) {
        return { ok: false, message: `RPC failed: ${e instanceof Error ? e.message : 'unknown'}` }
      }
      let observed: unknown = raw
      try {
        observed = selectField(raw, step.assert.field)
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : 'field selection failed' }
      }
      const passed = compare(step.assert.op, observed, step.assert.value)
      return {
        ok: passed,
        message: `${step.abiFunction} → ${String(observed)} ${step.assert.op} ${step.assert.value} → ${passed ? 'PASS' : 'FAIL'}`,
        details: { observed: typeof observed === 'bigint' ? observed.toString() : observed },
      }
    }

    case 'getBalance': {
      const account = resolveArg(step.account, ctx) as string
      if (!/^0x[0-9a-fA-F]{40}$/.test(account)) {
        return { ok: false, message: `invalid account ${account}` }
      }
      budget.rpcCalls++
      let balance: bigint
      try {
        if (step.tokenAddress) {
          ensureAllowed(step.tokenAddress, ctx)
          balance = (await client.readContract({
            address: step.tokenAddress as Address,
            abi: [parseAbiItem('function balanceOf(address) view returns (uint256)')] as AbiFunction[],
            functionName: 'balanceOf',
            args: [account as Address],
          })) as bigint
        } else {
          balance = await client.getBalance({ address: account as Address })
        }
      } catch (e) {
        return { ok: false, message: `RPC failed: ${e instanceof Error ? e.message : 'unknown'}` }
      }
      const passed = compare(step.assert.op, balance, step.assert.value)
      return {
        ok: passed,
        message: `balance(${account}) → ${balance.toString()} ${step.assert.op} ${step.assert.value} → ${passed ? 'PASS' : 'FAIL'}`,
        details: { balance: balance.toString() },
      }
    }

    case 'getTransactionReceipt': {
      const txHash = resolveArg(step.txHashRef, ctx) as string
      if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
        return { ok: false, message: `invalid txHash ${txHash}` }
      }
      budget.rpcCalls++
      let receipt
      try {
        receipt = await client.getTransactionReceipt({ hash: txHash as Hash })
      } catch (e) {
        return { ok: false, message: `receipt fetch failed: ${e instanceof Error ? e.message : 'unknown'}` }
      }
      const wantStatus = step.assert.status
      if ((receipt.status === 'success') !== (wantStatus === 'success')) {
        return { ok: false, message: `status ${receipt.status} != expected ${wantStatus}` }
      }
      if (step.assert.to) {
        if (lower(receipt.to) !== lower(step.assert.to)) {
          return { ok: false, message: `to ${receipt.to} != expected ${step.assert.to}` }
        }
      }
      if (step.assert.from) {
        const expectedFrom = resolveArg(step.assert.from, ctx) as string
        if (lower(receipt.from) !== lower(expectedFrom)) {
          return { ok: false, message: `from ${receipt.from} != expected ${expectedFrom}` }
        }
      }
      if (step.assert.hasLog) {
        const { address, topic0 } = step.assert.hasLog
        const matched = (receipt.logs as Log[]).some((log) => {
          if (address && lower(log.address) !== lower(address)) return false
          if (topic0 && lower(log.topics[0]) !== lower(topic0)) return false
          return true
        })
        if (!matched) return { ok: false, message: `expected log not found` }
      }
      return { ok: true, message: `receipt ${txHash.slice(0, 10)}… PASS`, details: { blockNumber: receipt.blockNumber.toString() } }
    }
  }
}

export async function executeVerificationPlan(
  plan: VerificationPlan,
  ctx: ExecuteContext
): Promise<ExecuteResult> {
  const started = Date.now()
  const budget = { rpcCalls: 0 }
  const traces: StepTrace[] = []
  let error: string | undefined

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i]
    try {
      const r = await runStep(step, ctx, budget)
      traces.push({ index: i, kind: step.kind, ok: r.ok, message: r.message, details: r.details })
      // Short-circuit AND on first failure; OR on first success.
      if (plan.combine === 'AND' && !r.ok) break
      if (plan.combine === 'OR' && r.ok) break
    } catch (e) {
      error = e instanceof Error ? e.message : 'step crashed'
      traces.push({ index: i, kind: step.kind, ok: false, message: error })
      break
    }
  }

  const okSteps = traces.filter((t) => t.ok).length
  const ok =
    !error &&
    (plan.combine === 'AND' ? okSteps === plan.steps.length : okSteps > 0)

  return {
    ok,
    combine: plan.combine,
    steps: traces,
    rpcCalls: budget.rpcCalls,
    durationMs: Date.now() - started,
    error,
  }
}

/** Validate-then-execute helper for callers that have unvalidated JSON. */
export async function executeRawPlan(
  rawPlan: unknown,
  ctx: ExecuteContext
): Promise<ExecuteResult> {
  let plan: VerificationPlan
  try {
    plan = validateVerificationPlan(rawPlan)
  } catch (e) {
    return {
      ok: false,
      combine: 'AND',
      steps: [],
      rpcCalls: 0,
      durationMs: 0,
      error: e instanceof Error ? e.message : 'invalid plan',
    }
  }
  return executeVerificationPlan(plan, ctx)
}
