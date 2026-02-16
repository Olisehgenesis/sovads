"use client"

import { useAccount, useDisconnect } from 'wagmi'

interface WalletButtonProps {
  className?: string
  onConnect?: (address: string) => void
  onDisconnect?: () => void
}

export default function WalletButton({ className = '', onConnect, onDisconnect }: WalletButtonProps) {
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()

  const handleDisconnect = () => {
    disconnect()
    onDisconnect?.()
  }

  if (isConnected && address) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <span className="text-[11px] text-[var(--text-secondary)]">
          {address.slice(0, 6)}...{address.slice(-4)}
        </span>
        <button
          onClick={handleDisconnect}
          className="px-2 py-1 bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-primary)] text-[11px] rounded-md hover:bg-[var(--glass-bg-hover)] hover:border-[var(--glass-border-hover)] transition-colors"
        >
          Disconnect
        </button>
      </div>
    )
  }

  return <appkit-button />
}
