'use client'

import { useEffect, useRef, useState } from 'react'
import { Banner, Popup, Sidebar } from '@/lib/sdk'
import { getSovAdsClient } from '@/lib/sovads-client'

type SharedAdProps = {
  consumerId?: string
  className?: string
  placeholder?: React.ReactNode
}

const generateSlotId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`

const getResponsiveSize = (placement: 'banner' | 'sidebar' | 'popup') => {
  if (typeof window === 'undefined') {
    return placement === 'sidebar' ? '300x250' : '728x90'
  }
  const width = window.innerWidth
  if (placement === 'banner') {
    if (width < 640) return '320x50'
    if (width < 1024) return '728x90'
    return '970x250'
  }
  if (placement === 'sidebar') {
    return width < 1024 ? '300x250' : '300x600'
  }
  return width < 640 ? '320x100' : '360x120'
}

const sizeToMinHeight = (size: string) => {
  const parts = size.split('x')
  const height = Number(parts[1] || 0)
  return Number.isFinite(height) && height > 0 ? height : 120
}

export function BannerAd({ consumerId, className, placeholder }: SharedAdProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const bannerRef = useRef<Banner | null>(null)
  const [slotId] = useState(() => generateSlotId('sovads-banner'))
  const [slotSize, setSlotSize] = useState('728x90')
  const [hasRendered, setHasRendered] = useState(false)

  useEffect(() => {
    const update = () => setSlotSize(getResponsiveSize('banner'))
    update()
    window.addEventListener('resize', update, { passive: true })
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    const client = getSovAdsClient()
    const container = containerRef.current

    if (!client || !container) {
      return
    }

    // Clear any existing SDK elements before rendering
    const existingElements = container.querySelectorAll('[data-ad-id], .sovads-banner, .sovads-banner-dummy')
    existingElements.forEach((el) => {
      try {
        if (el.parentNode === container) {
          el.remove()
        }
      } catch (e) {
        // Ignore errors
      }
    })

    container.id = slotId
    const banner = new Banner(client, slotId, { placementId: 'banner', size: slotSize })
    bannerRef.current = banner

    let isMounted = true

    banner
      .render(consumerId)
      .then(() => {
        if (isMounted) {
          setHasRendered(true)
        }
      })
      .catch((error) => {
        console.error('Failed to render banner ad', error)
      })

    return () => {
      isMounted = false
      
      // Clean up banner instance
      if (bannerRef.current) {
        try {
          (bannerRef.current as any).destroy?.()
        } catch (e) {
          // Ignore cleanup errors
        }
        bannerRef.current = null
      }
      
      // Clean up client reference
      try {
        client.removeComponent(slotId)
      } catch (e) {
        // Ignore cleanup errors
      }
      
      // Safely clear container - use a timeout to let React finish its cleanup first
      if (container) {
        // Use setTimeout with 0 delay to defer cleanup until after React's reconciliation
        setTimeout(() => {
          if (container && container.isConnected) {
            try {
              // Clear only SDK-added elements, not React children
              const sdkElements = container.querySelectorAll('[data-ad-id], .sovads-banner, .sovads-banner-dummy')
              sdkElements.forEach((el) => {
                try {
                  // Double-check parent before removing
                  if (el.parentNode === container && container.contains(el)) {
                    el.remove()
                  }
                } catch (e) {
                  // Element may have already been removed by React
                }
              })
            } catch (e) {
              // Container may have been removed by React
            }
          }
        }, 0)
      }
    }
  }, [consumerId, slotId, slotSize])

  return (
    <div
      className={[
        'sovads-banner-slot w-full',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        maxWidth: '100%',
        overflow: 'hidden',
        width: '100%',
        minHeight: `${sizeToMinHeight(slotSize)}px`,
      }}
    >
      {!hasRendered && (
        <div className="flex items-center justify-center">
          {placeholder ?? <span className="text-sm text-foreground/60">Loading ad…</span>}
        </div>
      )}
      <div
        ref={containerRef}
        style={{
          maxWidth: '100%',
          overflow: 'hidden',
          width: '100%'
        }}
      />
    </div>
  )
}

export function SidebarAd({ consumerId, className, placeholder }: SharedAdProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const sidebarRef = useRef<Sidebar | null>(null)
  const [slotId] = useState(() => generateSlotId('sovads-sidebar'))
  const [slotSize, setSlotSize] = useState('300x250')
  const [hasRendered, setHasRendered] = useState(false)

  useEffect(() => {
    const update = () => setSlotSize(getResponsiveSize('sidebar'))
    update()
    window.addEventListener('resize', update, { passive: true })
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    const client = getSovAdsClient()
    const container = containerRef.current

    if (!client || !container) {
      return
    }

    // Clear any existing SDK elements before rendering
    const existingElements = container.querySelectorAll('[data-ad-id], .sovads-sidebar, .sovads-sidebar-dummy')
    existingElements.forEach((el) => {
      try {
        if (el.parentNode === container) {
          el.remove()
        }
      } catch (e) {
        // Ignore errors
      }
    })

    container.id = slotId
    const sidebar = new Sidebar(client, slotId, { placementId: 'sidebar', size: slotSize })
    sidebarRef.current = sidebar

    let isMounted = true

    sidebar
      .render(consumerId)
      .then(() => {
        if (isMounted) {
          setHasRendered(true)
        }
      })
      .catch((error) => {
        console.error('Failed to render sidebar ad', error)
      })

    return () => {
      isMounted = false
      
      // Clean up sidebar instance
      if (sidebarRef.current) {
        try {
          (sidebarRef.current as any).destroy?.()
        } catch (e) {
          // Ignore cleanup errors
        }
        sidebarRef.current = null
      }
      
      // Clean up client reference
      try {
        client.removeComponent(slotId)
      } catch (e) {
        // Ignore cleanup errors
      }
      
      // Safely clear container - use a timeout to let React finish its cleanup first
      if (container) {
        // Use setTimeout with 0 delay to defer cleanup until after React's reconciliation
        setTimeout(() => {
          if (container && container.isConnected) {
            try {
              // Clear only SDK-added elements, not React children
              const sdkElements = container.querySelectorAll('[data-ad-id], .sovads-sidebar, .sovads-sidebar-dummy')
              sdkElements.forEach((el) => {
                try {
                  // Double-check parent before removing
                  if (el.parentNode === container && container.contains(el)) {
                    el.remove()
                  }
                } catch (e) {
                  // Element may have already been removed by React
                }
              })
            } catch (e) {
              // Container may have been removed by React
            }
          }
        }, 0)
      }
    }
  }, [consumerId, slotId, slotSize])

  return (
    <div
      className={[
        'sovads-sidebar-slot',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {!hasRendered && (
        <div className="flex items-center justify-center">
          {placeholder ?? <span className="text-sm text-foreground/60">Loading ad…</span>}
        </div>
      )}
      <div ref={containerRef} />
    </div>
  )
}

type PopupAdProps = {
  consumerId?: string
  delay?: number
  enabled?: boolean
}

export function PopupAd({ consumerId, delay = 3000, enabled = true }: PopupAdProps) {
  useEffect(() => {
    if (!enabled) {
      return
    }

    const client = getSovAdsClient()

    if (!client) {
      return
    }

    const popup = new Popup(client)

    popup
      .show(consumerId, delay)
      .catch((error) => {
        console.error('Failed to show popup ad', error)
      })

    return () => {
      popup.hide()
    }
  }, [consumerId, delay, enabled])

  return null
}
