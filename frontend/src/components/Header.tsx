'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import WalletButton from './WalletButton'
import LoginModal from './LoginModal'

export default function Header() {
  const [isScrolled, setIsScrolled] = useState(false)
  const [isLoginOpen, setIsLoginOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-20 transition-all duration-300 ${isScrolled ? 'bg-white border-b-2 border-black shadow-sm' : 'bg-transparent'
          }`}
      >
        <nav>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-20 items-center">
              <div className="flex items-center">
                <Link href="/" className="text-2xl font-heading uppercase tracking-tighter text-black hover:bg-black hover:text-white px-2 transition-all">
                  SovAds
                </Link>
              </div>
              <div className="flex items-center gap-8">
                <div className="hidden md:flex items-center gap-6">
                  {['About', 'Leaderboard'].map((item) => (
                    <Link
                      key={item}
                      href={`/${item.toLowerCase()}`}
                      className="text-black font-heading uppercase text-xs hover:underline underline-offset-4 decoration-2 transition-all"
                    >
                      {item}
                    </Link>
                  ))}
                  <button
                    onClick={() => setIsLoginOpen(true)}
                    className="text-black font-heading uppercase text-xs hover:bg-black hover:text-white px-2 py-1 transition-all"
                  >
                    Login
                  </button>
                </div>
                <WalletButton />
              </div>
            </div>
          </div>
        </nav>
      </header>
      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
    </>
  )
}
