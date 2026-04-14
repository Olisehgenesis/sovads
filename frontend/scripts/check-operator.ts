import { createPublicClient, http } from 'viem'
import { celo } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'

async function main() {
  const key = process.env.SOVADS_OPERATOR_PRIVATE_KEY
  if (!key) { console.log('SOVADS_OPERATOR_PRIVATE_KEY not set'); return }

  const normalizedKey = key.startsWith('0x') ? key : ('0x' + key)
  console.log('Key len (raw):', key.length, '| starts with 0x:', key.startsWith('0x'))
  console.log('Regex match (raw):', /^0x[0-9a-fA-F]{64}$/.test(key))
  console.log('Regex match (normalized):', /^0x[0-9a-fA-F]{64}$/.test(normalizedKey))

  const account = privateKeyToAccount(normalizedKey as `0x${string}`)
  console.log('Operator address from key:', account.address)

  const STREAMING = (process.env.NEXT_PUBLIC_SOVADS_STREAMING_ADDRESS || '0xFb76103FC70702413cEa55805089106D0626823f').trim()
  console.log('Streaming contract:', STREAMING)

  const client = createPublicClient({
    chain: celo,
    transport: http(process.env.CELO_MAINNET_RPC_URL || 'https://rpc.ankr.com/celo'),
  })

  const abi = [{
    inputs: [{ name: '', type: 'address' }],
    name: 'operators',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  }] as const

  const isWL = await client.readContract({
    address: STREAMING as `0x${string}`,
    abi,
    functionName: 'operators',
    args: [account.address],
  })
  console.log('Whitelisted on-chain:', isWL)

  const ownerAbi = [{
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  }] as const

  const owner = await client.readContract({
    address: STREAMING as `0x${string}`,
    abi: ownerAbi,
    functionName: 'owner',
  })
  console.log('Contract owner:', owner)
}

main().catch(console.error)
