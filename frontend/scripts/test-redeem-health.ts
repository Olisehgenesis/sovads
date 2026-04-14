import { createPublicClient, http, keccak256, encodePacked, parseUnits, encodeAbiParameters, parseAbiParameters, toHex, concat } from 'viem'
import { celo } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'

async function main() {
  const key = process.env.SOVADS_OPERATOR_PRIVATE_KEY!
  const normalizedKey = key.startsWith('0x') ? key : ('0x' + key)
  const account = privateKeyToAccount(normalizedKey as `0x${string}`)
  
  const STREAMING = (process.env.NEXT_PUBLIC_SOVADS_STREAMING_ADDRESS || '0xFb76103FC70702413cEa55805089106D0626823f').trim()
  const RPC = process.env.CELO_MAINNET_RPC_URL || 'https://rpc.ankr.com/celo'

  const client = createPublicClient({ chain: celo, transport: http(RPC) })

  console.log('=== REDEEM HEALTH CHECK ===')
  console.log('Operator address:', account.address)
  console.log('Streaming contract:', STREAMING)

  // Check whitelist
  const abi = [
    { inputs: [{ name: '', type: 'address' }], name: 'operators', outputs: [{ name: '', type: 'bool' }], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'DOMAIN_SEPARATOR', outputs: [{ name: '', type: 'bytes32' }], stateMutability: 'view', type: 'function' },
    { inputs: [{ name: '', type: 'address' }], name: 'nonces', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { inputs: [{ name: '', type: 'bytes32' }], name: 'usedClaimRef', outputs: [{ name: '', type: 'bool' }], stateMutability: 'view', type: 'function' },
  ] as const

  const isWL = await client.readContract({ address: STREAMING as `0x${string}`, abi, functionName: 'operators', args: [account.address] })
  console.log('Whitelisted on-chain:', isWL)

  // Check on-chain domain separator
  const onChainDS = await client.readContract({ address: STREAMING as `0x${string}`, abi, functionName: 'DOMAIN_SEPARATOR' })
  console.log('On-chain DOMAIN_SEPARATOR:', onChainDS)

  // Check if contract has eip712Domain function (EIP-5267)
  try {
    const eip712Abi = [{
      inputs: [],
      name: 'eip712Domain',
      outputs: [
        { name: 'fields', type: 'bytes1' },
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
        { name: 'salt', type: 'bytes32' },
        { name: 'extensions', type: 'uint256[]' },
      ],
      stateMutability: 'view',
      type: 'function',
    }] as const
    const domain = await client.readContract({ address: STREAMING as `0x${string}`, abi: eip712Abi, functionName: 'eip712Domain' })
    console.log('eip712Domain:', domain)
  } catch (e: any) {
    console.log('eip712Domain: not available -', e.message?.slice(0, 100))
  }

  // Compute what we'd use for signing
  const CLAIM_TYPEHASH = keccak256(
    new TextEncoder().encode('Claim(address recipient,uint256 amount,bytes32 claimRef,uint256 nonce,uint256 deadline)')
  )
  console.log('CLAIM_TYPEHASH:', CLAIM_TYPEHASH)

  // Test a sign + verify cycle
  const testRecipient = '0x53eaF4CD171842d8144e45211308e5D90B4b0088'
  const nonce = await client.readContract({ address: STREAMING as `0x${string}`, abi, functionName: 'nonces', args: [testRecipient as `0x${string}`] })
  console.log('Recipient nonce:', nonce.toString())

  const claimRef = keccak256(encodePacked(['address', 'string'], [testRecipient as `0x${string}`, nonce.toString()]))
  console.log('ClaimRef:', claimRef)
  
  const used = await client.readContract({ address: STREAMING as `0x${string}`, abi, functionName: 'usedClaimRef', args: [claimRef] })
  console.log('ClaimRef already used:', used)

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)
  const amount = parseUnits('1', 18) // 1 G$

  // Sign EXACTLY as the contract verifies: using the on-chain DOMAIN_SEPARATOR (zero)
  const structHash = keccak256(
    encodeAbiParameters(
      parseAbiParameters('bytes32, address, uint256, bytes32, uint256, uint256'),
      [CLAIM_TYPEHASH, testRecipient as `0x${string}`, amount, claimRef, nonce, deadline]
    )
  )
  const digest = keccak256(
    concat([toHex('\x19\x01'), onChainDS, structHash])
  )
  console.log('Digest:', digest)
  
  const signature = await account.sign({ hash: digest })
  console.log('Signature:', signature)
  console.log('Signature length:', signature.length)

  // Simulate the call (static call) to check if it would succeed
  try {
    const simAbi = [{
      inputs: [
        { name: '_recipient', type: 'address' },
        { name: '_amount', type: 'uint256' },
        { name: '_claimRef', type: 'bytes32' },
        { name: '_nonce', type: 'uint256' },
        { name: '_deadline', type: 'uint256' },
        { name: '_signature', type: 'bytes' },
      ],
      name: 'claimWithSignature',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    }] as const

    await client.simulateContract({
      address: STREAMING as `0x${string}`,
      abi: simAbi,
      functionName: 'claimWithSignature',
      args: [
        testRecipient as `0x${string}`,
        amount,
        claimRef,
        nonce,
        deadline,
        signature as `0x${string}`,
      ],
      account: testRecipient as `0x${string}`,
    })
    console.log('✅ Simulation PASSED — claimWithSignature would succeed!')
  } catch (e: any) {
    console.log('❌ Simulation FAILED:', e.message?.slice(0, 200))
  }
  
  console.log('\n=== DONE ===')
}

main().catch(console.error)
