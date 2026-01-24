'use client'

import { useEffect, useRef, useState } from 'react'
import { Banner, Popup, Sidebar } from 'sovads-sdk'
import { getSovAdsClient } from '@/lib/sovads-client'

type SharedAdProps = {
  consumerId?: string
  className?: string
  placeholder?: React.ReactNode
}

const generateSlotId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`

export function BannerAd({ consumerId, className, placeholder }: SharedAdProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const bannerRef = useRef<Banner | null>(null)
  const [slotId] = useState(() => generateSlotId('sovads-banner'))
  const [hasRendered, setHasRendered] = useState(false)

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
    const banner = new Banner(client, slotId)
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
  }, [consumerId, slotId])

  return (
    <div
      ref={containerRef}
      className={[
        'sovads-banner-slot w-full',
        !hasRendered ? 'flex items-center justify-center' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ 
        maxWidth: '100%', 
        overflow: 'hidden',
        width: '100%'
      }}
    >
      {!hasRendered && (placeholder ?? <span className="text-sm text-foreground/60">Loading ad…</span>)}
    </div>
  )
}

export function SidebarAd({ consumerId, className, placeholder }: SharedAdProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const sidebarRef = useRef<Sidebar | null>(null)
  const [slotId] = useState(() => generateSlotId('sovads-sidebar'))
  const [hasRendered, setHasRendered] = useState(false)

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
    const sidebar = new Sidebar(client, slotId)
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
  }, [consumerId, slotId])

  return (
    <div
      ref={containerRef}
      className={[
        'sovads-sidebar-slot',
        !hasRendered ? 'flex items-center justify-center' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {!hasRendered && (placeholder ?? <span className="text-sm text-foreground/60">Loading ad…</span>)}
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

