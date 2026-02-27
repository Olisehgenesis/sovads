"use client"

import { useEffect, useMemo, useState } from 'react'
import { formatUnits } from 'viem'
import { useAccount, useDisconnect, useReadContracts } from 'wagmi'
import { CELO_MAINNET_TOKENS } from '@/lib/tokens'

interface WalletButtonProps {
  className?: string
  onConnect?: (address: string) => void
  onDisconnect?: () => void
}

const ERC20_BALANCE_OF_ABI = [
  {
    constant: true,
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
] as const

const formatBalance = (value: bigint, decimals: number): string => {
  const full = formatUnits(value, decimals)
  const asNumber = Number(full)
  if (!Number.isFinite(asNumber)) return full
  if (asNumber >= 1000) return asNumber.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (asNumber >= 1) return asNumber.toLocaleString(undefined, { maximumFractionDigits: 4 })
  return asNumber.toLocaleString(undefined, { maximumFractionDigits: 6 })
}

export default function WalletButton({ className = '', onConnect, onDisconnect }: WalletButtonProps) {
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const [showBalances, setShowBalances] = useState(false)
  const [sovAddressFromDb, setSovAddressFromDb] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/tokens/sov')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active) return
        const addr = typeof data?.address === 'string' ? data.address : null
        if (addr && /^0x[a-fA-F0-9]{40}$/.test(addr)) {
          setSovAddressFromDb(addr)
        }
      })
      .catch(() => {
        // Optional token; ignore failures silently.
      })

    return () => {
      active = false
    }
  }, [])

  const tokensToShow = useMemo(() => {
    const values = Object.values(CELO_MAINNET_TOKENS)
    const bySymbol = (symbol: string) => values.find((t) => t.symbol === symbol)
    const base = ['G$', 'cUSD', 'USDC', 'USDT']
      .map((symbol) => bySymbol(symbol))
      .filter((token): token is NonNullable<typeof token> => Boolean(token))

    if (sovAddressFromDb && /^0x[a-fA-F0-9]{40}$/.test(sovAddressFromDb)) {
      base.push({
        symbol: 'SOV',
        name: 'SovAds Token',
        decimals: 18,
        address: sovAddressFromDb,
      })
    }
    return base
  }, [sovAddressFromDb])

  const { data: balancesData, isLoading: balancesLoading } = useReadContracts({
    allowFailure: true,
    contracts: address
      ? tokensToShow.map((token) => ({
        address: token.address as `0x${string}`,
        abi: ERC20_BALANCE_OF_ABI,
        functionName: 'balanceOf',
        args: [address as `0x${string}`],
      }))
      : [],
    query: {
      enabled: Boolean(address && showBalances),
      refetchInterval: 15000,
    },
  })

  const handleDisconnect = () => {
    disconnect()
    setShowBalances(false)
    onDisconnect?.()
  }

  if (isConnected && address) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <button
          onClick={() => setShowBalances(true)}
          className="btn btn-outline px-3 py-1 text-xs"
          title="Open wallet balances"
        >
          {address.slice(0, 6)}...{address.slice(-4)}
        </button>
        <button
          onClick={handleDisconnect}
          className="btn btn-primary px-3 py-1 text-xs"
        >
          Disconnect
        </button>

        {showBalances && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowBalances(false)} />
            <div className="relative z-10 w-full max-w-sm border-2 border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6">
              <div className="flex items-center justify-between mb-4 border-b-2 border-black pb-2">
                <div>
                  <h3 className="text-lg font-heading uppercase text-black">Wallet</h3>
                  <p className="font-mono text-[10px] text-gray-600">
                    {address}
                  </p>
                </div>
                <button
                  onClick={() => setShowBalances(false)}
                  className="btn btn-outline px-2 py-1 text-[10px]"
                >
                  Close
                </button>
              </div>

              <div className="space-y-3">
                {tokensToShow.map((token, index) => {
                  const raw = balancesData?.[index]?.result as bigint | undefined
                  const amount = raw !== undefined ? formatBalance(raw, token.decimals) : '0'
                  return (
                    <div
                      key={token.symbol}
                      className="flex items-center justify-between border-2 border-black bg-[#F5F3F0] px-4 py-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                    >
                      <div>
                        <div className="text-xs font-bold text-black">{token.symbol}</div>
                        <div className="text-[10px] uppercase text-gray-600 font-heading">{token.name}</div>
                      </div>
                      <div className="text-sm font-bold text-black">
                        {balancesLoading ? '...' : amount}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return <appkit-button />
}
