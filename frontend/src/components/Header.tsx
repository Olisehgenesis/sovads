"use client"

import Link from 'next/link'
import { useEffect, useState } from 'react'
import WalletButton from './WalletButton'

export default function Header() {
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-20 transition-all duration-300 ${isScrolled ? 'bg-black/80 backdrop-blur-sm border-b border-[var(--glass-border)]' : 'bg-transparent'
        }`}
    >
      <nav>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-12">
            <div className="flex items-center">
              <Link href="/" className="text-sm font-bold tracking-tight text-[var(--text-primary)]">
                SovAds
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                href="/advertiser"
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2 py-1 rounded-md text-[11px] font-medium transition-colors"
              >
                Advertiser
              </Link>
              <Link
                href="/publisher"
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2 py-1 rounded-md text-[11px] font-medium transition-colors"
              >
                Publisher
              </Link>
              <Link
                href="/admin"
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2 py-1 rounded-md text-[11px] font-medium transition-colors"
              >
                Admin
              </Link>
              <WalletButton />
            </div>
          </div>
        </div>
      </nav>
    </header>
  )
}
