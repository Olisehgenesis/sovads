/**
 * System prompt + helpers for asking Groq to generate a VerificationPlan.
 *
 * The prompt encodes the schema and the safety rules verbatim. Groq is told to
 * output ONLY the JSON object; the OpenAI-compat `response_format: json_object`
 * provides a second guarantee.
 */

import { ALLOWED_CHAIN_IDS, ALLOWED_REFS, MAX_STEPS } from './plan-schemas'

const SCHEMA_BLOCK = `
You produce a "VerificationPlan" JSON object with this exact shape:

{
  "steps": [ /* 1..${MAX_STEPS} steps */ ],
  "combine": "AND" | "OR",
  "summary": "short human-readable explanation"
}

Each step must be ONE of these three kinds:

1. readContract — call a view function on an allowlisted contract:
   {
     "kind": "readContract",
     "chainId": ${ALLOWED_CHAIN_IDS[0]},
     "address": "0x...",                       // MUST be in contractAllowlist
     "abiFunction": "balanceOf(address)(uint256)",  // canonical Solidity signature
     "args":   [ "0xLiteral" | 123 | true | { "ref": "wallet" } ],
     "assert": { "op": ">=" | "<=" | "==" | "!=" | ">" | "<", "value": "100000000000000000000", "field": 0 }
   }

2. getBalance — native or ERC20 balance:
   {
     "kind": "getBalance",
     "chainId": ${ALLOWED_CHAIN_IDS[0]},
     "tokenAddress": "0x..." (optional; omit for native),  // MUST be in contractAllowlist if set
     "account":  { "ref": "wallet" } | "0xLiteral",
     "assert":   { "op": ">=", "value": "1000000000000000000" }
   }

3. getTransactionReceipt — inspect a tx the user supplied:
   {
     "kind": "getTransactionReceipt",
     "chainId": ${ALLOWED_CHAIN_IDS[0]},
     "txHashRef": { "ref": "txHash" },
     "assert": {
       "status": "success",
       "from": { "ref": "wallet" } (optional),
       "to":   "0x..." (optional),
       "hasLog": { "address": "0x..." (optional), "topic0": "0x..." (optional) } (optional)
     }
   }

Allowed refs in args / fields: ${ALLOWED_REFS.map((r) => '"' + r + '"').join(', ')}.

Hard rules:
- Output ONLY the JSON object. No prose. No markdown. No code fences.
- chainId must be ${ALLOWED_CHAIN_IDS[0]} (Celo mainnet) — no other chains.
- Every contract/token address you emit MUST be listed in the user's "Contract allowlist".
- Use canonical Solidity signatures only (e.g. "balanceOf(address)(uint256)").
- Use BigInt-as-string for numeric "value" (e.g. "100000000000000000000" for 100e18).
- At most ${MAX_STEPS} steps. Prefer the simplest plan that captures the intent.
- If the user's prompt is unclear or unsatisfiable, return: {"error":"<short reason>"}.
`.trim()

export function buildPlanGenerationMessages(args: {
  prompt: string
  contractAllowlist: string[]
  notes?: string
}): { role: 'system' | 'user'; content: string }[] {
  const allowlist = args.contractAllowlist.length
    ? args.contractAllowlist.map((a) => '  - ' + a).join('\n')
    : '  (empty — the user has not whitelisted any contracts yet; you must fail with {"error":"no contracts allowed"})'

  return [
    {
      role: 'system',
      content:
        'You translate natural-language ad CTA success criteria into a strict ' +
        'on-chain verification plan. Be conservative; reject anything outside the schema.\n\n' +
        SCHEMA_BLOCK,
    },
    {
      role: 'user',
      content: [
        'Contract allowlist:',
        allowlist,
        '',
        args.notes ? `Notes:\n${args.notes}\n` : '',
        'Success criteria to encode:',
        args.prompt,
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ]
}
