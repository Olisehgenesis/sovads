/**
 * SovAdsStreaming claim signing - EIP-712 operator signatures for claimWithSignature
 * Uses SOVADS_OPERATOR_PRIVATE_KEY from env to sign claims off-chain.
 * The operator must be whitelisted on-chain via addOperator().
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  keccak256,
  encodePacked,
  encodeAbiParameters,
  parseAbiParameters,
  toHex,
  concat,
} from 'viem'
import { celo } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { SOVADS_STREAMING_ADDRESS, GOODDOLLAR_ADDRESS } from './chain-config'
import { sovAdsStreamingAbi } from '../contract/sovAdsStreamingAbi'

const RPC = process.env.CELO_MAINNET_RPC_URL || 'https://rpc.ankr.com/celo'
const OPERATOR_PRIVATE_KEY = process.env.SOVADS_OPERATOR_PRIVATE_KEY

const publicClient = createPublicClient({
  chain: celo,
  transport: http(RPC),
})

const operatorAccount =
  OPERATOR_PRIVATE_KEY && /^0x[0-9a-fA-F]{64}$/.test(OPERATOR_PRIVATE_KEY)
    ? privateKeyToAccount(OPERATOR_PRIVATE_KEY as `0x${string}`)
    : null

const walletClient = operatorAccount
  ? createWalletClient({
      account: operatorAccount,
      chain: celo,
      transport: http(RPC),
    })
  : null

export const OPERATOR_ADDRESS = operatorAccount?.address || null
export const isOperatorConfigured = !!operatorAccount

/** Generate a unique claim ref */
export function generateClaimRef(recipient: string, nonce: string): `0x${string}` {
  const salt = Date.now().toString() + Math.random().toString(36).slice(2)
  return keccak256(
    encodePacked(['address', 'string', 'string'], [recipient as `0x${string}`, nonce, salt])
  )
}

/** Read the on-chain nonce for a recipient */
export async function getRecipientNonce(recipient: string): Promise<bigint> {
  return publicClient.readContract({
    address: SOVADS_STREAMING_ADDRESS as `0x${string}`,
    abi: sovAdsStreamingAbi,
    functionName: 'nonces',
    args: [recipient as `0x${string}`],
  }) as Promise<bigint>
}

/** Check if a claimRef has already been used */
export async function isClaimRefUsed(claimRef: `0x${string}`): Promise<boolean> {
  return publicClient.readContract({
    address: SOVADS_STREAMING_ADDRESS as `0x${string}`,
    abi: sovAdsStreamingAbi,
    functionName: 'usedClaimRef',
    args: [claimRef],
  }) as Promise<boolean>
}

/** Check if the configured operator is whitelisted on-chain */
export async function isOperatorWhitelisted(): Promise<boolean> {
  if (!operatorAccount) return false
  return publicClient.readContract({
    address: SOVADS_STREAMING_ADDRESS as `0x${string}`,
    abi: sovAdsStreamingAbi,
    functionName: 'operators',
    args: [operatorAccount.address],
  }) as Promise<boolean>
}

/** Read the on-chain DOMAIN_SEPARATOR (may be zero if not initialized) */
async function getOnChainDomainSeparator(): Promise<`0x${string}`> {
  return publicClient.readContract({
    address: SOVADS_STREAMING_ADDRESS as `0x${string}`,
    abi: sovAdsStreamingAbi,
    functionName: 'DOMAIN_SEPARATOR',
  }) as Promise<`0x${string}`>
}

const CLAIM_TYPEHASH = keccak256(
  new TextEncoder().encode('Claim(address recipient,uint256 amount,bytes32 claimRef,uint256 nonce,uint256 deadline)') as unknown as Uint8Array
) as `0x${string}`

/**
 * Sign a claim for a recipient using the operator key.
 * Manually computes the EIP-712 digest using the on-chain DOMAIN_SEPARATOR
 * (which may be zero if initialize() didn't set it).
 */
export async function signClaim(
  recipient: string,
  amount: bigint,
  claimRef: `0x${string}`,
  deadlineSeconds = 3600
): Promise<{
  recipient: string
  amount: string
  claimRef: `0x${string}`
  nonce: string
  deadline: string
  signature: `0x${string}`
  operator: string
}> {
  if (!operatorAccount) {
    throw new Error('SOVADS_OPERATOR_PRIVATE_KEY not configured')
  }

  const nonce = await getRecipientNonce(recipient)
  const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds)

  // Read the actual on-chain DOMAIN_SEPARATOR
  const domainSeparator = await getOnChainDomainSeparator()

  // Compute structHash exactly as the contract does
  const structHash = keccak256(
    encodeAbiParameters(
      parseAbiParameters('bytes32, address, uint256, bytes32, uint256, uint256'),
      [CLAIM_TYPEHASH, recipient as `0x${string}`, amount, claimRef, nonce, deadline]
    )
  )

  // Compute digest: keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash))
  const digest = keccak256(
    concat([toHex('\x19\x01'), domainSeparator, structHash])
  )

  // Sign the raw digest
  const signature = await operatorAccount.sign({ hash: digest })

  return {
    recipient,
    amount: amount.toString(),
    claimRef,
    nonce: nonce.toString(),
    deadline: deadline.toString(),
    signature,
    operator: operatorAccount.address,
  }
}

/**
 * Submit the claim on-chain (backend sends the tx on behalf of the user).
 * The user can also submit this themselves using the returned signature data.
 */
export async function submitClaimOnChain(
  recipient: string,
  amount: bigint,
  claimRef: `0x${string}`,
  nonce: bigint,
  deadline: bigint,
  signature: `0x${string}`
): Promise<string> {
  if (!walletClient) {
    throw new Error('SOVADS_OPERATOR_PRIVATE_KEY not configured')
  }

  const txHash = await walletClient.writeContract({
    address: SOVADS_STREAMING_ADDRESS as `0x${string}`,
    abi: sovAdsStreamingAbi,
    functionName: 'claimWithSignature',
    args: [
      recipient as `0x${string}`,
      amount,
      claimRef,
      nonce,
      deadline,
      signature,
    ],
  })
  return txHash
}

const erc20BalanceAbi = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

/** Get the G$ balance held by the streaming contract */
export async function getContractBalance(): Promise<bigint> {
  return publicClient.readContract({
    address: GOODDOLLAR_ADDRESS as `0x${string}`,
    abi: erc20BalanceAbi,
    functionName: 'balanceOf',
    args: [SOVADS_STREAMING_ADDRESS as `0x${string}`],
  })
}

/**
 * Simple "give G$ to this address" — checks balance, signs, and submits in one call.
 * Returns the tx hash.
 */
export async function sendClaim(
  recipient: string,
  amountG$: number
): Promise<{ txHash: string; claimRef: `0x${string}` }> {
  if (!operatorAccount || !walletClient) {
    throw new Error('SOVADS_OPERATOR_PRIVATE_KEY not configured')
  }

  const rawAmount = parseUnits(amountG$.toFixed(18), 18)

  // 1. Check contract has enough G$
  const balance = await getContractBalance()
  if (balance < rawAmount) {
    const have = formatUnits(balance, 18)
    throw new Error(
      `Insufficient contract balance: need ${amountG$} G$, contract has ${have} G$`
    )
  }

  // 2. Check operator is whitelisted
  const whitelisted = await isOperatorWhitelisted()
  if (!whitelisted) {
    throw new Error(
      `Operator ${operatorAccount.address} is not whitelisted. Call addOperator() on-chain first.`
    )
  }

  // 3. Build a unique claimRef from recipient + nonce
  const nonce = await getRecipientNonce(recipient)
  const claimRef = generateClaimRef(recipient, nonce.toString())

  // 4. Check not already used
  const used = await isClaimRefUsed(claimRef)
  if (used) {
    throw new Error(`Claim ref already used for this recipient/nonce`)
  }

  // 5. Sign EIP-712
  const signed = await signClaim(recipient, rawAmount, claimRef)

  // 6. Submit on-chain
  const txHash = await submitClaimOnChain(
    recipient,
    rawAmount,
    claimRef,
    BigInt(signed.nonce),
    BigInt(signed.deadline),
    signed.signature
  )

  return { txHash, claimRef }
}
