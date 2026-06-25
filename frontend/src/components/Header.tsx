"use client"

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAccount } from 'wagmi'
import WalletButton from './WalletButton'
import { useRefParam } from '@/hooks/useRefParam'

type NavItem = {
  href: string
  label: string
}

const ADMIN_ADDRESS = '0x53eaF4CD171842d8144e45211308e5D90B4b0088'.toLowerCase()

const directNavItems: NavItem[] = [
  { href: '/advertiser', label: 'Advertisers' },
  { href: '/publisher', label: 'Publishers' },
  { href: '/rewards', label: 'Rewards' },
  { href: '/docs', label: 'Docs' },
]

const baseAboutItems: NavItem[] = [
  { href: '/about', label: 'About' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/contact', label: 'Contact Us' },
]

function matchesPath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

function navItemClass(isActive: boolean, isScrolled: boolean, lightWhenTop = false) {
  const activeClass = isScrolled
    ? 'bg-[#2D2D2D] text-white'
    : 'bg-[#2D2D2D] text-white'
  const idleClass = isScrolled
    ? 'text-[#2D2D2D] hover:bg-[#2D2D2D]/8 hover:text-[#2D2D2D]'
    : lightWhenTop
      ? 'text-[var(--text-primary)] hover:bg-[#2D2D2D]/8 hover:text-[#2D2D2D]'
      : 'text-[var(--text-primary)] hover:bg-[#2D2D2D]/6 hover:text-[#2D2D2D]'

  return [
    'inline-flex items-center gap-1 rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-[0.24em] no-underline transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D2D2D]/40',
    isActive ? activeClass : idleClass,
  ].join(' ')
}

function dropdownLinkClass(isActive: boolean) {
  return [
    'flex items-center justify-between px-4 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)] no-underline transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D2D2D]',
    isActive ? 'bg-[#2D2D2D] text-white' : 'hover:bg-[#2D2D2D]/8',
  ].join(' ')
}

function MobileSection({
  label,
  items,
  pathname,
  isOpen,
  onToggle,
  onNavigate,
  withRef = (h: string) => h,
}: {
  label: string
  items: NavItem[]
  pathname: string
  isOpen: boolean
  onToggle: () => void
  onNavigate: () => void
  withRef?: (href: string) => string
}) {
  const active = items.some((item) => matchesPath(pathname, item.href))

  return (
    <div className="rounded-3xl bg-[#2D2D2D]/[0.04] px-2 py-2">
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-black uppercase tracking-[0.18em] no-underline transition-all duration-200 ${active ? 'bg-[#2D2D2D] text-white' : 'text-[var(--text-primary)] hover:bg-[#2D2D2D]/6'}`}
        aria-expanded={isOpen}
      >
        {label}
        <svg
          className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          aria-hidden="true"
        >
          <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isOpen && (
        <div className="mt-2 space-y-1 px-2 pb-2 animate-in fade-in slide-in-from-top-2 duration-200">
          {items.map((item) => (
            <Link
              key={item.href}
              href={withRef(item.href)}
              onClick={onNavigate}
              className={`block rounded-2xl px-4 py-3 text-sm font-semibold no-underline transition-all duration-200 ${matchesPath(pathname, item.href) ? 'bg-white text-[var(--text-primary)] shadow-[0_12px_30px_rgba(0,0,0,0.08)]' : 'text-[var(--text-secondary)] hover:bg-white/80 hover:text-[var(--text-primary)]'}`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Header() {
  const pathname = usePathname() ?? '/'
  const { address } = useAccount()
  const { withRef } = useRefParam()
  const [isScrolled, setIsScrolled] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileSection, setMobileSection] = useState<string | null>(null)
  const navRef = useRef<HTMLElement | null>(null)

  const isAuthorized = address?.toLowerCase() === ADMIN_ADDRESS

  const aboutItems = useMemo(
    () => (isAuthorized ? [...baseAboutItems, { href: '/backoffice', label: 'Backoffice' }] : baseAboutItems),
    [isAuthorized]
  )

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 20)

    onScroll()
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setOpenDropdown(null)
    setMobileMenuOpen(false)
    setMobileSection(null)
  }, [pathname])

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!navRef.current?.contains(event.target as Node)) {
        setOpenDropdown(null)
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenDropdown(null)
        setMobileMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const headerShellClass = isScrolled
    ? 'bg-[#F5F3F0]/92 border-b border-[#E5E5E5] shadow-[0_8px_24px_rgba(45,45,45,0.08)] backdrop-blur-md'
    : 'bg-transparent'
  const logoClass = 'text-[var(--text-primary)]'

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-30">
      <nav
        ref={navRef}
        className={`pointer-events-auto transition-all duration-300 ${headerShellClass}`}
      >
        <div className="mx-auto max-w-7xl px-6 sm:px-8 lg:px-10">
          <div className={`flex items-center justify-between gap-4 transition-all duration-300 ${isScrolled ? 'h-14' : 'h-16'}`}>
            <Link
              href="/"
              className={`relative z-10 flex items-center gap-3 no-underline text-base font-black tracking-[0.18em] transition-colors duration-300 hover:bg-transparent ${logoClass}`}
            >
              <Image
                src="/icon.png"
                alt="SovAds logo"
                width={36}
                height={36}
                priority
                className="h-9 w-9 rounded-none border-2 border-black bg-white object-contain shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
              />
              <span className="hidden sm:inline">SovAds</span>
            </Link>

            <div className="hidden flex-1 items-center justify-center lg:flex">
              <div className="flex items-center gap-2 rounded-full px-2 py-1">
                {directNavItems.map((item) => (
                  <Link
                    key={item.href}
                    href={withRef(item.href)}
                    className={navItemClass(matchesPath(pathname, item.href), isScrolled, true)}
                  >
                    {item.label}
                  </Link>
                ))}

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setOpenDropdown((current) => (current === 'about' ? null : 'about'))}
                    className={navItemClass(aboutItems.some((item) => matchesPath(pathname, item.href)), isScrolled)}
                    aria-expanded={openDropdown === 'about'}
                    aria-haspopup="menu"
                  >
                    About
                    <svg
                      className={`h-4 w-4 transition-transform duration-200 ${openDropdown === 'about' ? 'rotate-180' : ''}`}
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      aria-hidden="true"
                    >
                      <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  {openDropdown === 'about' && (
                    <div className="absolute left-1/2 top-[calc(100%+12px)] w-64 -translate-x-1/2 border-2 border-black bg-white p-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] animate-in fade-in slide-in-from-top-2 duration-200">
                      {aboutItems.map((item) => (
                        <Link
                          key={item.href}
                          href={withRef(item.href)}
                          className={dropdownLinkClass(matchesPath(pathname, item.href))}
                        >
                          <span>{item.label}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="hidden items-center gap-5 lg:flex">
              <WalletButton connectedAsButton tone="dark" />
            </div>

            <div className="flex items-center gap-3 lg:hidden">
              <div className="hidden sm:block">
                <WalletButton
                  connectedAsButton
                  tone="dark"
                  className="px-4 py-2.5 text-[10px] tracking-[0.22em]"
                  connectedClassName="px-4 py-2.5 text-[10px] tracking-[0.22em]"
                />
              </div>

              <button
                type="button"
                onClick={() => setMobileMenuOpen((open) => !open)}
                className={`inline-flex items-center justify-center rounded-full p-2.5 no-underline transition-all duration-200 text-[var(--text-primary)] hover:bg-[#2D2D2D]/6`}
                aria-label="Toggle navigation"
                aria-expanded={mobileMenuOpen}
              >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                  {mobileMenuOpen ? (
                    <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" strokeLinejoin="round" />
                  ) : (
                    <path d="M3.5 6h13M3.5 10h13M3.5 14h13" strokeLinecap="round" strokeLinejoin="round" />
                  )}
                </svg>
              </button>
            </div>
          </div>

          {mobileMenuOpen && (
            <div className="pb-5 lg:hidden animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="border-2 border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <div className="mb-4 flex border-b border-black/8 pb-4">
                  <WalletButton connectedAsButton className="w-full justify-center" connectedClassName="w-full justify-center" tone="dark" />
                </div>

                <div className="space-y-3">
                  {directNavItems.map((item) => (
                    <Link
                      key={item.href}
                      href={withRef(item.href)}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`block rounded-3xl px-4 py-4 text-sm font-black uppercase tracking-[0.18em] no-underline transition-all duration-200 ${matchesPath(pathname, item.href) ? 'bg-[#2D2D2D] text-white' : 'bg-[#2D2D2D]/[0.04] text-[var(--text-primary)] hover:bg-[#2D2D2D]/8'}`}
                    >
                      {item.label}
                    </Link>
                  ))}

                  <MobileSection
                    label="About"
                    items={aboutItems}
                    pathname={pathname}
                    isOpen={mobileSection === 'about'}
                    onToggle={() => setMobileSection((current) => (current === 'about' ? null : 'about'))}
                    onNavigate={() => setMobileMenuOpen(false)}
                    withRef={withRef}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </nav>
    </header>
  )
}
