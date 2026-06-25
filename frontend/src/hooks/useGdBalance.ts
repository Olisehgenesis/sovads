'use client'

import { useReadContract } from 'wagmi'
import { formatUnits } from 'viem'
import { GOODDOLLAR_ADDRESS, chainId } from '@/lib/chain-config'

const ERC20_BALANCE_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const

/**
 * Reads the connected wallet's G$ (GoodDollar) balance on Celo. Refreshes
 * every 15s while the component is mounted.
 *
 * Returns `null` while loading or if no address is provided.
 */
export function useGdBalance(address: string | undefined) {
  const { data: raw, refetch, isLoading } = useReadContract({
    address: GOODDOLLAR_ADDRESS as `0x${string}`,
    abi: ERC20_BALANCE_ABI,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    chainId,
    query: { refetchInterval: 15_000, enabled: !!address },
  })

  const balance = raw != null ? parseFloat(formatUnits(raw as bigint, 18)) : null
  const formatted = balance != null ? balance.toFixed(2) : null

  return { balance, formatted, isLoading, refetch }
}
