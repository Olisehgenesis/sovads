"use client"

import React from 'react'
import Link from 'next/link'

export default function Footer() {
  const currentYear = new Date().getFullYear()
  return (
    <footer className="border-t-4 border-black bg-white py-10">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex flex-col items-center gap-4">
          <div className="flex gap-8">
            <Link href="/leaderboard" className="text-black font-heading text-xs uppercase hover:underline">Leaderboard</Link>
            <Link href="/about" className="text-black font-heading text-xs uppercase hover:underline">About</Link>
            <Link href="/rewards" className="text-black font-heading text-xs uppercase hover:underline">Rewards</Link>
          </div>
          <p className="text-black font-heading text-sm uppercase tracking-widest">
            © {currentYear} SovAds • Decentralized Ad Protocol
          </p>
        </div>
      </div>
    </footer>
  )
}
