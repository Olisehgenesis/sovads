"use client"

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import WalletButton from './WalletButton'

const ADMIN_ADDRESS = '0x53eaF4CD171842d8144e45211308e5D90B4b0088'.toLowerCase()

// Shared nav link base — defeats the global `a:not(.btn)` underline rule
const navBase =
  'no-underline text-black font-black text-xs uppercase tracking-widest px-3 py-1.5 border-2 border-transparent transition-all hover:border-black'

const navLinks = [
  { href: '/rewards', label: 'Rewards', hover: 'hover:bg-yellow-400' },
  { href: '/leaderboard', label: 'Leaderboard', hover: 'hover:bg-blue-300' },
  { href: '/staking', label: 'Stake', hover: 'hover:bg-pink-400' },
  { href: '/advertiser', label: 'Advertiser', hover: 'hover:bg-yellow-400' },
  { href: '/publisher', label: 'Publisher', hover: 'hover:bg-blue-300' },
  { href: '/analytics', label: 'Analytics', hover: 'hover:bg-gray-200' },
  { href: '/about', label: 'About', hover: 'hover:bg-gray-200' },
  { href: '/docs', label: 'Docs', hover: 'hover:bg-gray-200' },
]

export default function Header() {
  const { address } = useAccount()
  const [isScrolled, setIsScrolled] = useState(false)

  const isAuthorized = address?.toLowerCase() === ADMIN_ADDRESS

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-20 transition-all duration-300 ${isScrolled
          ? 'bg-black/80 backdrop-blur-sm border-b border-[var(--glass-border)]'
          : 'bg-transparent'
        }`}
    >
      <nav>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-12">
            {/* Logo */}
            <Link
              href="/"
              className="no-underline text-sm font-black tracking-tight text-[var(--text-primary)] hover:bg-transparent hover:text-black border-none"
            >
              SovAds
            </Link>

            {/* Nav links */}
            <div className="flex items-center gap-1">
              {navLinks.map(({ href, label, hover }) => (
                <Link key={href} href={href} className={`${navBase} ${hover}`}>
                  {label}
                </Link>
              ))}

              {isAuthorized && (
                <Link
                  href="/backoffice"
                  className="no-underline bg-yellow-400 text-black font-black uppercase text-xs tracking-widest px-3 py-1.5 border-2 border-black hover:bg-black hover:text-white transition-all"
                >
                  Backoffice
                </Link>
              )}

              <WalletButton />
            </div>
          </div>
        </div>
      </nav>
    </header>
  )
}
