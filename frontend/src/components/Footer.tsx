"use client"

import React from 'react'
import Link from 'next/link'

export default function Footer() {
  const currentYear = new Date().getFullYear()
  return (
    <footer className="border-t-4 border-black bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Main footer grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 py-14 border-b-2 border-black">

          {/* Brand column */}
          <div className="lg:col-span-2">
            <p className="text-2xl font-heading uppercase tracking-tight mb-3">SovAds</p>
            <p className="text-sm text-[var(--text-secondary)] max-w-xs leading-relaxed mb-6">
              A transparent on-chain advertising protocol. Publishers earn per real impression. Viewers earn SovPoints. Advertisers get verifiable reach — no bots, no black boxes.
            </p>
            <div className="flex gap-3">
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 w-9 items-center justify-center border-2 border-black bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all"
                aria-label="GitHub"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
              </a>
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 w-9 items-center justify-center border-2 border-black bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all"
                aria-label="X / Twitter"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Protocol links */}
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-4">Protocol</p>
            <ul className="space-y-3">
              <li><Link href="/advertiser" className="text-sm font-bold hover:underline decoration-2">Advertiser</Link></li>
              <li><Link href="/publisher" className="text-sm font-bold hover:underline decoration-2">Publisher</Link></li>
              <li><Link href="/rewards" className="text-sm font-bold hover:underline decoration-2">Claim Rewards</Link></li>
              <li><Link href="/leaderboard" className="text-sm font-bold hover:underline decoration-2">Leaderboard</Link></li>
              <li><Link href="/analytics" className="text-sm font-bold hover:underline decoration-2">Analytics</Link></li>
            </ul>
          </div>

          {/* Developers + Info */}
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-4">Resources</p>
            <ul className="space-y-3">
              <li><Link href="/docs" className="text-sm font-bold hover:underline decoration-2">Docs</Link></li>
              <li><a href="/sdk-demo.html" className="text-sm font-bold hover:underline decoration-2">SDK Demo</a></li>
              <li><Link href="/about" className="text-sm font-bold hover:underline decoration-2">About</Link></li>
              <li><Link href="/contact" className="text-sm font-bold hover:underline decoration-2">Contact</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 py-6 text-xs font-bold uppercase tracking-widest text-[var(--text-tertiary)]">
          <span>© {currentYear} SovAds. All rights reserved.</span>
          <span>Built on Celo · Powered by GoodDollar</span>
        </div>

      </div>
    </footer>
  )
}
