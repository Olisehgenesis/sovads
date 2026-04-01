"use client"

import { useAppKit } from '@reown/appkit/react'
import { useEffect, useState } from 'react'
import { useAccount, useDisconnect } from 'wagmi'

interface WalletButtonProps {
  className?: string
  connectedClassName?: string
  connectedAsButton?: boolean
  hideWhenDisconnected?: boolean
  onConnect?: (address: string) => void
  onDisconnect?: () => void
  tone?: 'light' | 'dark'
}

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export default function WalletButton({
  className = '',
  connectedClassName = '',
  connectedAsButton = false,
  hideWhenDisconnected = false,
  onConnect,
  onDisconnect,
  tone = 'dark',
}: WalletButtonProps) {
  const { open } = useAppKit()
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const [showWalletModal, setShowWalletModal] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (isConnected && address) {
      onConnect?.(address)
    }
  }, [address, isConnected, onConnect])

  useEffect(() => {
    if (!showWalletModal) {
      setCopied(false)
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowWalletModal(false)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [showWalletModal])

  const handleCopy = async () => {
    if (!address || !navigator.clipboard) {
      return
    }

    await navigator.clipboard.writeText(address)
    setCopied(true)
  }

  const handleDisconnect = () => {
    disconnect()
    setShowWalletModal(false)
    onDisconnect?.()
  }

  const textToneClass = tone === 'light'
    ? 'text-white hover:text-white/78'
    : 'text-[var(--text-primary)] hover:text-black/66'
  const connectButtonClass = tone === 'light'
    ? 'bg-white/10 text-white ring-1 ring-inset ring-white/20 hover:bg-white/16'
    : 'bg-black text-white hover:bg-black/88'
  const connectedButtonClass = tone === 'light'
    ? 'bg-white/10 text-white ring-1 ring-inset ring-white/20 hover:bg-white/16'
    : 'bg-black text-white hover:bg-black/88'

  if (isConnected && address) {
    return (
      <div className={`flex items-center ${className}`}>
        <button
          type="button"
          onClick={() => setShowWalletModal(true)}
          className={connectedAsButton
            ? `inline-flex items-center justify-center rounded-full px-5 py-3 text-[11px] font-black uppercase tracking-[0.24em] no-underline shadow-[0_10px_26px_rgba(0,0,0,0.14)] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${connectedButtonClass} ${connectedClassName}`
            : `inline-flex items-center rounded-full px-1 py-1 text-sm font-semibold tracking-[0.08em] no-underline transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${textToneClass} ${connectedClassName}`}
          title="Open wallet details"
        >
          {truncateAddress(address)}
        </button>

        {showWalletModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/48 backdrop-blur-sm" onClick={() => setShowWalletModal(false)} />
            <div className="relative z-10 w-full max-w-md rounded-[2rem] bg-white p-6 shadow-[0_24px_70px_rgba(0,0,0,0.26)] animate-in fade-in zoom-in-95 duration-200">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[var(--text-secondary)]">Wallet</p>
                  <p className="break-all text-sm font-semibold text-[var(--text-primary)]">{address}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowWalletModal(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors duration-200 hover:bg-black/5 hover:text-[var(--text-primary)]"
                  aria-label="Close wallet modal"
                >
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                    <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center justify-center rounded-full bg-black px-5 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-white transition-all duration-200 hover:bg-black/88"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="inline-flex items-center justify-center rounded-full bg-black/6 px-5 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-[var(--text-primary)] transition-all duration-200 hover:bg-black/10"
                >
                  Disconnect
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (hideWhenDisconnected) {
    return null
  }

  return (
    <button
      type="button"
      onClick={() => void open()}
      className={`inline-flex items-center justify-center rounded-full px-5 py-3 text-[11px] font-black uppercase tracking-[0.24em] no-underline shadow-[0_10px_26px_rgba(0,0,0,0.14)] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${connectButtonClass} ${className}`}
    >
      Connect Wallet
    </button>
  )
}
