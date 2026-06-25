/**
 * Hand-rolled validators for AI-generated VerificationPlan / ActionPlan JSON.
 *
 * Why not zod? Avoiding a new dep. These shapes are small and the validation
 * surface is strict + auditable.
 *
 * Hard limits enforced here (executor also re-checks):
 *   - Plan has at most 5 steps.
 *   - All chainIds must be in ALLOWED_CHAIN_IDS.
 *   - Every contract address used by `readContract` / `getLogs` MUST be in the
 *     per-task `contractAllowlist` (checked by the executor, not here).
 *   - `abiFunction` is a canonical signature string; we parse it with viem.
 *   - Args are restricted to literals or {ref:string} from a small set.
 */

export const ALLOWED_CHAIN_IDS = [42220] as const // Celo only for v1
export type AllowedChainId = (typeof ALLOWED_CHAIN_IDS)[number]

export const ALLOWED_REFS = ['wallet', 'fingerprint', 'now', 'txHash', 'externalRef'] as const
export type AllowedRef = (typeof ALLOWED_REFS)[number]

export type ArgValue = string | number | boolean | { ref: AllowedRef }

export interface AssertSpec {
  op: '==' | '!=' | '>' | '>=' | '<' | '<='
  value: string // string for cross-type safety; cast happens in executor
  field?: number | string // for tuple/struct output selection
}

export interface ReadContractStep {
  kind: 'readContract'
  chainId: AllowedChainId
  address: string
  /** Canonical signature, e.g. "balanceOf(address)(uint256)" */
  abiFunction: string
  args: ArgValue[]
  assert: AssertSpec
}

export interface GetBalanceStep {
  kind: 'getBalance'
  chainId: AllowedChainId
  /** ERC20 token address; null/undefined = native */
  tokenAddress?: string
  account: ArgValue
  assert: AssertSpec
}

export interface ReceiptAssert {
  status: 'success' | 'reverted'
  from?: ArgValue
  to?: string
  hasLog?: { address?: string; topic0?: string }
}

export interface GetTransactionReceiptStep {
  kind: 'getTransactionReceipt'
  chainId: AllowedChainId
  txHashRef: ArgValue
  assert: ReceiptAssert
}

export type VerifyStep = ReadContractStep | GetBalanceStep | GetTransactionReceiptStep

export interface VerificationPlan {
  steps: VerifyStep[]
  combine: 'AND' | 'OR'
  /** Optional human-readable summary for admin UI */
  summary?: string
}

export const MAX_STEPS = 5
export const MAX_RPC_CALLS = 10

const isHexAddress = (v: unknown): v is string =>
  typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v)
const isHex32 = (v: unknown): v is string =>
  typeof v === 'string' && /^0x[0-9a-fA-F]{64}$/.test(v)

function assertArgValue(v: unknown, path: string): asserts v is ArgValue {
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return
  if (v && typeof v === 'object' && 'ref' in v) {
    const ref = (v as Record<string, unknown>).ref
    if (typeof ref === 'string' && (ALLOWED_REFS as readonly string[]).includes(ref)) return
    throw new Error(`${path}: invalid ref "${String(ref)}"`)
  }
  throw new Error(`${path}: must be primitive or {ref:string}`)
}

function assertAssert(v: unknown, path: string): asserts v is AssertSpec {
  if (!v || typeof v !== 'object') throw new Error(`${path}: missing assert`)
  const a = v as Record<string, unknown>
  if (!['==', '!=', '>', '>=', '<', '<='].includes(a.op as string)) {
    throw new Error(`${path}.op: invalid operator`)
  }
  if (typeof a.value !== 'string') throw new Error(`${path}.value: must be string`)
  if (a.field != null && typeof a.field !== 'number' && typeof a.field !== 'string') {
    throw new Error(`${path}.field: must be number|string|undefined`)
  }
}

function assertChainId(v: unknown, path: string): asserts v is AllowedChainId {
  if (typeof v !== 'number' || !(ALLOWED_CHAIN_IDS as readonly number[]).includes(v)) {
    throw new Error(`${path}: chainId must be one of ${ALLOWED_CHAIN_IDS.join(',')}`)
  }
}

export function validateVerificationPlan(raw: unknown): VerificationPlan {
  if (!raw || typeof raw !== 'object') throw new Error('plan must be an object')
  const p = raw as Record<string, unknown>

  if (!Array.isArray(p.steps)) throw new Error('plan.steps must be an array')
  if (p.steps.length === 0) throw new Error('plan.steps must have at least one step')
  if (p.steps.length > MAX_STEPS) throw new Error(`plan.steps must have at most ${MAX_STEPS} steps`)
  if (p.combine !== 'AND' && p.combine !== 'OR') throw new Error('plan.combine must be AND|OR')

  const steps: VerifyStep[] = p.steps.map((s, i) => {
    const path = `steps[${i}]`
    if (!s || typeof s !== 'object') throw new Error(`${path}: must be object`)
    const so = s as Record<string, unknown>

    switch (so.kind) {
      case 'readContract': {
        assertChainId(so.chainId, `${path}.chainId`)
        if (!isHexAddress(so.address)) throw new Error(`${path}.address: invalid`)
        if (typeof so.abiFunction !== 'string' || so.abiFunction.length > 200) {
          throw new Error(`${path}.abiFunction: must be canonical signature string`)
        }
        if (!Array.isArray(so.args)) throw new Error(`${path}.args: must be array`)
        ;(so.args as unknown[]).forEach((a, j) => assertArgValue(a, `${path}.args[${j}]`))
        assertAssert(so.assert, `${path}.assert`)
        return {
          kind: 'readContract',
          chainId: so.chainId,
          address: so.address,
          abiFunction: so.abiFunction,
          args: so.args as ArgValue[],
          assert: so.assert as AssertSpec,
        }
      }

      case 'getBalance': {
        assertChainId(so.chainId, `${path}.chainId`)
        if (so.tokenAddress != null && !isHexAddress(so.tokenAddress)) {
          throw new Error(`${path}.tokenAddress: invalid`)
        }
        assertArgValue(so.account, `${path}.account`)
        assertAssert(so.assert, `${path}.assert`)
        return {
          kind: 'getBalance',
          chainId: so.chainId,
          tokenAddress: typeof so.tokenAddress === 'string' ? so.tokenAddress : undefined,
          account: so.account as ArgValue,
          assert: so.assert as AssertSpec,
        }
      }

      case 'getTransactionReceipt': {
        assertChainId(so.chainId, `${path}.chainId`)
        assertArgValue(so.txHashRef, `${path}.txHashRef`)
        if (!so.assert || typeof so.assert !== 'object') throw new Error(`${path}.assert: required`)
        const ra = so.assert as Record<string, unknown>
        if (ra.status !== 'success' && ra.status !== 'reverted') {
          throw new Error(`${path}.assert.status: must be success|reverted`)
        }
        if (ra.to != null && !isHexAddress(ra.to)) throw new Error(`${path}.assert.to: invalid`)
        if (ra.hasLog) {
          const hl = ra.hasLog as Record<string, unknown>
          if (hl.address != null && !isHexAddress(hl.address)) {
            throw new Error(`${path}.assert.hasLog.address: invalid`)
          }
          if (hl.topic0 != null && !isHex32(hl.topic0)) {
            throw new Error(`${path}.assert.hasLog.topic0: invalid bytes32`)
          }
        }
        if (ra.from != null) assertArgValue(ra.from, `${path}.assert.from`)
        return {
          kind: 'getTransactionReceipt',
          chainId: so.chainId,
          txHashRef: so.txHashRef as ArgValue,
          assert: ra as unknown as ReceiptAssert,
        }
      }

      default:
        throw new Error(`${path}.kind: must be readContract|getBalance|getTransactionReceipt`)
    }
  })

  return {
    steps,
    combine: p.combine as 'AND' | 'OR',
    summary: typeof p.summary === 'string' ? p.summary : undefined,
  }
}
