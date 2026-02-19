// SovAds SDK - Modular Ad Network Integration
// Usage: import { SovAds, Banner, Popup, Sidebar } from '@sovads/sdk'

export interface SovAdsConfig {
  siteId?: string // Optional - will be auto-detected if not provided
  apiUrl?: string // Default: http://localhost:3000 for development
  apiKey?: string // Site API key for signed tracking
  apiSecret?: string // Site API secret for signed tracking
  debug?: boolean
  consumerId?: string // For targeting specific advertisers
  refreshInterval?: number // Ad refresh interval in seconds (default: 0 = no refresh)
  lazyLoad?: boolean // Enable lazy loading (default: true)
  rotationEnabled?: boolean // Enable ad rotation (default: true)
  popupMinIntervalMinutes?: number // Minimum interval between popup impressions
  popupSessionMax?: number // Max popup impressions per browser session
}

export interface AdComponent {
  id: string
  campaignId: string
  bannerUrl: string
  targetUrl: string
  description: string
  consumerId?: string
  isDummy?: boolean // Flag to indicate this is a dummy ad for unregistered sites
  tags?: string[]
  targetLocations?: string[]
  metadata?: Record<string, unknown>
  startDate?: string | null
  endDate?: string | null
  mediaType?: 'image' | 'video'
  trackingToken?: string
  placement?: string
  size?: string
}

interface TrackingPayload {
  type: 'IMPRESSION' | 'CLICK'
  campaignId: string
  adId: string
  siteId: string
  fingerprint: string
  consumerId?: string
  rendered?: boolean // Whether ad was actually rendered/visible
  viewportVisible?: boolean // Whether ad is in viewport
  renderTime?: number // Time when ad was rendered (ms)
  timestamp: number
  pageUrl: string
  userAgent: string
  trackingToken?: string
}

interface AdLoadOptions {
  consumerId?: string
  placement?: string
  size?: string
}

interface SlotConfig {
  placementId?: string
  size?: string
}

class SovAds {
  protected config: SovAdsConfig
  private fingerprint: string
  private components: Map<string, any> = new Map()
  private siteId: string | null = null
  private renderObservers: Map<string, IntersectionObserver> = new Map()
  private debugLoggingEnabled: boolean = false
  private adTrackingTokens: Map<string, string> = new Map()

  constructor(config: SovAdsConfig = {}) {
    this.config = {
      apiUrl: typeof window !== 'undefined' && window.location.hostname === 'localhost' 
        ? 'http://localhost:3000' 
        : 'https://ads.sovseas.xyz',
      debug: false,
      refreshInterval: 0, // No auto-refresh by default
      lazyLoad: true,
      rotationEnabled: true,
      popupMinIntervalMinutes: 30,
      popupSessionMax: 1,
      ...config
    }

    this.debugLoggingEnabled = Boolean(this.config.debug)
    
    this.fingerprint = this.generateFingerprint()
    
    if (this.config.debug) {
      console.log('SovAds SDK initialized:', this.config)
    }
  }

  private generateFingerprint(): string {
    const storageKey = 'sovads_fingerprint_v1'

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const existing = window.localStorage.getItem(storageKey)
        if (existing) {
          return existing
        }
      }
    } catch {
      // Ignore storage access errors and fall back to generated value.
    }

    const browserParts = [
      typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown-ua',
      typeof navigator !== 'undefined' ? navigator.language : 'unknown-lang',
      typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : 'unknown-screen',
      String(new Date().getTimezoneOffset()),
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
    ]

    const value = btoa(browserParts.join('|')).replace(/=+$/g, '')

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(storageKey, value)
      }
    } catch {
      // Ignore storage write failures.
    }

    return value
  }

  private async detectSiteId(): Promise<string> {
    if (this.siteId) {
      return this.siteId
    }

    if (this.config.siteId) {
      this.siteId = this.config.siteId
      if (this.config.debug) {
        console.log('Using configured site ID:', this.siteId)
      }
      return this.siteId
    }

    try {
      // Send beacon to detect site ID based on domain
      const domain = window.location.hostname
      const payload = {
        domain,
        pathname: window.location.pathname,
        fingerprint: this.fingerprint,
        userAgent: navigator.userAgent,
        pageUrl: window.location.href,
        timestamp: Date.now()
      }

      const startTime = Date.now()
      const endpoint = `${this.config.apiUrl}/api/sites/detect`
      // Send detection request using fetch (beacon doesn't support response)
      const response = await this.fetchWithRetry(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })
      const duration = Date.now() - startTime

      // Log SDK request
      await this.logDebug('SDK_REQUEST', {
        type: 'SITE_DETECT',
        endpoint: '/api/sites/detect',
        method: 'POST',
        domain,
        pageUrl: window.location.href,
        userAgent: navigator.userAgent,
        fingerprint: this.fingerprint,
        requestBody: payload,
        responseStatus: response.status,
        duration,
      })

      if (response.ok) {
        const data = await response.json()
        if (data.siteId) {
          this.siteId = String(data.siteId)
          
          if (this.config.debug) {
            console.log('Site ID detected from API:', this.siteId, data)
          }
          
          return this.siteId
        }
      }

      // Fallback: generate site ID from domain (for development only)
      // In production, this should trigger registration flow
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      if (isLocalhost) {
        this.siteId = `site_${btoa(domain).substring(0, 8)}`
        if (this.config.debug) {
          console.log('Generated fallback site ID (dev mode):', this.siteId)
        }
        return this.siteId
      } else {
        // In production, use temp_ prefix to indicate unregistered site
        this.siteId = `temp_${btoa(domain).substring(0, 8)}_${Date.now()}`
        if (this.config.debug) {
          console.warn('Unregistered site detected, using temp site ID:', this.siteId)
        }
        return this.siteId
      }
    } catch (error) {
      if (this.config.debug) {
        console.error('Error detecting site ID:', error)
      }
      
      // Fallback: generate site ID from domain
      const hostname = window.location.hostname
      const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'
      if (isLocalhost) {
        this.siteId = `site_${btoa(hostname).substring(0, 8)}`
      } else {
        this.siteId = `temp_${btoa(hostname).substring(0, 8)}_${Date.now()}`
      }
      return this.siteId
    }
  }

  /**
   * Setup IntersectionObserver to verify ad is actually rendered and visible
   * This helps with fraud prevention and accurate impression tracking
   * Falls back to manual visibility check for older browsers
   */
  public setupRenderObserver(element: HTMLElement, adId: string, callback: (isVisible: boolean) => void): void {
    // Clean up existing observer if any
    const existingObserver = this.renderObservers.get(adId)
    if (existingObserver) {
      existingObserver.disconnect()
    }

    // Check if IntersectionObserver is supported
    if (typeof IntersectionObserver !== 'undefined') {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const isVisible = entry.isIntersecting && entry.intersectionRatio > 0.5
            callback(isVisible)
            
            if (this.config.debug) {
              console.log(`Ad ${adId} visibility:`, {
                isIntersecting: entry.isIntersecting,
                intersectionRatio: entry.intersectionRatio,
                isVisible
              })
            }
          })
        },
        {
          threshold: [0.5], // At least 50% visible
          rootMargin: '0px'
        }
      )

      observer.observe(element)
      this.renderObservers.set(adId, observer)
    } else {
      // Fallback for older browsers: manual visibility check
      if (this.config.debug) {
        console.warn(`IntersectionObserver not supported, using fallback for ad ${adId}`)
      }
      
      const checkVisibility = () => {
        const rect = element.getBoundingClientRect()
        const windowHeight = window.innerHeight || document.documentElement.clientHeight
        const windowWidth = window.innerWidth || document.documentElement.clientWidth
        
        // Check if element is in viewport and at least 50% visible
        const isInViewport = (
          rect.top < windowHeight &&
          rect.bottom > 0 &&
          rect.left < windowWidth &&
          rect.right > 0
        )
        
        if (isInViewport) {
          const visibleHeight = Math.min(rect.bottom, windowHeight) - Math.max(rect.top, 0)
          const visibleWidth = Math.min(rect.right, windowWidth) - Math.max(rect.left, 0)
          const visibleArea = visibleHeight * visibleWidth
          const totalArea = rect.height * rect.width
          const intersectionRatio = totalArea > 0 ? visibleArea / totalArea : 0
          const isVisible = intersectionRatio >= 0.5
          
          callback(isVisible)
        } else {
          callback(false)
        }
      }
      
      // Check immediately and on scroll/resize
      checkVisibility()
      const scrollHandler = () => checkVisibility()
      const resizeHandler = () => checkVisibility()
      
      window.addEventListener('scroll', scrollHandler, { passive: true })
      window.addEventListener('resize', resizeHandler, { passive: true })
      
      // Store cleanup function
      this.renderObservers.set(adId, {
        disconnect: () => {
          window.removeEventListener('scroll', scrollHandler)
          window.removeEventListener('resize', resizeHandler)
        }
      } as any)
    }
  }

  /**
   * Get client metadata for tracking
   */
  private getClientMetadata() {
    return {
      pageUrl: window.location.href,
      userAgent: navigator.userAgent,
      language: navigator.language,
      screenWidth: screen.width,
      screenHeight: screen.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      timezoneOffset: new Date().getTimezoneOffset(),
      referrer: document.referrer || '',
      timestamp: Date.now()
    }
  }

  /**
   * Normalize URL - add protocol if missing for localhost
   */
  public normalizeUrl(url: string): string {
    const trimmed = url.trim()
    if (!trimmed.includes('://')) {
      // Allow localhost URLs without protocol for debugging
      if (trimmed.startsWith('localhost') || trimmed.startsWith('127.0.0.1')) {
        return `http://${trimmed}`
      }
      // Treat bare domains as https by default.
      return `https://${trimmed}`
    }
    return trimmed
  }

  /**
   * Validate URL format
   */
  private isValidUrl(url: string): boolean {
    try {
      const normalized = this.normalizeUrl(url)
      const parsed = new URL(normalized)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
      return false
    }
  }

  private inferMediaTypeFromUrl(url: string): 'image' | 'video' {
    const value = (url || '').toLowerCase()
    const videoExts = ['.mp4', '.webm', '.ogg', '.ogv', '.mov', '.m3u8']
    return videoExts.some((ext) => value.includes(ext)) ? 'video' : 'image'
  }

  /**
   * Fetch with retry logic
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit = {},
    maxAttempts: number = 3
  ): Promise<Response> {
    let lastError: Error | null = null
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(url, options)
        if (response.ok || attempt === maxAttempts) {
          return response
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        if (attempt < maxAttempts) {
          const delay = Math.pow(2, attempt - 1) * 100 // Exponential backoff
          if (this.config.debug) {
            console.warn(`Fetch attempt ${attempt} failed, retrying in ${delay}ms...`)
          }
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }
    
    throw lastError || new Error('Fetch failed after retries')
  }

  async loadAd(options: AdLoadOptions = {}): Promise<AdComponent | null> {
    const startTime = Date.now()
    try {
      const siteId = await this.detectSiteId()
      
      const params = new URLSearchParams({
        siteId,
        ...(options.consumerId && { consumerId: options.consumerId }),
        ...(options.placement && { placement: options.placement }),
        ...(options.size && { size: options.size }),
      })

      const endpoint = `${this.config.apiUrl}/api/ads?${params}`
      const response = await this.fetchWithRetry(endpoint)
      const duration = Date.now() - startTime
      
      // Log SDK request
      await this.logDebug('SDK_REQUEST', {
        type: 'AD_REQUEST',
        endpoint: '/api/ads',
        method: 'GET',
        siteId,
        domain: window.location.hostname,
        pageUrl: window.location.href,
        userAgent: navigator.userAgent,
        fingerprint: this.fingerprint,
        requestBody: { siteId, ...options },
        responseStatus: response.status,
        duration,
      })
      
      // Check if site is not registered (403 or 404)
      if (response.status === 403 || response.status === 404) {
        console.log('Site not registered')
        // Return dummy ad for unregistered sites
        return {
          id: 'dummy_ad_unregistered',
          campaignId: 'dummy_campaign',
          bannerUrl: 'https://sovseas.xyz/logo.png', // Placeholder - can be replaced with actual sovseas image
          targetUrl: 'https://ads.sovseas.xyz/publisher',
          description: 'Register your site to get ads',
          isDummy: true,
          tags: ['register', 'sovads'],
          targetLocations: [],
          metadata: {
            message: 'Register your site to start serving ads.',
          },
          mediaType: 'image',
        }
      }
      
      if (!response.ok) {
        throw new Error(`Failed to load ad: ${response.statusText}`)
      }

      const rawAd = await response.json()
      
      // Validate ad data
      if (!rawAd || !rawAd.bannerUrl || !rawAd.targetUrl) {
        if (this.config.debug) {
          console.error('Invalid ad data received:', rawAd)
        }
        return null
      }

      // Validate URLs
      if (!this.isValidUrl(rawAd.bannerUrl)) {
        if (this.config.debug) {
          console.error('Invalid bannerUrl:', rawAd.bannerUrl)
        }
        return null
      }

      if (!this.isValidUrl(rawAd.targetUrl)) {
        if (this.config.debug) {
          console.error('Invalid targetUrl:', rawAd.targetUrl)
        }
        return null
      }

      const normalizedAd: AdComponent = {
        ...rawAd,
        bannerUrl: this.normalizeUrl(rawAd.bannerUrl),
        targetUrl: this.normalizeUrl(rawAd.targetUrl),
        mediaType:
          rawAd.mediaType === 'video'
            ? 'video'
            : this.inferMediaTypeFromUrl(this.normalizeUrl(rawAd.bannerUrl)),
      }

      if (normalizedAd.trackingToken) {
        this.adTrackingTokens.set(normalizedAd.id, normalizedAd.trackingToken)
      }
      
      if (this.config.debug) {
        console.log('Ad loaded:', normalizedAd)
      }

      // Log interaction
      await this.logDebug('SDK_INTERACTION', {
        type: 'AD_LOADED',
        adId: normalizedAd.id,
        campaignId: normalizedAd.campaignId,
        siteId,
        pageUrl: window.location.href,
      })

      return normalizedAd
    } catch (error) {
      const duration = Date.now() - startTime
      await this.logDebug('SDK_REQUEST', {
        type: 'AD_REQUEST',
        endpoint: '/api/ads',
        method: 'GET',
        siteId: this.siteId,
        domain: window.location.hostname,
        pageUrl: window.location.href,
        userAgent: navigator.userAgent,
        fingerprint: this.fingerprint,
        error: error instanceof Error ? error.message : String(error),
        duration,
      })
      
      if (this.config.debug) {
        console.error('Error loading ad:', error)
      }
      return null
    }
  }

  private toBase64(bytes: Uint8Array): string {
    let binary = ''
    for (const b of bytes) {
      binary += String.fromCharCode(b)
    }
    return btoa(binary)
  }

  private async signTrackingPayload(payload: string, timestamp: number): Promise<string | null> {
    if (!this.config.apiSecret || typeof crypto === 'undefined' || !crypto.subtle) {
      return null
    }

    try {
      const encoder = new TextEncoder()
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(this.config.apiSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      )
      const message = `${timestamp}:${payload}`
      const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
      return this.toBase64(new Uint8Array(signature))
    } catch (error) {
      if (this.config.debug) {
        console.error('Failed to sign tracking payload:', error)
      }
      return null
    }
  }

  private async sendTrackingEnvelope(
    eventPayload: TrackingPayload,
    useBeacon: boolean
  ): Promise<boolean> {
    if (eventPayload.trackingToken) {
      const tokenBody = JSON.stringify({
        trackingToken: eventPayload.trackingToken,
        payload: eventPayload,
      })
      const tokenWebhookUrl = `${this.config.apiUrl}/api/webhook/track`
      try {
        if (useBeacon && navigator.sendBeacon) {
          return navigator.sendBeacon(tokenWebhookUrl, new Blob([tokenBody], { type: 'application/json' }))
        }
        const response = await fetch(tokenWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: tokenBody,
          keepalive: true,
        })
        return response.ok
      } catch {
        return false
      }
    }

    if (!this.config.apiKey || !this.config.apiSecret) {
      if (this.config.debug) {
        const devWebhookUrl = `${this.config.apiUrl}/api/webhook/beacon`
        const body = JSON.stringify(eventPayload)
        try {
          if (useBeacon && navigator.sendBeacon) {
            return navigator.sendBeacon(devWebhookUrl, new Blob([body], { type: 'application/json' }))
          }
          const response = await fetch(devWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            keepalive: true,
          })
          return response.ok
        } catch {
          return false
        }
      } else {
        console.warn('SovAds: Missing apiKey/apiSecret, skipping signed tracking event')
      }
      return false
    }

    const timestamp = Date.now()
    const payload = JSON.stringify(eventPayload)
    const signature = await this.signTrackingPayload(payload, timestamp)
    if (!signature) {
      return false
    }

    const envelope = JSON.stringify({
      apiKey: this.config.apiKey,
      siteId: eventPayload.siteId,
      payload,
      signature,
      timestamp,
    })

    const webhookUrl = `${this.config.apiUrl}/api/webhook/track`
    if (useBeacon && navigator.sendBeacon) {
      const blob = new Blob([envelope], { type: 'application/json' })
      return navigator.sendBeacon(webhookUrl, blob)
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: envelope,
      keepalive: true,
    })
    return response.ok
  }

  /**
   * Track event with retry logic (internal helper)
   */
  private async trackEventWithRetry(
    type: 'IMPRESSION' | 'CLICK', 
    adId: string, 
    campaignId: string,
    renderInfo: { rendered: boolean; viewportVisible: boolean; renderTime: number } | undefined,
    attempt: number,
    maxAttempts: number = 3
  ): Promise<void> {
    try {
      const siteId = await this.detectSiteId()
      const metadata = this.getClientMetadata()
      
      const payload: TrackingPayload = {
        type,
        campaignId,
        adId,
        siteId,
        fingerprint: this.fingerprint,
        consumerId: this.config.consumerId,
        rendered: renderInfo?.rendered ?? true,
        viewportVisible: renderInfo?.viewportVisible ?? false,
        renderTime: renderInfo?.renderTime ?? Date.now(),
        timestamp: metadata.timestamp,
        pageUrl: metadata.pageUrl,
        userAgent: metadata.userAgent,
        trackingToken: this.adTrackingTokens.get(adId),
      }
      const ok = await this.sendTrackingEnvelope(payload, false)
      if (!ok) {
        throw new Error('Tracking endpoint rejected event')
      }
      if (this.config.debug) {
        console.log(`SovAds: Tracked ${type} event via signed fetch (attempt ${attempt})`, payload)
      }
    } catch (error) {
      if (attempt < maxAttempts) {
        // Exponential backoff: 100ms, 200ms, 400ms
        const delay = Math.pow(2, attempt - 1) * 100
        if (this.config.debug) {
          console.warn(`SovAds: Retrying ${type} event (attempt ${attempt + 1}/${maxAttempts}) after ${delay}ms`)
        }
        await new Promise(resolve => setTimeout(resolve, delay))
        return this.trackEventWithRetry(type, adId, campaignId, renderInfo, attempt + 1, maxAttempts)
      } else {
        if (this.config.debug) {
          console.error(`SovAds: Failed to track ${type} event after ${maxAttempts} attempts:`, error)
        }
      }
    }
  }

  /**
   * Track event with enhanced metadata using Beacon API
   * Includes render verification, IP (collected server-side), and site ID validation
   */
  private async trackEvent(
    type: 'IMPRESSION' | 'CLICK', 
    adId: string, 
    campaignId: string,
    renderInfo?: { rendered: boolean; viewportVisible: boolean; renderTime: number }
  ): Promise<void> {
    try {
      const siteId = await this.detectSiteId()
      const metadata = this.getClientMetadata()
      
      const payload: TrackingPayload = {
        type,
        campaignId,
        adId,
        siteId,
        fingerprint: this.fingerprint,
        consumerId: this.config.consumerId,
        rendered: renderInfo?.rendered ?? true,
        viewportVisible: renderInfo?.viewportVisible ?? false,
        renderTime: renderInfo?.renderTime ?? Date.now(),
        timestamp: metadata.timestamp,
        pageUrl: metadata.pageUrl,
        userAgent: metadata.userAgent,
        trackingToken: this.adTrackingTokens.get(adId),
      }

      if (typeof navigator.sendBeacon === 'function') {
        const sent = await this.sendTrackingEnvelope(payload, true)
        if (sent) {
          if (this.config.debug) {
            console.log(`SovAds: Tracked ${type} event via signed beacon`, {
              payload: { ...payload, fingerprint: payload.fingerprint.substring(0, 8) + '...' }
            })
          }
          return
        }
      }

      // Fallback to signed fetch for older browsers and beacon failures
      if (this.config.debug) {
        console.warn(`SovAds: Beacon unavailable/failed for ${type}, falling back to signed fetch`)
      }
      await this.trackEventWithRetry(type, adId, campaignId, renderInfo, 1)
    } catch (error) {
      if (this.config.debug) {
        console.error('Error tracking event:', error)
      }
    }
  }

  // Component management
  addComponent(componentId: string, component: any) {
    this.components.set(componentId, component)
  }

  getComponent(componentId: string) {
    return this.components.get(componentId)
  }

  removeComponent(componentId: string) {
    this.components.delete(componentId)
  }

  // Expose trackEvent for components (internal use only)
  // Note: This is a workaround to access private method from components
  // In production, consider making trackEvent protected or using a different pattern
  public _trackEvent(
    type: 'IMPRESSION' | 'CLICK', 
    adId: string, 
    campaignId: string,
    renderInfo?: { rendered: boolean; viewportVisible: boolean; renderTime: number }
  ) {
    return this.trackEvent(type, adId, campaignId, renderInfo)
  }

  /**
   * Get config (for components to access debug mode)
   */
  public getConfig(): SovAdsConfig {
    return this.config
  }

  /**
   * Log interaction (public method for components)
   */
  public async logInteraction(type: string, data: any): Promise<void> {
    await this.logDebug('SDK_INTERACTION', {
      type,
      ...data,
      siteId: this.siteId,
      pageUrl: window.location.href,
    })
  }

  /**
   * Log debug event to server
   */
  private async logDebug(type: 'SDK_REQUEST' | 'SDK_INTERACTION', data: any): Promise<void> {
    if (!this.debugLoggingEnabled) return

    try {
      const logUrl = `${this.config.apiUrl}/api/debug/log`
      const payload = { type, data }

      // Use sendBeacon for non-blocking logging
      if (navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
        navigator.sendBeacon(logUrl, blob)
      } else {
        // Fallback to fetch (fire and forget)
        fetch(logUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(() => {
          // Silently fail - debug logging shouldn't break the app
        })
      }
    } catch (error) {
      // Silently fail - debug logging shouldn't break the app
    }
  }

  /**
   * Clean up observers when SDK is destroyed
   */
  public destroy(): void {
    this.renderObservers.forEach((observer) => observer.disconnect())
    this.renderObservers.clear()
  }
}

// Banner Component
export class Banner {
  private sovads: SovAds
  private containerId: string
  private currentAd: AdComponent | null = null
  private renderStartTime: number = 0
  private hasTrackedImpression: boolean = false
  private isRendering: boolean = false
  private refreshTimer: number | null = null
  private lastAdId: string | null = null
  private retryCount: number = 0
  private maxRetries: number = 3
  private slotConfig: SlotConfig

  constructor(sovads: SovAds, containerId: string, slotConfig: SlotConfig = {}) {
    this.sovads = sovads
    this.containerId = containerId
    this.slotConfig = slotConfig
  }

  async render(consumerId?: string, forceRefresh: boolean = false): Promise<void> {
    // Prevent concurrent renders
    if (this.isRendering && !forceRefresh) {
      if (this.sovads.getConfig().debug) {
        console.warn(`Banner render already in progress for ${this.containerId}`)
      }
      return
    }

    this.isRendering = true
    try {
      const container = document.getElementById(this.containerId)
      if (!container) {
        console.error(`Container with id "${this.containerId}" not found`)
        this.isRendering = false
        return
      }

      // Lazy loading: wait for container to be in viewport
      if (this.sovads.getConfig().lazyLoad && !forceRefresh) {
        const isInViewport = await this.checkViewport(container)
        if (!isInViewport) {
          // Set up intersection observer for lazy loading
          this.setupLazyLoadObserver(container, consumerId)
          this.isRendering = false
          return
        }
      }

      this.renderStartTime = Date.now()
      this.currentAd = await this.sovads.loadAd({
        consumerId,
        placement: this.slotConfig.placementId || 'banner',
        size: this.slotConfig.size,
      })
      this.hasTrackedImpression = false
      
      // Skip if same ad (rotation disabled or same ad returned)
      if (!forceRefresh && this.lastAdId === this.currentAd?.id && this.sovads.getConfig().rotationEnabled) {
        if (this.sovads.getConfig().debug) {
          console.log('Same ad returned, skipping render')
        }
        this.isRendering = false
        return
      }
      
      this.lastAdId = this.currentAd?.id || null
      this.retryCount = 0 // Reset retry count on success
      
      if (!this.currentAd) {
        container.innerHTML = '<div class="sovads-no-ad">No ads available</div>'
        this.isRendering = false
        return
      }

      // Handle dummy ads for unregistered sites
      if (this.currentAd.isDummy) {
        container.innerHTML = ''
        const dummyElement = document.createElement('div')
        dummyElement.className = 'sovads-banner-dummy'
        dummyElement.setAttribute('data-ad-id', this.currentAd.id)
        dummyElement.style.cssText = `
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 20px;
          text-align: center;
          background: #f9f9f9;
          cursor: pointer;
          transition: transform 0.2s ease;
        `

        const img = document.createElement('img')
        img.src = this.currentAd.bannerUrl
        img.alt = 'SovSeas'
        img.style.cssText = 'width: 120px; height: auto; margin: 0 auto 12px; display: block;'
        img.onerror = () => {
          // If image fails to load, create a simple placeholder
          img.style.display = 'none'
          const placeholder = document.createElement('div')
          placeholder.style.cssText = 'width: 120px; height: 60px; margin: 0 auto 12px; background: #e0e0e0; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #666;'
          placeholder.textContent = 'SovSeas'
          dummyElement.insertBefore(placeholder, dummyElement.firstChild)
        }

        const message = document.createElement('div')
        message.textContent = 'Register your site to get ads'
        message.style.cssText = 'color: #333; font-size: 14px; font-weight: 500; margin-top: 8px;'

        dummyElement.appendChild(img)
        dummyElement.appendChild(message)

        dummyElement.addEventListener('click', () => {
          window.open(this.sovads.normalizeUrl(this.currentAd!.targetUrl), '_blank', 'noopener,noreferrer')
        })

        dummyElement.addEventListener('mouseenter', () => {
          dummyElement.style.transform = 'scale(1.02)'
          dummyElement.style.background = '#f0f0f0'
        })

        dummyElement.addEventListener('mouseleave', () => {
          dummyElement.style.transform = 'scale(1)'
          dummyElement.style.background = '#f9f9f9'
        })

        container.appendChild(dummyElement)
        this.isRendering = false
        return
      }

      const adElement = document.createElement('div')
      container.innerHTML = ''
      adElement.className = 'sovads-banner'
      adElement.setAttribute('data-ad-id', this.currentAd.id)
      const mediaType = this.currentAd.mediaType === 'video' ? 'video' : 'image'
      adElement.style.cssText = `
      border: 1px solid #333;
      border-radius: 8px;
      overflow: hidden;
      cursor: ${mediaType === 'video' ? 'default' : 'pointer'};
      transition: transform 0.2s ease;
      max-width: 100%;
      width: 100%;
      box-sizing: border-box;
      opacity: 0;
    `

      const handleVisibilityTracking = (
        renderInfo: { rendered: boolean; viewportVisible: boolean; renderTime: number }
      ) => {
        this.sovads.setupRenderObserver(adElement, this.currentAd!.id, (isVisible) => {
          renderInfo.viewportVisible = isVisible

          if (isVisible && !this.hasTrackedImpression) {
            this.hasTrackedImpression = true
            this.sovads._trackEvent('IMPRESSION', this.currentAd!.id, this.currentAd!.campaignId, renderInfo)
          }
        })
      }

      const handleRenderSuccess = () => {
        adElement.style.opacity = '1'
        const renderTime = Date.now() - this.renderStartTime
        handleVisibilityTracking({
          rendered: true,
          viewportVisible: false,
          renderTime,
        })
      }

      const handleRenderError = () => {
        adElement.style.opacity = '1'
        if (this.sovads.getConfig().debug) {
          console.warn(`Failed to load ad media: ${this.currentAd!.bannerUrl}`)
        }
        handleVisibilityTracking({
          rendered: false,
          viewportVisible: false,
          renderTime: Date.now() - this.renderStartTime,
        })
      }

      let mediaElement: HTMLImageElement | HTMLVideoElement
      if (mediaType === 'video') {
        const video = document.createElement('video')
        video.src = this.currentAd.bannerUrl
        video.muted = true
        video.autoplay = true
        video.loop = true
        video.playsInline = true
        video.controls = true
        video.style.cssText = 'width: 100%; height: auto; display: block; border-radius: 4px;'
        video.addEventListener('loadeddata', handleRenderSuccess, { once: true })
        video.addEventListener('error', handleRenderError, { once: true })
        mediaElement = video
      } else {
        const img = document.createElement('img')
        img.src = this.currentAd.bannerUrl
        img.alt = this.currentAd.description
        img.style.cssText = 'width: 100%; height: auto; display: block; max-width: 100%; object-fit: contain;'
        img.addEventListener('load', handleRenderSuccess, { once: true })
        img.addEventListener('error', handleRenderError, { once: true })
        mediaElement = img
      }
      mediaElement.style.cursor = mediaType === 'video' ? 'default' : 'pointer'
      mediaElement.style.maxWidth = '100%'

      const handleClickThrough = () => {
        this.sovads._trackEvent('CLICK', this.currentAd!.id, this.currentAd!.campaignId, {
          rendered: true,
          viewportVisible: true,
          renderTime: Date.now() - this.renderStartTime
        })
        this.sovads.logInteraction('CLICK', {
          adId: this.currentAd!.id,
          campaignId: this.currentAd!.campaignId,
          elementType: 'BANNER',
          metadata: { renderTime: Date.now() - this.renderStartTime },
        })
        window.open(this.sovads.normalizeUrl(this.currentAd!.targetUrl), '_blank', 'noopener,noreferrer')
      }

      if (mediaType === 'video') {
        const ctaButton = document.createElement('button')
        ctaButton.type = 'button'
        ctaButton.textContent = 'Learn more'
        ctaButton.style.cssText = `
          width: 100%;
          border: none;
          border-top: 1px solid #333;
          background: #111;
          color: #fff;
          font-size: 12px;
          font-weight: 600;
          padding: 8px 12px;
          cursor: pointer;
        `
        ctaButton.addEventListener('click', handleClickThrough)
        adElement.appendChild(mediaElement)
        adElement.appendChild(ctaButton)
      } else {
        adElement.addEventListener('click', handleClickThrough)
        adElement.appendChild(mediaElement)
      }

      // Add hover effect
      adElement.addEventListener('mouseenter', () => {
        adElement.style.transform = 'scale(1.02)'
      })

      adElement.addEventListener('mouseleave', () => {
        adElement.style.transform = 'scale(1)'
      })

      container.appendChild(adElement)
      
      // Set up auto-refresh if enabled
      this.setupAutoRefresh(consumerId)
    } catch (error) {
      // Retry logic on error
      if (this.retryCount < this.maxRetries) {
        this.retryCount++
        if (this.sovads.getConfig().debug) {
          console.warn(`Banner render failed, retrying (${this.retryCount}/${this.maxRetries})...`)
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * this.retryCount)) // Exponential backoff
        this.isRendering = false
        return this.render(consumerId, true)
      } else {
        const container = document.getElementById(this.containerId)
        if (container) {
          container.innerHTML = '<div class="sovads-error" style="padding: 10px; text-align: center; color: #666; font-size: 12px;">Ad temporarily unavailable</div>'
        }
        if (this.sovads.getConfig().debug) {
          console.error('Banner render failed after retries:', error)
        }
      }
    } finally {
      this.isRendering = false
    }
  }
  
  private async checkViewport(element: HTMLElement): Promise<boolean> {
    return new Promise((resolve) => {
      if (typeof IntersectionObserver === 'undefined') {
        resolve(true) // Fallback: load immediately if IntersectionObserver not supported
        return
      }
      
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              observer.disconnect()
              resolve(true)
            }
          })
        },
        { rootMargin: '50px' } // Start loading 50px before entering viewport
      )
      
      observer.observe(element)
      
      // Timeout after 5 seconds - load anyway
      setTimeout(() => {
        observer.disconnect()
        resolve(true)
      }, 5000)
    })
  }
  
  private setupLazyLoadObserver(container: HTMLElement, consumerId?: string) {
    if (typeof IntersectionObserver === 'undefined') {
      // Fallback: load immediately
      this.render(consumerId)
      return
    }
    
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !this.isRendering) {
            observer.disconnect()
            this.render(consumerId)
          }
        })
      },
      { rootMargin: '50px' }
    )
    
    observer.observe(container)
  }
  
  private setupAutoRefresh(consumerId?: string) {
    // Clear existing timer
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
    }
    
    const refreshInterval = this.sovads.getConfig().refreshInterval || 0
    if (refreshInterval > 0) {
      this.refreshTimer = window.setInterval(() => {
        if (!this.isRendering) {
          this.render(consumerId, true)
        }
      }, refreshInterval * 1000)
    }
  }
  
  public destroy() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = null
    }
  }
}

// Popup Component
export class Popup {
  private sovads: SovAds
  private currentAd: AdComponent | null = null
  private popupElement: HTMLElement | null = null
  private isShowing: boolean = false
  private retryCount: number = 0
  private maxRetries: number = 3
  private storageKeyLastShown = 'sovads_popup_last_shown'
  private storageKeySessionCount = 'sovads_popup_session_count'

  constructor(sovads: SovAds) {
    this.sovads = sovads
  }

  private canShowByFrequencyCap(): boolean {
    try {
      const minIntervalMs = (this.sovads.getConfig().popupMinIntervalMinutes || 30) * 60 * 1000
      const sessionMax = this.sovads.getConfig().popupSessionMax || 1
      const now = Date.now()
      const lastShown = Number(localStorage.getItem(this.storageKeyLastShown) || 0)
      const sessionCount = Number(sessionStorage.getItem(this.storageKeySessionCount) || 0)

      if (sessionCount >= sessionMax) return false
      if (lastShown > 0 && now - lastShown < minIntervalMs) return false
      return true
    } catch {
      return true
    }
  }

  private markShown(): void {
    try {
      const now = Date.now()
      const currentSessionCount = Number(sessionStorage.getItem(this.storageKeySessionCount) || 0)
      localStorage.setItem(this.storageKeyLastShown, String(now))
      sessionStorage.setItem(this.storageKeySessionCount, String(currentSessionCount + 1))
    } catch {
      // Ignore storage access issues.
    }
  }

  async show(consumerId?: string, delay: number = 3000): Promise<void> {
    // Prevent concurrent shows
    if (this.isShowing) {
      if (this.sovads.getConfig().debug) {
        console.warn('Popup show already in progress')
      }
      return
    }

    if (!this.canShowByFrequencyCap()) {
      if (this.sovads.getConfig().debug) {
        console.log('Popup skipped due to frequency cap')
      }
      return
    }

    this.isShowing = true
    try {
      this.currentAd = await this.sovads.loadAd({
        consumerId,
        placement: 'popup',
        size: window.innerWidth < 640 ? '320x100' : '360x120',
      })
      
      if (!this.currentAd) {
        if (this.retryCount < this.maxRetries) {
          this.retryCount++
          await new Promise(resolve => setTimeout(resolve, 1000 * this.retryCount))
          this.isShowing = false
          return this.show(consumerId, delay)
        }
        if (this.sovads.getConfig().debug) {
          console.log('No popup ad available after retries')
        }
        this.isShowing = false
        this.retryCount = 0
        return
      }
      
      this.retryCount = 0 // Reset on success

      // Show popup after delay
      setTimeout(() => {
        this.renderPopup()
        this.markShown()
        this.isShowing = false
      }, delay)
    } catch (error) {
      if (this.sovads.getConfig().debug) {
        console.error('Error loading popup ad:', error)
      }
      this.isShowing = false
      this.retryCount = 0
    }
  }

  private renderPopup() {
    if (!this.currentAd) return

    const renderStartTime = Date.now()
    let impressionTracked = false
    const trackPopupImpression = (rendered: boolean, renderTime: number) => {
      if (impressionTracked || !this.currentAd || this.currentAd.isDummy) return
      impressionTracked = true
      this.sovads._trackEvent('IMPRESSION', this.currentAd.id, this.currentAd.campaignId, {
        rendered,
        viewportVisible: true,
        renderTime,
      })
      this.sovads.logInteraction('IMPRESSION', {
        adId: this.currentAd.id,
        campaignId: this.currentAd.campaignId,
        elementType: 'POPUP',
        metadata: { renderTime, rendered },
      })
    }

    // Create non-blocking sticky container
    const wrapper = document.createElement('div')
    wrapper.className = 'sovads-popup-overlay'
    wrapper.style.cssText = `
      position: fixed;
      right: 16px;
      bottom: 16px;
      width: min(360px, calc(100vw - 24px));
      z-index: 10000;
    `

    // Create popup
    this.popupElement = document.createElement('div')
    this.popupElement.style.cssText = `
      background: white;
      border-radius: 12px;
      padding: 14px;
      max-width: 360px;
      position: relative;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
      opacity: 0;
      transition: opacity 0.2s ease;
    `

    // SovAds logo badge in small left corner
    const logoBadge = document.createElement('div')
    logoBadge.style.cssText = `
      position: absolute;
      top: 8px;
      left: 12px;
      width: 24px;
      height: 24px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: bold;
      color: white;
      z-index: 1;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    `
    logoBadge.textContent = 'SA'
    logoBadge.title = 'SovAds'

    // Close button
    const closeBtn = document.createElement('button')
    closeBtn.innerHTML = '×'
    closeBtn.style.cssText = `
      position: absolute;
      top: 10px;
      right: 15px;
      background: none;
      border: none;
      font-size: 24px;
      cursor: pointer;
      color: #666;
      z-index: 2;
    `

    closeBtn.addEventListener('click', () => {
      this.hide()
    })

    // Add "Ad" message text below logo
    const adLabel = document.createElement('div')
    adLabel.style.cssText = `
      position: absolute;
      top: 36px;
      left: 12px;
      font-size: 9px;
      color: #999;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    `
    adLabel.textContent = 'Ad'

    // Handle dummy ads
    if (this.currentAd.isDummy) {
      const dummyContent = document.createElement('div')
      dummyContent.style.cssText = 'text-align: center; padding: 20px;'

      const img = document.createElement('img')
      img.src = this.currentAd.bannerUrl
      img.alt = 'SovSeas'
      img.style.cssText = 'width: 150px; height: auto; margin: 0 auto 20px; display: block;'
      img.onerror = () => {
        // If image fails to load, create a simple placeholder
        img.style.display = 'none'
        const placeholder = document.createElement('div')
        placeholder.style.cssText = 'width: 150px; height: 75px; margin: 0 auto 20px; background: #e0e0e0; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 14px; color: #666;'
        placeholder.textContent = 'SovSeas'
        dummyContent.insertBefore(placeholder, dummyContent.firstChild)
      }

      const message = document.createElement('div')
      message.textContent = 'Register your site to get ads'
      message.style.cssText = 'color: #333; font-size: 16px; font-weight: 500; margin-bottom: 16px;'

      const link = document.createElement('a')
      link.href = this.sovads.normalizeUrl(this.currentAd.targetUrl)
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      link.textContent = 'Register Now'
      link.style.cssText = 'display: inline-block; padding: 10px 20px; background: #007bff; color: white; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500;'

      dummyContent.appendChild(img)
      dummyContent.appendChild(message)
      dummyContent.appendChild(link)

      this.popupElement.appendChild(logoBadge)
      this.popupElement.appendChild(adLabel)
      this.popupElement.appendChild(closeBtn)
      this.popupElement.appendChild(dummyContent)
      wrapper.appendChild(this.popupElement)
      document.body.appendChild(wrapper)

      // Auto close after 10 seconds
      setTimeout(() => {
        this.hide()
      }, 10000)
      return
    }

    const mediaType = this.currentAd.mediaType === 'video' ? 'video' : 'image'

    const handleMediaError = () => {
      if (this.popupElement) {
        this.popupElement.style.opacity = '1'
      }
      if (this.sovads.getConfig().debug) {
        console.warn(`Failed to load popup ad media: ${this.currentAd!.bannerUrl}`)
      }
      const renderTime = Date.now() - renderStartTime
      trackPopupImpression(false, renderTime)
    }

    let mediaElement: HTMLImageElement | HTMLVideoElement
    if (mediaType === 'video') {
      const video = document.createElement('video')
      video.src = this.currentAd.bannerUrl
      video.muted = true
      video.autoplay = true
      video.loop = true
      video.playsInline = true
      video.controls = true
      video.style.cssText = 'width: 100%; height: auto; border-radius: 8px; cursor: pointer;'
      video.addEventListener('loadeddata', () => {
        if (this.popupElement) {
          this.popupElement.style.opacity = '1'
        }
        const renderTime = Date.now() - renderStartTime
        trackPopupImpression(true, renderTime)
        if (this.sovads.getConfig().debug) {
          console.log(`Popup ad video loaded in ${renderTime}ms`)
        }
      }, { once: true })
      video.addEventListener('error', handleMediaError, { once: true })
      mediaElement = video
    } else {
      const img = document.createElement('img')
      img.src = this.currentAd.bannerUrl
      img.alt = this.currentAd.description
      img.style.cssText = 'width: 100%; height: auto; border-radius: 8px; cursor: pointer;'
      
      img.addEventListener('load', () => {
        if (this.popupElement) {
          this.popupElement.style.opacity = '1'
        }
        const renderTime = Date.now() - renderStartTime
        trackPopupImpression(true, renderTime)
        if (this.sovads.getConfig().debug) {
          console.log(`Popup ad image loaded in ${renderTime}ms`)
        }
      })
      img.addEventListener('error', handleMediaError)
      mediaElement = img
    }

    const handleClickThrough = () => {
      this.sovads._trackEvent('CLICK', this.currentAd!.id, this.currentAd!.campaignId, {
        rendered: true,
        viewportVisible: true,
        renderTime: Date.now() - renderStartTime
      })
      this.sovads.logInteraction('CLICK', {
        adId: this.currentAd!.id,
        campaignId: this.currentAd!.campaignId,
        elementType: 'POPUP',
        metadata: { renderTime: Date.now() - renderStartTime },
      })
      window.open(this.sovads.normalizeUrl(this.currentAd!.targetUrl), '_blank', 'noopener,noreferrer')
      this.hide()
    }

    if (mediaType === 'video') {
      mediaElement.style.cursor = 'default'
    } else {
      mediaElement.style.cursor = 'pointer'
      mediaElement.addEventListener('click', handleClickThrough)
    }

    this.popupElement.appendChild(logoBadge)
    this.popupElement.appendChild(adLabel)
    this.popupElement.appendChild(closeBtn)
    this.popupElement.appendChild(mediaElement)
    if (mediaType === 'video') {
      const ctaButton = document.createElement('button')
      ctaButton.type = 'button'
      ctaButton.textContent = 'Learn more'
      ctaButton.style.cssText = `
        width: 100%;
        margin-top: 10px;
        border: none;
        border-radius: 6px;
        background: #111;
        color: #fff;
        font-size: 12px;
        font-weight: 600;
        padding: 10px 12px;
        cursor: pointer;
      `
      ctaButton.addEventListener('click', handleClickThrough)
      this.popupElement.appendChild(ctaButton)
    }
    wrapper.appendChild(this.popupElement)
    document.body.appendChild(wrapper)

    // Auto close after 10 seconds
    setTimeout(() => {
      this.hide()
    }, 10000)
  }

  hide() {
    const overlay = document.querySelector('.sovads-popup-overlay')
    if (overlay) {
      try {
        // Check if element is still connected to DOM before removing
        if (overlay.isConnected) {
          // Use remove() method which is safer and doesn't require parentNode
          overlay.remove()
        }
      } catch (error) {
        // Element may have already been removed by React or another process
        // Silently fail - this is expected in some cases
        if (this.sovads.getConfig().debug) {
          console.warn('Could not remove popup overlay:', error)
        }
      }
    }
    this.popupElement = null
    this.currentAd = null
  }
}

// Sidebar Component
export class Sidebar {
  private sovads: SovAds
  private containerId: string
  private currentAd: AdComponent | null = null
  private renderStartTime: number = 0
  private hasTrackedImpression: boolean = false
  private isRendering: boolean = false
  private refreshTimer: number | null = null
  private lastAdId: string | null = null
  private retryCount: number = 0
  private maxRetries: number = 3
  private slotConfig: SlotConfig

  constructor(sovads: SovAds, containerId: string, slotConfig: SlotConfig = {}) {
    this.sovads = sovads
    this.containerId = containerId
    this.slotConfig = slotConfig
  }

  async render(consumerId?: string, forceRefresh: boolean = false): Promise<void> {
    // Prevent concurrent renders
    if (this.isRendering && !forceRefresh) {
      if (this.sovads.getConfig().debug) {
        console.warn(`Sidebar render already in progress for ${this.containerId}`)
      }
      return
    }

    this.isRendering = true
    try {
      const container = document.getElementById(this.containerId)
      if (!container) {
        console.error(`Container with id "${this.containerId}" not found`)
        this.isRendering = false
        return
      }

      // Lazy loading: wait for container to be in viewport
      if (this.sovads.getConfig().lazyLoad && !forceRefresh) {
        const isInViewport = await this.checkViewport(container)
        if (!isInViewport) {
          this.setupLazyLoadObserver(container, consumerId)
          this.isRendering = false
          return
        }
      }

      this.renderStartTime = Date.now()
      this.currentAd = await this.sovads.loadAd({
        consumerId,
        placement: this.slotConfig.placementId || 'sidebar',
        size: this.slotConfig.size,
      })
      this.hasTrackedImpression = false
      
      // Skip if same ad (rotation disabled or same ad returned)
      if (!forceRefresh && this.lastAdId === this.currentAd?.id && this.sovads.getConfig().rotationEnabled) {
        if (this.sovads.getConfig().debug) {
          console.log('Same ad returned, skipping render')
        }
        this.isRendering = false
        return
      }
      
      this.lastAdId = this.currentAd?.id || null
      this.retryCount = 0
      
      if (!this.currentAd) {
        container.innerHTML = '<div class="sovads-no-ad">No ads available</div>'
        this.isRendering = false
        return
      }

      // Handle dummy ads for unregistered sites
      if (this.currentAd.isDummy) {
        container.innerHTML = ''
        const dummyElement = document.createElement('div')
        dummyElement.className = 'sovads-sidebar-dummy'
        dummyElement.setAttribute('data-ad-id', this.currentAd.id)
        dummyElement.style.cssText = `
          background: #f9f9f9;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 15px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s ease;
        `

        const img = document.createElement('img')
        img.src = this.currentAd.bannerUrl
        img.alt = 'SovSeas'
        img.style.cssText = 'width: 100px; height: auto; margin: 0 auto 12px; display: block;'
        img.onerror = () => {
          // If image fails to load, create a simple placeholder
          img.style.display = 'none'
          const placeholder = document.createElement('div')
          placeholder.style.cssText = 'width: 100px; height: 50px; margin: 0 auto 12px; background: #e0e0e0; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #666;'
          placeholder.textContent = 'SovSeas'
          dummyElement.insertBefore(placeholder, dummyElement.firstChild)
        }

        const message = document.createElement('div')
        message.textContent = 'Register your site to get ads'
        message.style.cssText = 'color: #333; font-size: 13px; font-weight: 500; margin-top: 8px;'

        dummyElement.appendChild(img)
        dummyElement.appendChild(message)

        dummyElement.addEventListener('click', () => {
          window.open(this.sovads.normalizeUrl(this.currentAd!.targetUrl), '_blank', 'noopener,noreferrer')
        })

        dummyElement.addEventListener('mouseenter', () => {
          dummyElement.style.background = '#f0f0f0'
          dummyElement.style.transform = 'translateY(-2px)'
        })

        dummyElement.addEventListener('mouseleave', () => {
          dummyElement.style.background = '#f9f9f9'
          dummyElement.style.transform = 'translateY(0)'
        })

        container.appendChild(dummyElement)
        this.isRendering = false
        return
      }

      const adElement = document.createElement('div')
      container.innerHTML = ''
      adElement.className = 'sovads-sidebar'
      adElement.setAttribute('data-ad-id', this.currentAd.id)
      const mediaType = this.currentAd.mediaType === 'video' ? 'video' : 'image'
      adElement.style.cssText = `
      background: #f8f9fa;
      border: 1px solid #e9ecef;
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 15px;
      cursor: ${mediaType === 'video' ? 'default' : 'pointer'};
      transition: all 0.2s ease;
      opacity: 0;
    `

      const handleVisibilityTracking = (
        renderInfo: { rendered: boolean; viewportVisible: boolean; renderTime: number }
      ) => {
        this.sovads.setupRenderObserver(adElement, this.currentAd!.id, (isVisible) => {
          renderInfo.viewportVisible = isVisible

          if (isVisible && !this.hasTrackedImpression) {
            this.hasTrackedImpression = true
            this.sovads._trackEvent('IMPRESSION', this.currentAd!.id, this.currentAd!.campaignId, renderInfo)
          }
        })
      }

      const handleRenderSuccess = () => {
        adElement.style.opacity = '1'
        const renderTime = Date.now() - this.renderStartTime
        handleVisibilityTracking({
          rendered: true,
          viewportVisible: false,
          renderTime,
        })
      }

      const handleRenderError = () => {
        adElement.style.opacity = '1'
        if (this.sovads.getConfig().debug) {
          console.warn(`Failed to load sidebar ad media: ${this.currentAd!.bannerUrl}`)
        }
        handleVisibilityTracking({
          rendered: false,
          viewportVisible: false,
          renderTime: Date.now() - this.renderStartTime,
        })
      }

      let mediaElement: HTMLImageElement | HTMLVideoElement
      if (mediaType === 'video') {
        const video = document.createElement('video')
        video.src = this.currentAd.bannerUrl
        video.muted = true
        video.autoplay = true
        video.loop = true
        video.playsInline = true
        video.controls = true
        video.style.cssText = 'width: 100%; height: auto; display: block; border-radius: 4px;'
        video.addEventListener('loadeddata', handleRenderSuccess, { once: true })
        video.addEventListener('error', handleRenderError, { once: true })
        mediaElement = video
      } else {
        const img = document.createElement('img')
        img.src = this.currentAd.bannerUrl
        img.alt = this.currentAd.description
        img.style.cssText = 'width: 100%; height: auto; display: block; border-radius: 4px;'
        img.addEventListener('load', handleRenderSuccess, { once: true })
        img.addEventListener('error', handleRenderError, { once: true })
        mediaElement = img
      }

      const handleClickThrough = () => {
        this.sovads._trackEvent('CLICK', this.currentAd!.id, this.currentAd!.campaignId, {
          rendered: true,
          viewportVisible: true,
          renderTime: Date.now() - this.renderStartTime
        })
        this.sovads.logInteraction('CLICK', {
          adId: this.currentAd!.id,
          campaignId: this.currentAd!.campaignId,
          elementType: 'SIDEBAR',
          metadata: { renderTime: Date.now() - this.renderStartTime },
        })
        window.open(this.sovads.normalizeUrl(this.currentAd!.targetUrl), '_blank', 'noopener,noreferrer')
      }

      // Add hover effect
      adElement.addEventListener('mouseenter', () => {
        adElement.style.background = '#e9ecef'
        adElement.style.transform = 'translateY(-2px)'
      })

      adElement.addEventListener('mouseleave', () => {
        adElement.style.background = '#f8f9fa'
        adElement.style.transform = 'translateY(0)'
      })

      mediaElement.style.cursor = mediaType === 'video' ? 'default' : 'pointer'
      if (mediaType === 'video') {
        const ctaButton = document.createElement('button')
        ctaButton.type = 'button'
        ctaButton.textContent = 'Learn more'
        ctaButton.style.cssText = `
          width: 100%;
          border: none;
          margin-top: 8px;
          background: #111;
          color: #fff;
          font-size: 12px;
          font-weight: 600;
          padding: 8px 12px;
          border-radius: 6px;
          cursor: pointer;
        `
        ctaButton.addEventListener('click', handleClickThrough)
        adElement.appendChild(mediaElement)
        adElement.appendChild(ctaButton)
      } else {
        adElement.addEventListener('click', handleClickThrough)
        adElement.appendChild(mediaElement)
      }
      container.appendChild(adElement)
      
      // Set up auto-refresh if enabled
      this.setupAutoRefresh(consumerId)
    } catch (error) {
      // Retry logic on error
      if (this.retryCount < this.maxRetries) {
        this.retryCount++
        if (this.sovads.getConfig().debug) {
          console.warn(`Sidebar render failed, retrying (${this.retryCount}/${this.maxRetries})...`)
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * this.retryCount))
        this.isRendering = false
        return this.render(consumerId, true)
      } else {
        const container = document.getElementById(this.containerId)
        if (container) {
          container.innerHTML = '<div class="sovads-error" style="padding: 10px; text-align: center; color: #666; font-size: 12px;">Ad temporarily unavailable</div>'
        }
        if (this.sovads.getConfig().debug) {
          console.error('Sidebar render failed after retries:', error)
        }
      }
    } finally {
      this.isRendering = false
    }
  }
  
  private async checkViewport(element: HTMLElement): Promise<boolean> {
    return new Promise((resolve) => {
      if (typeof IntersectionObserver === 'undefined') {
        resolve(true)
        return
      }
      
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              observer.disconnect()
              resolve(true)
            }
          })
        },
        { rootMargin: '50px' }
      )
      
      observer.observe(element)
      
      setTimeout(() => {
        observer.disconnect()
        resolve(true)
      }, 5000)
    })
  }
  
  private setupLazyLoadObserver(container: HTMLElement, consumerId?: string) {
    if (typeof IntersectionObserver === 'undefined') {
      this.render(consumerId)
      return
    }
    
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !this.isRendering) {
            observer.disconnect()
            this.render(consumerId)
          }
        })
      },
      { rootMargin: '50px' }
    )
    
    observer.observe(container)
  }
  
  private setupAutoRefresh(consumerId?: string) {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
    }
    
    const refreshInterval = this.sovads.getConfig().refreshInterval || 0
    if (refreshInterval > 0) {
      this.refreshTimer = window.setInterval(() => {
        if (!this.isRendering) {
          this.render(consumerId, true)
        }
      }, refreshInterval * 1000)
    }
  }
  
  public destroy() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = null
    }
  }
}

// Export main SovAds class
export { SovAds }

// Default export for easy importing
export default SovAds
