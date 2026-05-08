'use client'

import { useEffect, useState, useCallback } from 'react'

const STORAGE_KEY = 'sovads_ref'

/**
 * Reads the `?ref=<address>` referral param from the URL,
 * persists it in sessionStorage so it survives navigation,
 * and provides a `withRef(href)` helper that appends it to any internal link.
 */
export function useRefParam() {
  const [ref, setRef] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlRef = params.get('ref')

    if (urlRef && urlRef.startsWith('0x')) {
      // Fresh ref in URL — store and use it
      sessionStorage.setItem(STORAGE_KEY, urlRef)
      setRef(urlRef)
    } else {
      // Fall back to previously stored ref
      const stored = sessionStorage.getItem(STORAGE_KEY)
      if (stored) setRef(stored)
    }
  }, [])

  /** Returns `href` with `?ref=<address>` appended when a ref is present. */
  const withRef = useCallback(
    (href: string): string => {
      if (!ref) return href
      const separator = href.includes('?') ? '&' : '?'
      return `${href}${separator}ref=${ref}`
    },
    [ref],
  )

  return { ref, withRef }
}
