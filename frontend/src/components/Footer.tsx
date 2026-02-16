"use client"

import React from 'react'

export default function Footer() {
  const currentYear = new Date().getFullYear()
  return (
    <footer className="border-t border-[var(--glass-border)]">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="text-center">
          <p className="text-[var(--text-tertiary)] text-[10px] uppercase tracking-wider">
            © {currentYear} SovAds • Decentralized Ad Protocol
          </p>
        </div>
      </div>
    </footer>
  )
}
