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
          className="px-2 py-1 bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-primary)] text-[11px] rounded-md hover:bg-[var(--glass-bg-hover)] hover:border-[var(--glass-border-hover)] transition-colors"
          title="Open wallet balances"
        >
          {address.slice(0, 6)}...{address.slice(-4)}
        </button>
        <button
          onClick={handleDisconnect}
          className="px-2 py-1 bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-primary)] text-[11px] rounded-md hover:bg-[var(--glass-bg-hover)] hover:border-[var(--glass-border-hover)] transition-colors"
        >
          Disconnect
        </button>

        {showBalances && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowBalances(false)} />
            <div className="relative z-10 w-full max-w-sm rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">Wallet Balances</h3>
                  <p className="text-[10px] text-[var(--text-secondary)]">
                    {address.slice(0, 6)}...{address.slice(-4)}
                  </p>
                </div>
                <button
                  onClick={() => setShowBalances(false)}
                  className="px-2 py-1 text-[11px] rounded-md border border-[var(--glass-border)] hover:bg-[var(--glass-bg-hover)]"
                >
                  Close
                </button>
              </div>

              <div className="space-y-2">
                {tokensToShow.map((token, index) => {
                  const raw = balancesData?.[index]?.result as bigint | undefined
                  const amount = raw !== undefined ? formatBalance(raw, token.decimals) : '0'
                  return (
                    <div
                      key={token.symbol}
                      className="flex items-center justify-between rounded-md border border-[var(--glass-border)] px-3 py-2"
                    >
                      <div>
                        <div className="text-xs font-medium text-[var(--text-primary)]">{token.symbol}</div>
                        <div className="text-[10px] text-[var(--text-secondary)]">{token.name}</div>
                      </div>
                      <div className="text-xs font-semibold text-[var(--text-primary)]">
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
