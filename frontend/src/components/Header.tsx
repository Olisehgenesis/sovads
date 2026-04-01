"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAccount } from 'wagmi'
import WalletButton from './WalletButton'

type NavItem = {
  href: string
  label: string
}

const ADMIN_ADDRESS = '0x53eaF4CD171842d8144e45211308e5D90B4b0088'.toLowerCase()

const dashboardItems: NavItem[] = [
  { href: '/publisher', label: 'Publisher' },
  { href: '/advertiser', label: 'Advertiser' },
  { href: '/rewards', label: 'Claim Rewards' },
]

const baseAboutItems: NavItem[] = [
  { href: '/about', label: 'About' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/contact', label: 'Contact Us' },
]

const directNavItems: NavItem[] = [
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/docs', label: 'Docs' },
]

function matchesPath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

function navItemClass(isActive: boolean, isScrolled: boolean, lightWhenTop = false) {
  const activeClass = isScrolled
    ? 'bg-white/14 text-white'
    : 'bg-black text-white'
  const idleClass = isScrolled
    ? 'text-white/84 hover:bg-white/10 hover:text-white'
    : lightWhenTop
      ? 'text-white/84 hover:bg-white/10 hover:text-white'
      : 'text-[var(--text-primary)] hover:bg-black/6 hover:text-black'

  return [
    'inline-flex items-center gap-1 rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-[0.24em] no-underline transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
    isActive ? activeClass : idleClass,
  ].join(' ')
}

function dropdownLinkClass(isActive: boolean) {
  return [
    'flex items-center justify-between px-4 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)] no-underline transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black',
    isActive ? 'bg-black text-white' : 'hover:bg-black/8',
  ].join(' ')
}

function MobileSection({
  label,
  items,
  pathname,
  isOpen,
  onToggle,
  onNavigate,
}: {
  label: string
  items: NavItem[]
  pathname: string
  isOpen: boolean
  onToggle: () => void
  onNavigate: () => void
}) {
  const active = items.some((item) => matchesPath(pathname, item.href))

  return (
    <div className="rounded-3xl bg-black/[0.04] px-2 py-2">
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-black uppercase tracking-[0.18em] no-underline transition-all duration-200 ${active ? 'bg-black text-white' : 'text-[var(--text-primary)] hover:bg-black/6'}`}
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
              href={item.href}
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
    ? 'bg-black/88 shadow-[0_12px_40px_rgba(0,0,0,0.28)] backdrop-blur-md'
    : 'bg-transparent'
  const logoClass = isScrolled ? 'text-white' : 'text-[var(--text-primary)]'

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
              className={`relative z-10 no-underline text-base font-black tracking-[0.18em] transition-colors duration-300 hover:bg-transparent ${logoClass}`}
            >
              SovAds
            </Link>

            <div className="hidden flex-1 items-center justify-center lg:flex">
              <div className="flex items-center gap-2 rounded-full px-2 py-1">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setOpenDropdown((current) => (current === 'dashboard' ? null : 'dashboard'))}
                    className={navItemClass(dashboardItems.some((item) => matchesPath(pathname, item.href)), isScrolled)}
                    aria-expanded={openDropdown === 'dashboard'}
                    aria-haspopup="menu"
                  >
                    Dashboard
                    <svg
                      className={`h-4 w-4 transition-transform duration-200 ${openDropdown === 'dashboard' ? 'rotate-180' : ''}`}
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      aria-hidden="true"
                    >
                      <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  {openDropdown === 'dashboard' && (
                    <div className="absolute left-1/2 top-[calc(100%+12px)] w-64 -translate-x-1/2 border-2 border-black bg-white p-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] animate-in fade-in slide-in-from-top-2 duration-200">
                      {dashboardItems.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={dropdownLinkClass(matchesPath(pathname, item.href))}
                        >
                          <span>{item.label}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {directNavItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
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
                          href={item.href}
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
              <WalletButton connectedAsButton tone={isScrolled ? 'light' : 'dark'} />
            </div>

            <div className="flex items-center gap-3 lg:hidden">
              <div className="hidden sm:block">
                <WalletButton
                  connectedAsButton
                  tone={isScrolled ? 'light' : 'dark'}
                  className="px-4 py-2.5 text-[10px] tracking-[0.22em]"
                  connectedClassName="px-4 py-2.5 text-[10px] tracking-[0.22em]"
                />
              </div>

              <button
                type="button"
                onClick={() => setMobileMenuOpen((open) => !open)}
                className={`inline-flex items-center justify-center rounded-full p-2.5 no-underline transition-all duration-200 ${isScrolled ? 'text-white hover:bg-white/10' : 'text-[var(--text-primary)] hover:bg-black/6'}`}
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
                  <MobileSection
                    label="Dashboard"
                    items={dashboardItems}
                    pathname={pathname}
                    isOpen={mobileSection === 'dashboard'}
                    onToggle={() => setMobileSection((current) => (current === 'dashboard' ? null : 'dashboard'))}
                    onNavigate={() => setMobileMenuOpen(false)}
                  />

                  {directNavItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`block rounded-3xl px-4 py-4 text-sm font-black uppercase tracking-[0.18em] no-underline transition-all duration-200 ${matchesPath(pathname, item.href) ? 'bg-black text-white' : 'bg-black/[0.04] text-[var(--text-primary)] hover:bg-black/8'}`}
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
