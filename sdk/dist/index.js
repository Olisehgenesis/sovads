// SovAds SDK - Modular Ad Network Integration
// Usage: import { SovAds, Banner, Popup, Sidebar } from '@sovads/sdk'
/** Runtime SDK version. Kept in sync with `sdk/package.json#version`.
 *  Sent as `X-SovAds-SDK-Version` on signed tracking requests and exported
 *  so host pages can log / gate on it. */
export const SDK_VERSION = '1.3.1';
export class SovAds {
    constructor(config = {}) {
        this.components = new Map();
        this.siteId = null;
        this.renderObservers = new Map();
        this.debugLoggingEnabled = false;
        this.adTrackingTokens = new Map();
        this.walletAddress = null;
        this.unitListeners = new Map();
        /** Subscribers notified whenever the viewer's wallet identity becomes known
         *  or changes. Used by `renderAttachedCtas` to lazy-mount CTAs once the host
         *  page connects a wallet. */
        this.identityListeners = new Set();
        this.config = {
            apiUrl: 'https://ads.sovseas.xyz',
            debug: false,
            // Phase 6: refresh is OFF by default. Auto-rotating banners on a
            // 30-second cadence is the single biggest source of "click? what
            // click?" disputes \u2014 the ad that recorded the impression isn't the
            // ad the viewer eventually clicked. Publishers who actually want
            // rotation can still opt in by setting this explicitly.
            refreshInterval: 0,
            lazyLoad: true,
            rotationEnabled: true,
            popupMinIntervalMinutes: 30,
            popupSessionMax: 1,
            ...config
        };
        this.debugLoggingEnabled = Boolean(this.config.debug);
        this.fingerprint = this.generateFingerprint();
        // Load persisted wallet address if available
        this.loadPersistedIdentity();
        if (this.config.walletAddress) {
            this.identify(this.config.walletAddress);
        }
        if (this.config.debug) {
            console.log('SovAds SDK initialized:', this.config);
        }
        // Fire-and-forget heartbeat so the publisher dashboard can show an
        // "SDK detected" badge even before any campaign serves an ad to this
        // site. The server throttles writes (10-minute window) so we don't
        // generate a DB write on every page load.
        this.sendHeartbeat();
    }
    /**
     * Lightweight "I'm alive" ping to `/api/sites/heartbeat`. Best-effort:
     * never blocks SDK init, never retries, never surfaces errors to the
     * host page. The server is responsible for write-throttling so we can
     * call this freely on every constructor.
     */
    sendHeartbeat() {
        if (typeof window === 'undefined')
            return;
        // Resolve siteId without forcing a network round-trip if we can avoid
        // it. `detectSiteId()` is idempotent and will fall back to the
        // configured value when present.
        void this.detectSiteId().then((siteId) => {
            if (!siteId)
                return;
            // Skip unregistered / dev placeholder IDs — the server would reject
            // them anyway, so save the round-trip.
            if (siteId.startsWith('temp_'))
                return;
            try {
                const payload = JSON.stringify({
                    siteId,
                    sdkVersion: SDK_VERSION,
                    href: window.location.href,
                });
                const url = `${this.config.apiUrl}/api/sites/heartbeat`;
                // `keepalive` lets the request finish even if the page unloads
                // shortly after init (e.g. SPA route change), so the heartbeat
                // doesn't get cancelled.
                fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: payload,
                    keepalive: true,
                }).catch(() => { });
            }
            catch {
                /* never propagate heartbeat failures */
            }
        }).catch(() => { });
    }
    /**
     * Identifies the current viewer with a wallet address.
     * This links the device fingerprint to the wallet on the backend.
     */
    identify(walletAddress) {
        if (!walletAddress || typeof walletAddress !== 'string')
            return;
        const next = walletAddress.toLowerCase();
        const changed = next !== this.walletAddress;
        this.walletAddress = next;
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                localStorage.setItem('sovads_wallet_address', this.walletAddress);
            }
        }
        catch (e) {
            // Ignore storage errors
        }
        if (this.config.debug) {
            console.log('SovAds Identity set:', this.walletAddress);
        }
        if (changed) {
            this.notifyIdentityListeners();
        }
    }
    /**
     * Subscribe to wallet-identity changes. Fires once immediately if a wallet
     * is already known, then on every subsequent `identify()` call that changes
     * the address. Returns an unsubscribe function.
     */
    onIdentify(cb) {
        this.identityListeners.add(cb);
        // Fire synchronously if we already have an address \u2014 lets callers treat
        // "already connected" and "connects later" the same way.
        if (this.walletAddress) {
            try {
                cb(this.walletAddress);
            }
            catch { /* swallow */ }
        }
        return () => { this.identityListeners.delete(cb); };
    }
    notifyIdentityListeners() {
        for (const cb of this.identityListeners) {
            try {
                cb(this.walletAddress);
            }
            catch { /* swallow */ }
        }
    }
    loadPersistedIdentity() {
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                const saved = localStorage.getItem('sovads_wallet_address');
                if (saved) {
                    this.walletAddress = saved.toLowerCase();
                }
            }
        }
        catch (e) {
            // Ignore storage errors
        }
    }
    generateFingerprint() {
        const storageKey = 'sovads_fingerprint_v1';
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                const existing = window.localStorage.getItem(storageKey);
                if (existing) {
                    return existing;
                }
            }
        }
        catch {
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
        ];
        const value = btoa(browserParts.join('|')).replace(/=+$/g, '');
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.setItem(storageKey, value);
            }
        }
        catch {
            // Ignore storage write failures.
        }
        return value;
    }
    async detectSiteId() {
        if (this.siteId) {
            return this.siteId;
        }
        if (this.config.siteId) {
            this.siteId = this.config.siteId;
            if (this.config.debug) {
                console.log('Using configured site ID:', this.siteId);
            }
            return this.siteId;
        }
        try {
            // Send beacon to detect site ID based on domain
            const domain = window.location.hostname;
            const payload = {
                domain,
                pathname: window.location.pathname,
                fingerprint: this.fingerprint,
                userAgent: navigator.userAgent,
                pageUrl: window.location.href,
                timestamp: Date.now()
            };
            const startTime = Date.now();
            const endpoint = `${this.config.apiUrl}/api/sites/detect`;
            // Send detection request using fetch (beacon doesn't support response)
            const response = await this.fetchWithRetry(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            const duration = Date.now() - startTime;
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
            });
            if (response.ok) {
                const data = await response.json();
                if (data.siteId) {
                    this.siteId = String(data.siteId);
                    if (this.config.debug) {
                        console.log('Site ID detected from API:', this.siteId, data);
                    }
                    return this.siteId;
                }
            }
            // Fallback: generate site ID from domain (for development only)
            // In production, this should trigger registration flow
            const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            if (isLocalhost) {
                this.siteId = `site_${btoa(domain).substring(0, 8)}`;
                if (this.config.debug) {
                    console.log('Generated fallback site ID (dev mode):', this.siteId);
                }
                return this.siteId;
            }
            else {
                // In production, use temp_ prefix to indicate unregistered site
                this.siteId = `temp_${btoa(domain).substring(0, 8)}_${Date.now()}`;
                if (this.config.debug) {
                    console.warn('Unregistered site detected, using temp site ID:', this.siteId);
                }
                return this.siteId;
            }
        }
        catch (error) {
            if (this.config.debug) {
                console.error('Error detecting site ID:', error);
            }
            // Fallback: generate site ID from domain
            const hostname = window.location.hostname;
            const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
            if (isLocalhost) {
                this.siteId = `site_${btoa(hostname).substring(0, 8)}`;
            }
            else {
                this.siteId = `temp_${btoa(hostname).substring(0, 8)}_${Date.now()}`;
            }
            return this.siteId;
        }
    }
    /**
     * Setup IntersectionObserver to verify ad is actually rendered and visible
     * This helps with fraud prevention and accurate impression tracking
     * Falls back to manual visibility check for older browsers
     */
    setupRenderObserver(element, adId, callback) {
        // Clean up existing observer if any
        const existingObserver = this.renderObservers.get(adId);
        if (existingObserver) {
            existingObserver.disconnect();
        }
        // Check if IntersectionObserver is supported
        if (typeof IntersectionObserver !== 'undefined') {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    const isVisible = entry.isIntersecting && entry.intersectionRatio > 0.5;
                    callback(isVisible);
                    if (this.config.debug) {
                        console.log(`Ad ${adId} visibility:`, {
                            isIntersecting: entry.isIntersecting,
                            intersectionRatio: entry.intersectionRatio,
                            isVisible
                        });
                    }
                });
            }, {
                threshold: [0.5], // At least 50% visible
                rootMargin: '0px'
            });
            observer.observe(element);
            this.renderObservers.set(adId, observer);
        }
        else {
            // Fallback for older browsers: manual visibility check
            if (this.config.debug) {
                console.warn(`IntersectionObserver not supported, using fallback for ad ${adId}`);
            }
            const checkVisibility = () => {
                const rect = element.getBoundingClientRect();
                const windowHeight = window.innerHeight || document.documentElement.clientHeight;
                const windowWidth = window.innerWidth || document.documentElement.clientWidth;
                // Check if element is in viewport and at least 50% visible
                const isInViewport = (rect.top < windowHeight &&
                    rect.bottom > 0 &&
                    rect.left < windowWidth &&
                    rect.right > 0);
                if (isInViewport) {
                    const visibleHeight = Math.min(rect.bottom, windowHeight) - Math.max(rect.top, 0);
                    const visibleWidth = Math.min(rect.right, windowWidth) - Math.max(rect.left, 0);
                    const visibleArea = visibleHeight * visibleWidth;
                    const totalArea = rect.height * rect.width;
                    const intersectionRatio = totalArea > 0 ? visibleArea / totalArea : 0;
                    const isVisible = intersectionRatio >= 0.5;
                    callback(isVisible);
                }
                else {
                    callback(false);
                }
            };
            // Check immediately and on scroll/resize
            checkVisibility();
            const scrollHandler = () => checkVisibility();
            const resizeHandler = () => checkVisibility();
            window.addEventListener('scroll', scrollHandler, { passive: true });
            window.addEventListener('resize', resizeHandler, { passive: true });
            // Store cleanup function
            this.renderObservers.set(adId, {
                disconnect: () => {
                    window.removeEventListener('scroll', scrollHandler);
                    window.removeEventListener('resize', resizeHandler);
                }
            });
        }
    }
    /**
     * Get client metadata for tracking
     */
    getClientMetadata() {
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
        };
    }
    /**
     * Normalize URL - add protocol if missing for localhost
     */
    normalizeUrl(url) {
        const trimmed = url.trim();
        if (!trimmed.includes('://')) {
            // Allow localhost URLs without protocol for debugging
            if (trimmed.startsWith('localhost') || trimmed.startsWith('127.0.0.1')) {
                return `http://${trimmed}`;
            }
            // Treat bare domains as https by default.
            return `https://${trimmed}`;
        }
        return trimmed;
    }
    /**
     * Validate URL format
     */
    isValidUrl(url) {
        try {
            const normalized = this.normalizeUrl(url);
            const parsed = new URL(normalized);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        }
        catch {
            return false;
        }
    }
    inferMediaTypeFromUrl(url) {
        const value = (url || '').toLowerCase();
        // Streaming URLs (YouTube/Vimeo/TikTok) are rendered via iframe by the
        // Banner/Popup renderers \u2014 treat them as 'video' here so downstream code
        // knows not to try a hover/click handler, but the actual <iframe> swap
        // happens at render time via toStreamingEmbed().
        if (toStreamingEmbed(value))
            return 'video';
        const videoExts = ['.mp4', '.webm', '.ogg', '.ogv', '.mov', '.m3u8'];
        return videoExts.some((ext) => value.includes(ext)) ? 'video' : 'image';
    }
    /**
     * Fetch with retry logic
     */
    async fetchWithRetry(url, options = {}, maxAttempts = 3) {
        let lastError = null;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const response = await fetch(url, options);
                if (response.ok || attempt === maxAttempts) {
                    return response;
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                if (attempt < maxAttempts) {
                    const delay = Math.pow(2, attempt - 1) * 100; // Exponential backoff
                    if (this.config.debug) {
                        console.warn(`Fetch attempt ${attempt} failed, retrying in ${delay}ms...`);
                    }
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        throw lastError || new Error('Fetch failed after retries');
    }
    async loadAd(options = {}) {
        const startTime = Date.now();
        try {
            const siteId = await this.detectSiteId();
            const url = new URL(`${this.config.apiUrl}/api/ads`);
            url.searchParams.append('siteId', siteId);
            if (options.consumerId || this.config.consumerId) {
                url.searchParams.append('consumerId', (options.consumerId || this.config.consumerId));
            }
            if (options.placement) {
                url.searchParams.append('placement', options.placement);
            }
            if (options.size) {
                url.searchParams.append('size', options.size);
            }
            // Add wallet address for targeting and attribution
            const wallet = options.walletAddress || this.walletAddress;
            if (wallet) {
                url.searchParams.append('wallet', wallet);
            }
            // Opt-in: ask for attached CTA tasks + serve out-of-budget banners
            // (the viewer can still earn via attached CTAs through the points fallback).
            if (options.attached) {
                url.searchParams.append('attached', '1');
            }
            const endpoint = url.toString();
            const response = await this.fetchWithRetry(endpoint);
            const duration = Date.now() - startTime;
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
            });
            // Check if site is not registered (403 or 404)
            if (response.status === 403 || response.status === 404) {
                console.log('Site not registered');
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
                };
            }
            if (!response.ok) {
                throw new Error(`Failed to load ad: ${response.statusText}`);
            }
            const rawAd = await response.json();
            // Validate ad data
            if (!rawAd || !rawAd.bannerUrl || !rawAd.targetUrl) {
                if (this.config.debug) {
                    console.error('Invalid ad data received:', rawAd);
                }
                return null;
            }
            // Validate URLs
            if (!this.isValidUrl(rawAd.bannerUrl)) {
                if (this.config.debug) {
                    console.error('Invalid bannerUrl:', rawAd.bannerUrl);
                }
                return null;
            }
            if (!this.isValidUrl(rawAd.targetUrl)) {
                if (this.config.debug) {
                    console.error('Invalid targetUrl:', rawAd.targetUrl);
                }
                return null;
            }
            const normalizedAd = {
                ...rawAd,
                bannerUrl: this.normalizeUrl(rawAd.bannerUrl),
                targetUrl: this.normalizeUrl(rawAd.targetUrl),
                mediaType: rawAd.mediaType === 'video'
                    ? 'video'
                    : this.inferMediaTypeFromUrl(this.normalizeUrl(rawAd.bannerUrl)),
            };
            if (normalizedAd.trackingToken) {
                this.adTrackingTokens.set(normalizedAd.id, normalizedAd.trackingToken);
            }
            if (this.config.debug) {
                console.log('Ad loaded:', normalizedAd);
            }
            // Log interaction
            await this.logDebug('SDK_INTERACTION', {
                type: 'AD_LOADED',
                adId: normalizedAd.id,
                campaignId: normalizedAd.campaignId,
                siteId,
                pageUrl: window.location.href,
            });
            return normalizedAd;
        }
        catch (error) {
            const duration = Date.now() - startTime;
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
            });
            if (this.config.debug) {
                console.error('Error loading ad:', error);
            }
            return null;
        }
    }
    toBase64(bytes) {
        let binary = '';
        for (const b of bytes) {
            binary += String.fromCharCode(b);
        }
        return btoa(binary);
    }
    async signTrackingPayload(payload, timestamp) {
        if (!this.config.apiSecret || typeof crypto === 'undefined' || !crypto.subtle) {
            return null;
        }
        try {
            const encoder = new TextEncoder();
            const key = await crypto.subtle.importKey('raw', encoder.encode(this.config.apiSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
            const message = `${timestamp}:${payload}`;
            const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
            return this.toBase64(new Uint8Array(signature));
        }
        catch (error) {
            if (this.config.debug) {
                console.error('Failed to sign tracking payload:', error);
            }
            return null;
        }
    }
    async sendTrackingEnvelope(eventPayload, useBeacon) {
        if (eventPayload.trackingToken) {
            const tokenBody = JSON.stringify({
                trackingToken: eventPayload.trackingToken,
                payload: eventPayload,
            });
            const tokenWebhookUrl = `${this.config.apiUrl}/api/webhook/track`;
            try {
                if (useBeacon && navigator.sendBeacon) {
                    return navigator.sendBeacon(tokenWebhookUrl, new Blob([tokenBody], { type: 'application/json' }));
                }
                const response = await fetch(tokenWebhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: tokenBody,
                    keepalive: true,
                });
                return response.ok;
            }
            catch {
                return false;
            }
        }
        if (!this.config.apiKey || !this.config.apiSecret) {
            if (this.config.debug) {
                const devWebhookUrl = `${this.config.apiUrl}/api/webhook/beacon`;
                const body = JSON.stringify(eventPayload);
                try {
                    if (useBeacon && navigator.sendBeacon) {
                        return navigator.sendBeacon(devWebhookUrl, new Blob([body], { type: 'application/json' }));
                    }
                    const response = await fetch(devWebhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body,
                        keepalive: true,
                    });
                    return response.ok;
                }
                catch {
                    return false;
                }
            }
            else {
                console.warn('SovAds: Missing apiKey/apiSecret, skipping signed tracking event');
            }
            return false;
        }
        const timestamp = Date.now();
        const payload = JSON.stringify(eventPayload);
        const signature = await this.signTrackingPayload(payload, timestamp);
        if (!signature) {
            return false;
        }
        const envelope = JSON.stringify({
            apiKey: this.config.apiKey,
            siteId: eventPayload.siteId,
            payload,
            signature,
            timestamp,
        });
        const webhookUrl = `${this.config.apiUrl}/api/webhook/track`;
        if (useBeacon && navigator.sendBeacon) {
            const blob = new Blob([envelope], { type: 'application/json' });
            return navigator.sendBeacon(webhookUrl, blob);
        }
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache',
                'X-SovAds-SDK-Version': SDK_VERSION,
            },
            body: envelope,
            keepalive: true,
        });
        return response.ok;
    }
    /**
     * Track event with retry logic (internal helper)
     */
    async trackEventWithRetry(type, adId, campaignId, renderInfo, attempt, maxAttempts = 3) {
        try {
            const siteId = await this.detectSiteId();
            const metadata = this.getClientMetadata();
            const payload = {
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
            };
            const ok = await this.sendTrackingEnvelope(payload, false);
            if (!ok) {
                throw new Error('Tracking endpoint rejected event');
            }
            if (this.config.debug) {
                console.log(`SovAds: Tracked ${type} event via signed fetch (attempt ${attempt})`, payload);
            }
        }
        catch (error) {
            if (attempt < maxAttempts) {
                // Exponential backoff: 100ms, 200ms, 400ms
                const delay = Math.pow(2, attempt - 1) * 100;
                if (this.config.debug) {
                    console.warn(`SovAds: Retrying ${type} event (attempt ${attempt + 1}/${maxAttempts}) after ${delay}ms`);
                }
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.trackEventWithRetry(type, adId, campaignId, renderInfo, attempt + 1, maxAttempts);
            }
            else {
                if (this.config.debug) {
                    console.error(`SovAds: Failed to track ${type} event after ${maxAttempts} attempts:`, error);
                }
            }
        }
    }
    /**
     * Track event with enhanced metadata using Beacon API
     * Includes render verification, IP (collected server-side), and site ID validation
     */
    async trackEvent(type, adId, campaignId, renderInfo) {
        try {
            const siteId = await this.detectSiteId();
            const metadata = this.getClientMetadata();
            const payload = {
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
                walletAddress: this.walletAddress || undefined
            };
            if (typeof navigator.sendBeacon === 'function') {
                const sent = await this.sendTrackingEnvelope(payload, true);
                if (sent) {
                    if (this.config.debug) {
                        console.log(`SovAds: Tracked ${type} event via signed beacon`, {
                            payload: { ...payload, fingerprint: payload.fingerprint.substring(0, 8) + '...' }
                        });
                    }
                    return;
                }
            }
            // Fallback to signed fetch for older browsers and beacon failures
            if (this.config.debug) {
                console.warn(`SovAds: Beacon unavailable/failed for ${type}, falling back to signed fetch`);
            }
            await this.trackEventWithRetry(type, adId, campaignId, renderInfo, 1);
        }
        catch (error) {
            if (this.config.debug) {
                console.error('Error tracking event:', error);
            }
        }
    }
    // Component management
    addComponent(componentId, component) {
        this.components.set(componentId, component);
    }
    getComponent(componentId) {
        return this.components.get(componentId);
    }
    removeComponent(componentId) {
        this.components.delete(componentId);
    }
    // Expose trackEvent for components (internal use only)
    // Note: This is a workaround to access private method from components
    // In production, consider making trackEvent protected or using a different pattern
    _trackEvent(type, adId, campaignId, renderInfo) {
        return this.trackEvent(type, adId, campaignId, renderInfo);
    }
    /**
     * Get config (for components to access debug mode)
     */
    getConfig() {
        return this.config;
    }
    /**
     * Submit a CTA-task completion (POLL / VISIT_URL / SIGN_MESSAGE) on behalf
     * of the current viewer. Uses plain fetch (no retry) to avoid double-submitting
     * an idempotent task; rate-limit/dedupe is enforced server-side.
     */
    async submitTaskCompletion(params) {
        try {
            const endpoint = `${this.config.apiUrl}/api/tasks/complete`;
            const body = {
                taskId: params.taskId,
                wallet: this.walletAddress || undefined,
                fingerprint: this.fingerprint,
                proof: params.proof || {},
            };
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            let data = null;
            try {
                data = (await response.json());
            }
            catch {
                // server returned non-JSON; treat as error
            }
            return {
                ok: response.ok,
                status: response.status,
                awarded: data?.awarded,
                error: data?.error,
                data,
            };
        }
        catch (err) {
            return {
                ok: false,
                status: 0,
                error: err instanceof Error ? err.message : 'submit failed',
            };
        }
    }
    /**
     * Public accessor for the current wallet address (read-only).
     * CTA renderers use this to suppress wallet-bound rewards on anonymous viewers.
     */
    getWalletAddress() {
        return this.walletAddress;
    }
    /**
     * Fetch this viewer's completion / eligibility status for every active task
     * of a campaign. Used by the attached-CTA panel to mark already-completed
     * tasks with a \u2713 badge after the wallet connects. Returns a Map keyed by
     * taskId so callers can do O(1) lookups; tasks missing from the map are
     * assumed eligible.
     */
    async fetchTaskStatuses(campaignId) {
        const out = new Map();
        if (!campaignId)
            return out;
        try {
            const url = new URL(`${this.config.apiUrl}/api/tasks/status`);
            url.searchParams.set('campaignId', campaignId);
            if (this.walletAddress)
                url.searchParams.set('wallet', this.walletAddress);
            if (this.fingerprint)
                url.searchParams.set('fingerprint', this.fingerprint);
            const response = await fetch(url.toString(), { method: 'GET' });
            if (!response.ok)
                return out;
            const json = (await response.json());
            const tasks = Array.isArray(json?.tasks) ? json.tasks : [];
            for (const t of tasks) {
                if (t && typeof t.id === 'string')
                    out.set(t.id, t);
            }
        }
        catch (err) {
            if (this.config.debug)
                console.warn('[SovAds] fetchTaskStatuses failed', err);
        }
        return out;
    }
    /**
     * Log interaction (public method for components)
     */
    async logInteraction(type, data) {
        await this.logDebug('SDK_INTERACTION', {
            type,
            ...data,
            siteId: this.siteId,
            pageUrl: window.location.href,
        });
    }
    /**
     * Log debug event to server
     */
    async logDebug(type, data) {
        if (!this.debugLoggingEnabled)
            return;
        try {
            const logUrl = `${this.config.apiUrl}/api/debug/log`;
            const payload = { type, data };
            // Use sendBeacon for non-blocking logging
            if (navigator.sendBeacon) {
                const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
                navigator.sendBeacon(logUrl, blob);
            }
            else {
                // Fallback to fetch (fire and forget)
                fetch(logUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    keepalive: true,
                }).catch(() => {
                    // Silently fail - debug logging shouldn't break the app
                });
            }
        }
        catch (error) {
            // Silently fail - debug logging shouldn't break the app
        }
    }
    /**
     * Clean up observers when SDK is destroyed
     */
    destroy() {
        this.renderObservers.forEach((observer) => observer.disconnect());
        this.renderObservers.clear();
        this.unitListeners.forEach((entry) => {
            window.removeEventListener('message', entry.listener);
            try {
                entry.iframe.remove();
            }
            catch { /* noop */ }
        });
        this.unitListeners.clear();
    }
    /**
     * Mount a standalone unit iframe (BANNER / POLL / FEEDBACK / SURVEY) into
     * `containerId`. Forwards lifecycle/interaction events from the iframe
     * (via postMessage protocol) to the supplied `onEvent` callback.
     *
     * Returns an object with `unmount()` for cleanup.
     */
    mountUnit(containerId, options) {
        const container = document.getElementById(containerId);
        if (!container) {
            if (this.config.debug)
                console.error(`SovAds.mountUnit: container #${containerId} not found`);
            return { slotId: '', unmount: () => { } };
        }
        const slotId = options.slotId || `sa-${Math.random().toString(36).slice(2, 10)}`;
        const apiBase = this.config.apiUrl;
        const params = new URLSearchParams();
        params.set('slotId', slotId);
        if (this.siteId)
            params.set('siteId', this.siteId);
        if (options.kind)
            params.set('kind', options.kind);
        if (options.location)
            params.set('location', options.location);
        if (options.placement)
            params.set('placement', options.placement);
        if (options.size)
            params.set('size', options.size);
        const wallet = options.wallet || this.walletAddress;
        if (wallet)
            params.set('wallet', wallet);
        // If siteId wasn't set yet, detect lazily and rebuild the URL once.
        const buildSrc = (sid) => {
            const p = new URLSearchParams(params);
            p.set('siteId', sid);
            return `${apiBase}/r/unit?${p.toString()}`;
        };
        const iframe = document.createElement('iframe');
        iframe.setAttribute('title', 'SovAds Unit');
        iframe.setAttribute('loading', 'lazy');
        // Sandboxed: allow scripts + same-origin (for fetch to apiBase via CORS) +
        // popups for banner link clicks. No top-navigation, no forms, no plugins.
        iframe.setAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox');
        iframe.style.width = '100%';
        iframe.style.border = '0';
        iframe.style.display = 'block';
        iframe.style.minHeight = options.minHeight || '120px';
        iframe.style.background = 'transparent';
        container.appendChild(iframe);
        void this.detectSiteId().then((sid) => {
            iframe.src = buildSrc(sid);
        });
        // Phase 6 \u2014 derive the expected iframe origin once so the postMessage
        // listener can reject events from any other window. Without this check
        // any same-tab iframe could forge { source: 'sovads-unit', \u2026 } messages
        // and trigger our onEvent handler / iframe resize. We tolerate a parse
        // failure (e.g. relative apiUrl) by skipping the check rather than
        // breaking publishers who configure unusual API URLs.
        let expectedOrigin = null;
        try {
            expectedOrigin = new URL(apiBase, typeof window !== 'undefined' ? window.location.href : undefined).origin;
        }
        catch {
            expectedOrigin = null;
        }
        const listener = (ev) => {
            // Origin check: only trust messages from the iframe we mounted.
            if (expectedOrigin && ev.origin !== expectedOrigin)
                return;
            const data = ev.data;
            if (!data || typeof data !== 'object')
                return;
            if (data.source !== 'sovads-unit')
                return;
            if (data.slotId !== slotId)
                return;
            const type = String(data.type);
            const payload = (data.payload || {});
            // Auto-resize iframe in response to RESIZE messages
            if (type === 'RESIZE' && typeof payload.height === 'number') {
                iframe.style.height = `${payload.height}px`;
            }
            try {
                options.onEvent?.({ type: type, payload, slotId });
            }
            catch (e) {
                if (this.config.debug)
                    console.error('SovAds.mountUnit onEvent threw', e);
            }
        };
        window.addEventListener('message', listener);
        this.unitListeners.set(slotId, { listener, iframe });
        const unmount = () => {
            window.removeEventListener('message', listener);
            try {
                iframe.remove();
            }
            catch { /* noop */ }
            this.unitListeners.delete(slotId);
        };
        return { slotId, unmount };
    }
}
export function toStreamingEmbed(url) {
    if (!url)
        return null;
    const trimmed = url.trim();
    if (!trimmed)
        return null;
    // YouTube: youtu.be/{id}, youtube.com/watch?v={id}, youtube.com/shorts/{id},
    // youtube.com/embed/{id}.
    const yt = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/|v\/))([A-Za-z0-9_-]{6,})/i);
    if (yt && yt[1]) {
        return {
            provider: 'youtube',
            // playsinline + modestbranding + rel=0 keeps the embed quiet and clean;
            // no autoplay by default (browsers block autoplay-with-sound anyway).
            embedUrl: `https://www.youtube.com/embed/${yt[1]}?rel=0&modestbranding=1&playsinline=1`,
        };
    }
    // Vimeo: vimeo.com/{id} or player.vimeo.com/video/{id}.
    const vm = trimmed.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
    if (vm && vm[1]) {
        return {
            provider: 'vimeo',
            embedUrl: `https://player.vimeo.com/video/${vm[1]}?byline=0&portrait=0&title=0`,
        };
    }
    // TikTok: tiktok.com/@user/video/{id}.
    const tt = trimmed.match(/tiktok\.com\/(?:@[^/]+\/)?video\/(\d+)/i);
    if (tt && tt[1]) {
        return {
            provider: 'tiktok',
            embedUrl: `https://www.tiktok.com/embed/v2/${tt[1]}`,
        };
    }
    return null;
}
/** Build a sandboxed `<iframe>` for a streaming embed URL. Shared by Banner
 *  and Popup so both surfaces behave identically. */
export function buildStreamingIframe(embed, alt) {
    const iframe = document.createElement('iframe');
    iframe.src = embed.embedUrl;
    iframe.title = alt || 'Sponsored video';
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('allow', 'accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share');
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.style.cssText =
        'width:100%;aspect-ratio:16/9;height:auto;display:block;border:0;background:#000;';
    iframe.dataset.sovadsProvider = embed.provider;
    return iframe;
}
/**
 * Build the media element for an ad. Single source of truth for the
 * image / video / streaming-iframe switch that used to be duplicated across
 * Banner, Sidebar, Popup and BottomBar.
 *
 * The caller is responsible for:
 *  - Attaching `load` / `loadeddata` / `error` listeners (for impression timing).
 *  - Mounting the returned `element` into the DOM.
 *  - Adding a click handler — either on the element (when `clickable=true`)
 *    or on an external "Learn more" button (always, when false).
 */
export function mountMedia(opts) {
    const { ad, style } = opts;
    const streamingEmbed = toStreamingEmbed(ad.bannerUrl);
    if (streamingEmbed) {
        const iframe = buildStreamingIframe(streamingEmbed, ad.description);
        if (style)
            iframe.style.cssText = style;
        return { element: iframe, kind: 'streaming', clickable: false };
    }
    const mediaType = ad.mediaType === 'video' ? 'video' : 'image';
    if (mediaType === 'video') {
        const video = document.createElement('video');
        video.src = ad.bannerUrl;
        video.muted = true;
        video.autoplay = true;
        video.loop = true;
        video.playsInline = true;
        video.controls = true;
        video.style.cssText = style || 'width:100%;height:auto;display:block;border-radius:4px;';
        return { element: video, kind: 'video', clickable: false };
    }
    const img = document.createElement('img');
    img.src = ad.bannerUrl;
    img.alt = ad.description || 'Sponsored';
    img.style.cssText = style || 'width:100%;height:auto;display:block;max-width:100%;object-fit:contain;';
    return { element: img, kind: 'image', clickable: true };
}
export function mountAdMedia(opts) {
    const { ad } = opts;
    const fit = opts.fit ?? 'contain';
    const focus = opts.focus ?? '50% 50%';
    const parsedSize = parseAdSize(opts.size);
    // Blur backdrop only makes sense when (a) we know the slot ratio and (b)
    // we're going to letterbox at all. Cover never letterboxes, so skip it.
    const wantsBlur = (opts.letterboxBlur ?? Boolean(parsedSize)) && fit !== 'cover';
    const wrapper = document.createElement('div');
    wrapper.className = 'sovads-media';
    // When a slot size is known, we let `aspect-ratio` drive the box height
    // (rather than `height:100%`) so the wrapper computes the right shape
    // regardless of whether the parent has a definite height. The media
    // inside then fills the wrapper with `height:100%`, which IS definite
    // because the wrapper's own height is locked by aspect-ratio.
    const wrapperStyle = 'position:relative;overflow:hidden;width:100%;display:block;' +
        (parsedSize ? `aspect-ratio:${parsedSize.width} / ${parsedSize.height};` : '') +
        (opts.maxWidth ? `max-width:${opts.maxWidth};` : '') +
        (opts.borderRadius ? `border-radius:${opts.borderRadius};` : '') +
        (opts.background ? `background:${opts.background};` : '');
    wrapper.style.cssText = wrapperStyle;
    // Streaming embeds (YouTube/Vimeo/TikTok) ship their own player chrome \u2014
    // we just give them a sized box and exit.
    const streamingEmbed = toStreamingEmbed(ad.bannerUrl);
    if (streamingEmbed) {
        const iframe = buildStreamingIframe(streamingEmbed, ad.description);
        iframe.style.cssText = parsedSize
            ? 'position:relative;z-index:1;width:100%;height:100%;display:block;border:0;background:#000;'
            : 'width:100%;aspect-ratio:16/9;height:auto;display:block;border:0;background:#000;';
        wrapper.appendChild(iframe);
        return { wrapper, element: iframe, kind: 'streaming', clickable: false };
    }
    const mediaType = ad.mediaType === 'video' ? 'video' : 'image';
    if (mediaType === 'video') {
        const video = document.createElement('video');
        video.src = ad.bannerUrl;
        video.muted = true;
        video.autoplay = true;
        video.loop = true;
        video.playsInline = true;
        video.controls = true;
        video.style.cssText = parsedSize
            ? `position:relative;z-index:1;display:block;width:100%;height:100%;` +
                `object-fit:${fit === 'auto' ? 'contain' : fit};object-position:${focus};` +
                (opts.borderRadius ? `border-radius:${opts.borderRadius};` : '')
            : 'width:100%;height:auto;display:block;' +
                (opts.borderRadius ? `border-radius:${opts.borderRadius};` : '');
        wrapper.appendChild(video);
        return { wrapper, element: video, kind: 'video', clickable: false };
    }
    // \u2014 image case (the one that was getting clipped) \u2014
    let backdrop = null;
    if (wantsBlur && parsedSize) {
        backdrop = document.createElement('img');
        backdrop.src = ad.bannerUrl;
        backdrop.alt = '';
        backdrop.setAttribute('aria-hidden', 'true');
        backdrop.decoding = 'async';
        // The browser already has the bytes in cache by the time the foreground
        // <img> loads; loading=lazy here would only delay the cosmetic backdrop.
        backdrop.style.cssText =
            'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;' +
                'filter:blur(28px) saturate(1.25);transform:scale(1.15);' +
                'z-index:0;opacity:0;transition:opacity 240ms ease;pointer-events:none;';
        wrapper.appendChild(backdrop);
    }
    const img = document.createElement('img');
    img.src = ad.bannerUrl;
    img.alt = ad.description || 'Sponsored';
    img.decoding = 'async';
    const initialFit = fit === 'auto' ? 'contain' : fit;
    img.style.cssText = parsedSize
        ? `position:relative;z-index:1;display:block;width:100%;height:100%;` +
            `object-fit:${initialFit};object-position:${focus};` +
            (opts.borderRadius ? `border-radius:${opts.borderRadius};` : '')
        : 'position:relative;z-index:1;display:block;width:100%;height:auto;max-width:100%;object-fit:contain;' +
            (opts.borderRadius ? `border-radius:${opts.borderRadius};` : '');
    // `auto` mode: on first paint, compare the creative's natural ratio to the
    // slot ratio. Within \u00b110% \u2192 promote to `cover` (perfect fit, no visible
    // crop) and hide the blur backdrop. Outside that band \u2192 stay on `contain`
    // and fade the backdrop in to soften the letterbox bars.
    if (parsedSize && (fit === 'auto' || backdrop)) {
        const slotRatio = parsedSize.width / parsedSize.height;
        const settleFit = () => {
            const w = img.naturalWidth;
            const h = img.naturalHeight;
            if (!w || !h) {
                if (backdrop)
                    backdrop.style.opacity = '1';
                return;
            }
            const creativeRatio = w / h;
            const drift = Math.abs(creativeRatio - slotRatio) / slotRatio;
            if (fit === 'auto' && drift < 0.1) {
                img.style.objectFit = 'cover';
                // No more letterbox, hide the backdrop entirely.
                if (backdrop)
                    backdrop.remove();
            }
            else if (backdrop) {
                backdrop.style.opacity = '1';
            }
        };
        if (img.complete && img.naturalWidth > 0)
            settleFit();
        else
            img.addEventListener('load', settleFit, { once: true });
    }
    wrapper.appendChild(img);
    return { wrapper, element: img, kind: 'image', clickable: true };
}
/**
 * Build a compact "Sponsored" disclosure badge.
 *
 * Phase 0 only EXPORTS the helper — components do not mount it yet. Phase 2
 * wires it into every render path, opt-out via `new SovAds({ disclosureLabel: false })`.
 *
 * The returned span uses `aria-label="Advertisement"` (the FTC-recommended
 * explicit term) and is sized to remain legible (11px min, 1.0 contrast on
 * standard backgrounds). Position is the caller's responsibility.
 */
export function buildDisclosureBadge(opts) {
    const label = opts?.label ?? 'Sponsored';
    const variant = opts?.variant ?? 'dark';
    const badge = document.createElement('span');
    badge.className = 'sovads-disclosure';
    badge.setAttribute('role', 'note');
    badge.setAttribute('aria-label', 'Advertisement');
    // Phase 5: badge fg/bg pull from CSS variables when defined; otherwise
    // fall back to today's defaults so existing publishers see no change.
    const bg = variant === 'dark'
        ? 'var(--sovads-disclosure-bg-dark, rgba(255,255,255,0.92))'
        : 'var(--sovads-disclosure-bg-light, rgba(0,0,0,0.62))';
    const fg = variant === 'dark'
        ? 'var(--sovads-accent, #2D2D2D)'
        : 'var(--sovads-on-accent-strong, #FFFFFF)';
    badge.style.cssText =
        `display:inline-flex;align-items:center;gap:4px;` +
            `font-size:11px;font-weight:600;line-height:1;` +
            `padding:3px 6px;border-radius:3px;letter-spacing:0.02em;` +
            `background:${bg};color:${fg};` +
            `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;`;
    badge.textContent = opts?.advertiser ? `${label} · ${opts.advertiser}` : label;
    return badge;
}
/**
 * Phase 2 \u2014 resolve the effective disclosure setting from a 3-level cascade:
 *   slot-override \u2192 SovAdsConfig.disclosureLabel \u2192 default (true \u2192 'Sponsored').
 *
 * Returns the resolved label string, or `null` if disclosure is explicitly
 * disabled (which callers should treat as "do not render"). Centralised here
 * so every component reads the rule the same way.
 */
export function resolveDisclosureLabel(slotOverride, configValue) {
    const layered = slotOverride !== undefined ? slotOverride : configValue;
    if (layered === false)
        return null;
    if (typeof layered === 'string' && layered.trim().length > 0)
        return layered;
    return 'Sponsored';
}
/**
 * Phase 2 \u2014 small helper that builds AND positions a disclosure badge over
 * the top-left of an ad surface (absolute positioning). Caller must ensure
 * the parent has `position: relative` (or another non-static positioning
 * context). Returns `null` when disclosure is disabled \u2014 caller should
 * handle that as "do not append".
 */
export function buildPositionedDisclosure(opts) {
    const label = resolveDisclosureLabel(opts.slotOverride, opts.configValue);
    if (label === null)
        return null;
    const badge = buildDisclosureBadge({
        label,
        advertiser: opts.advertiser,
        variant: opts.variant,
    });
    const pos = opts.position ?? 'top-left';
    badge.style.position = 'absolute';
    badge.style.top = '6px';
    if (pos === 'top-left')
        badge.style.left = '6px';
    else
        badge.style.right = '6px';
    badge.style.zIndex = '2';
    return badge;
}
// ============================================================================
// Phase 3 \u2014 CLS (Cumulative Layout Shift) reservation.
//
// Today every component sets `container.style.display = 'none'` before the
// async ad fetch and only shows the box on `<img>` load. That guarantees
// CLS: the page content below the slot is pulled up while the ad fetches
// and gets shoved back down when the image decodes. Lighthouse penalises
// this hard (it's the dominant CLS source for most ad-supported pages).
//
// Phase 3 fix: when the publisher tells us the slot size (e.g. '300x250',
// '728x90'), we reserve the exact aspect-ratio box on the container BEFORE
// the fetch. Layout stays put; media fades in. No size known \u2192 we keep
// today's hide-then-show behaviour for backcompat.
// ============================================================================
/**
 * Parse an IAB-style size string ('300x250', '728x90', '160x600', etc.) into
 * a {width, height} pair. Returns null when the string is malformed so the
 * caller falls back to legacy behaviour rather than throwing.
 */
export function parseAdSize(size) {
    if (!size || typeof size !== 'string')
        return null;
    const m = size.trim().toLowerCase().match(/^(\d{1,5})\s*x\s*(\d{1,5})$/);
    if (!m)
        return null;
    const width = Number.parseInt(m[1], 10);
    const height = Number.parseInt(m[2], 10);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width === 0 || height === 0)
        return null;
    return { width, height };
}
/**
 * Reserve a CLS-safe box on the slot container before the ad fetch starts.
 * Sets `aspect-ratio` so the browser knows the box's intrinsic shape and
 * `max-width` so the slot never grows past the IAB size on large viewports.
 * The container stays visible (no `display: none`) so the page below it
 * keeps its final position.
 *
 * Returns true when reservation was applied. The caller should skip the
 * legacy hide-then-show dance only when this returns true.
 */
export function reserveAdSlot(container, size) {
    const parsed = parseAdSize(size);
    if (!parsed)
        return false;
    // aspect-ratio is supported in every browser shipped since 2021. The
    // `width: 100%` + `max-width` combo lets the slot fluidly shrink on
    // narrow viewports while never exceeding its IAB declared width.
    container.style.aspectRatio = `${parsed.width} / ${parsed.height}`;
    container.style.width = '100%';
    container.style.maxWidth = `${parsed.width}px`;
    // A subtle neutral placeholder background so the reserved box is visible
    // to debug + matches what most ad networks show. Uses CSS variables so
    // Phase 5 theming will override automatically.
    if (!container.style.backgroundColor) {
        container.style.backgroundColor = 'var(--sovads-placeholder-bg, transparent)';
    }
    return true;
}
/**
 * Phase 7 \u2014 returns true when the user / OS prefers reduced motion. Used
 * by hover-scale and translate animations so we don't trigger vestibular
 * discomfort for users who've asked the system to dial back animation.
 * Falls back to `false` (= motion allowed) when matchMedia isn't available
 * so server-side rendering / older browsers see the same animation as today.
 */
export function prefersReducedMotion() {
    try {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
            return false;
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    catch {
        return false;
    }
}
/**
 * Mount the attached-CTA panel for a given surface. Thin wrapper around
 * `renderAttachedCtas` that components can call without re-implementing the
 * try/catch + debug-log boilerplate. Phase 1 routes every component through
 * this helper.
 *
 * The `surface` arg is passed through to `onCtaComplete` callers via the
 * existing AttachedCtaCompleteEvent (no new field today) and used as a hint
 * for layout — POPUP / NATIVE / SIDEBAR stack vertically, BOTTOM_BAR may
 * render inline (decided at the call site).
 */
export function mountCtaPanel(opts) {
    // Wrap the host's onComplete so we can fire a CTA_COMPLETE interaction
    // event tagged with the originating surface. Backward-compat: existing
    // analytics consumers ignore unknown elementType values.
    const wrappedOnComplete = (ev) => {
        try {
            opts.sovads?.logInteraction('CTA_COMPLETE', {
                adId: undefined,
                campaignId: ev.campaignId,
                taskId: ev.taskId,
                kind: ev.kind,
                elementType: opts.surface,
                ok: ev.ok,
                status: ev.status,
                awarded: ev.awarded,
                error: ev.error,
            });
        }
        catch {
            /* analytics best-effort */
        }
        try {
            opts.onComplete?.(ev);
        }
        catch { /* host handler threw */ }
    };
    try {
        renderAttachedCtas({
            container: opts.container,
            sovads: opts.sovads,
            tasks: opts.tasks,
            campaignId: opts.campaignId,
            bannerClickActive: opts.bannerClickActive,
            onComplete: wrappedOnComplete,
            preview: opts.preview,
            layout: opts.layout,
            overlay: opts.overlay,
        });
    }
    catch (e) {
        if (opts.sovads?.getConfig().debug) {
            console.error(`[SovAds] mountCtaPanel(${opts.surface}) failed`, e);
        }
    }
}
// ============================================================================
// Mounts a compact CTA panel beneath a banner whenever the server returns
// `attachedTasks` (only happens when the slot was opened with `attached: true`).
//
// Supported task kinds:
//   - VISIT_URL     \u2192 single "primary" button; opens url, then submits after dwell
//   - SIGN_MESSAGE  \u2192 single "primary" button; emits onCtaComplete with
//                     needsSignature so the host page can sign via its own wallet
//                     (the SDK does not currently hold a signer)
//   - POLL          \u2192 stacked option buttons (one click = one submit)
//
// When `bannerClickActive=false` (campaign out of token budget), the reward
// badge swaps "+N G$" \u2192 "+N pts*" to reflect the points-fallback that
// /api/tasks/complete will apply.
// ============================================================================
/**
 * Public renderer for the attached-CTA panel.
 *
 * Two modes:
 *  - Live (default): mounts the panel with real click handlers; clicking
 *    POLL/VISIT_URL/SIGN_MESSAGE submits via `sovads.submitTaskCompletion`.
 *  - Preview: pass `preview: true` (and omit `sovads`). Renders the same DOM
 *    but disables click handlers and submission — used by the create-campaign
 *    page and the advertiser review queue so the advertiser sees the exact
 *    button the viewer will see, with no risk of side-effects.
 */
export function renderAttachedCtas(opts) {
    const { container, sovads, tasks, campaignId, bannerClickActive, onComplete, preview } = opts;
    const requestedLayout = opts.layout ?? 'stack';
    const overlay = !!opts.overlay;
    // 'auto' resolves at render time: 2 tasks side-by-side, otherwise stack.
    // 1 task in a row would look identical to stack; 3+ tasks side-by-side in
    // a 300px-wide Banner would each end up ~90px wide with a truncated label,
    // so we cap auto-inline at exactly 2.
    const layout = requestedLayout === 'auto'
        ? (tasks.length === 2 ? 'inline' : 'stack')
        : requestedLayout;
    if (!tasks.length)
        return;
    if (!preview && !sovads) {
        // Live mode requires a real SovAds instance.
        console.error('[SovAds] renderAttachedCtas: `sovads` is required when `preview` is not true');
        return;
    }
    const panel = document.createElement('div');
    panel.className = 'sovads-cta-panel';
    panel.setAttribute('data-campaign-id', campaignId);
    panel.setAttribute('data-layout', layout);
    // Record what the caller asked for separately from the resolved value so
    // host pages can style/debug the auto-switch independently.
    if (requestedLayout === 'auto')
        panel.setAttribute('data-layout-requested', 'auto');
    if (preview)
        panel.setAttribute('data-preview', '1');
    if (overlay)
        panel.setAttribute('data-overlay', '1');
    // Three rendering modes:
    //   overlay  \u2014 panel sits absolutely on top of the banner image; the
    //              empty area between tiles is pointer-events:none so banner
    //              click-through still works. A subtle dark gradient under
    //              the tiles keeps light tile colors readable over busy
    //              creatives. POLL / QUIZ kinds opt into this.
    //   inline   \u2014 horizontal row, used by BottomBar where vertical stacking
    //              would blow up the bar height.
    //   stack    \u2014 (default) vertical column under the banner.
    if (overlay) {
        panel.style.cssText = `
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      margin: 0;
      padding: 14px 10px 10px;
      color: var(--sovads-on-accent, #F5F3F0);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      box-sizing: border-box;
      width: 100%;
      background: linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0) 100%);
      pointer-events: none;
      z-index: 2;
    `;
    }
    else {
        panel.style.cssText = layout === 'inline'
            ? `
          margin: 0;
          color: var(--sovads-accent, #2D2D2D);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 13px;
          display: flex;
          flex-direction: row;
          align-items: stretch;
          gap: 6px;
          box-sizing: border-box;
          width: 100%;
        `
            : `
          margin-top: 2px;
          color: var(--sovads-accent, #2D2D2D);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 13px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          box-sizing: border-box;
          width: 100%;
        `;
    }
    container.appendChild(panel);
    const renderBudgetNotice = () => {
        if (bannerClickActive)
            return;
        const notice = document.createElement('div');
        notice.textContent = 'Earn SovPoints by completing a quick task below.';
        notice.style.cssText =
            'font-size:11px;color:#8a6d3b;background:#fff8e1;border:1px solid #ffe082;border-radius:6px;padding:6px 8px;';
        panel.appendChild(notice);
    };
    // Renders the list of CTA buttons into the panel. `statusByTask` is keyed
    // by taskId; tasks present in the map with `completionsUsed > 0` (or with a
    // verified/paid completion) are rendered as a disabled button with a \u2713
    // corner badge. Missing entries are assumed eligible.
    const mountTasks = (statusByTask) => {
        panel.innerHTML = '';
        renderBudgetNotice();
        for (const task of tasks) {
            const status = statusByTask.get(task.id);
            const done = isTaskDone(status);
            const row = buildTaskRow(task, {
                sovads,
                bannerClickActive,
                onComplete,
                preview: !!preview,
                gsLogoUrl: resolveGsLogoUrl(sovads),
                done,
                overlay,
            });
            // In inline layout the row needs to flex so multiple tasks share width
            // equally. In stack mode (default) we leave width alone so the row
            // grows to fill the column \u2014 byte-identical to today.
            if (layout === 'inline') {
                row.style.flex = '1 1 0';
                row.style.minWidth = '0';
            }
            // Overlay mode: the panel itself is pointer-events:none so banner
            // clicks pass through the gradient. Re-enable pointer events on the
            // task row so the tiles inside are still clickable.
            if (overlay) {
                row.style.pointerEvents = 'auto';
            }
            panel.appendChild(row);
        }
    };
    // Preview mode (advertiser-side rendering) never gates on wallet \u2014 the
    // advertiser must always see the live button layout.
    if (preview) {
        mountTasks(new Map());
        return;
    }
    // No wallet-gate: render buttons immediately so anonymous viewers can still
    // click a VISIT_URL (we record start time, open the link, run the dwell
    // timer, and submit) \u2014 attribution falls back to the SDK fingerprint until
    // a wallet connects. When the wallet does arrive we re-fetch task status so
    // already-completed tasks pick up their \u2713 badge.
    mountTasks(new Map());
    // Phase 8 (#5): always fetch statuses, regardless of wallet state. The
    // server's GET /api/tasks/status accepts a `fingerprint`-only lookup and
    // fetchTaskStatuses already forwards `this.fingerprint`. Without this,
    // anonymous viewers who already submitted would see the button as "not
    // done" and only learn it's a duplicate after the server returns 409,
    // surfacing a misleading "Submit failed" message.
    sovads.fetchTaskStatuses(campaignId).then((statusByTask) => {
        if (statusByTask.size === 0)
            return;
        mountTasks(statusByTask);
    }).catch(() => { });
    // Also refresh once a wallet shows up so badges + per-wallet caps become
    // visible from the wallet's perspective (the wallet may carry completion
    // history that the fingerprint lookup didn't surface). One-shot: subsequent
    // renders are driven by the host calling `sovads.identify(...)` which
    // already updates SDK state.
    let unsub = null;
    unsub = sovads.onIdentify(async (next) => {
        if (!next)
            return;
        if (unsub) {
            unsub();
            unsub = null;
        }
        try {
            const statusByTask = await sovads.fetchTaskStatuses(campaignId);
            mountTasks(statusByTask);
        }
        catch {
            /* swallow \u2014 buttons stay live */
        }
    });
}
/** A task counts as "done" for badge purposes when the viewer has any
 *  successful (verified/paid) completion OR has hit `maxPerWallet`. We use
 *  the status response's `eligibility.completionsUsed` plus the completions
 *  array (looking for non-failed records) so a single click immediately
 *  reflects as done on the next render. */
function isTaskDone(status) {
    if (!status)
        return false;
    const used = status.eligibility?.completionsUsed ?? 0;
    if (used > 0)
        return true;
    const successful = (status.completions ?? []).some((c) => c && c.status !== 'failed' && c.status !== 'rejected');
    return successful;
}
/** Build an absolute URL to the G$ logo asset served from /public.
 *  Falls back to a relative path so the asset still works when the SDK is
 *  used inside the sovads frontend itself (preview mode, no instance).      */
function resolveGsLogoUrl(sovads) {
    try {
        const apiBase = sovads?.getConfig()?.apiUrl;
        if (apiBase)
            return `${apiBase.replace(/\/$/, '')}/6961.png`;
    }
    catch {
        /* ignore */
    }
    return '/6961.png';
}
/** Returns the combined reward amount as a single number. Points and G$ are
 *  1:1 in this system (G$ falls back to points when the campaign budget is
 *  exhausted), so we display them as one value with the G$ icon.            */
function totalReward(task) {
    return (task.rewardPoints || 0) + (task.rewardGs || 0);
}
function buildTaskRow(task, ctx) {
    const row = document.createElement('div');
    // `position:relative` so the absolute \u2713 corner badge anchors to the row.
    row.style.cssText = 'position:relative;display:flex;flex-direction:column;gap:2px;';
    // Phase 8 (#12): expose stable identifiers on the row so hosts (admin
    // preview, tests, custom analytics) can look up rows by task instead of
    // DOM index. The index-based fallback breaks the moment we inject any
    // wrapper element (e.g. the POLL reward-chip wrapper).
    row.dataset.taskId = task.id;
    row.dataset.taskKind = task.kind;
    const reward = totalReward(task);
    const status = document.createElement('div');
    status.style.cssText = 'font-size:11px;color:#666;min-height:0;';
    // Phase 7: status text changes mid-submit ('Submitting\u2026', 'Thanks! +N',
    // 'Submit failed', etc.). Mark the node as a polite live region so screen
    // readers announce updates without stealing focus.
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    const setStatus = (text, tone = 'info') => {
        status.textContent = text;
        status.style.color = tone === 'ok' ? '#1f7a3a' : tone === 'err' ? '#a02020' : '#666';
    };
    const submit = async (proof, button) => {
        if (!ctx.sovads)
            return;
        if (button) {
            button.disabled = true;
            button.style.opacity = '0.6';
            button.style.cursor = 'wait';
        }
        setStatus('Submitting\u2026');
        const result = await ctx.sovads.submitTaskCompletion({ taskId: task.id, proof });
        if (result.ok) {
            const aw = result.awarded;
            const total = aw ? (aw.points || 0) + (aw.gs || 0) : reward;
            setStatus(`Thanks! +${total}`, 'ok');
        }
        else {
            setStatus(result.error || `Submit failed (${result.status})`, 'err');
            if (button) {
                button.disabled = false;
                button.style.opacity = '1';
                button.style.cursor = 'pointer';
            }
        }
        try {
            ctx.onComplete?.({
                taskId: task.id,
                campaignId: task.campaignId,
                kind: task.kind,
                ok: result.ok,
                status: result.status,
                awarded: result.awarded,
                error: result.error,
            });
        }
        catch {
            /* host handler threw - swallow */
        }
    };
    // In preview mode buttons render but do nothing on click. We keep the status
    // placeholder so the live and preview layouts match pixel-for-pixel.
    const wireClick = (btn, handler) => {
        if (ctx.preview || ctx.done) {
            btn.style.cursor = 'default';
            btn.setAttribute('aria-disabled', 'true');
            return;
        }
        btn.addEventListener('click', handler);
    };
    // Apply the "already completed" visual treatment: faded button + \u2713
    // corner badge anchored to the row. We intentionally keep the original
    // label so the viewer remembers what they did, just dimmed.
    // Phase 8 (#8): pull the button out of the keyboard tab order and mark it
    // aria-disabled so assistive tech doesn't announce it as actionable.
    // `disabled` already blocks focus in most browsers, but tabIndex=-1 is
    // belt-and-braces across SR + custom keyboard nav.
    const applyDoneStyling = (btn) => {
        if (!ctx.done)
            return;
        btn.disabled = true;
        btn.tabIndex = -1;
        btn.setAttribute('aria-disabled', 'true');
        btn.style.opacity = '0.55';
        btn.style.cursor = 'default';
        btn.style.pointerEvents = 'none';
    };
    if (task.kind === 'VISIT_URL') {
        const btn = makeButton(task.buttonLabel || task.label || 'Visit link', 'primary', {
            reward,
            gsLogoUrl: ctx.gsLogoUrl,
        });
        wireClick(btn, async () => {
            const target = task.url;
            if (target) {
                try {
                    window.open(target, '_blank', 'noopener,noreferrer');
                }
                catch {
                    /* popup blocked - submission still proceeds */
                }
            }
            // Phase 8 (#2 revised): the old "only accrue while source tab visible
            // AND focused" loop punished real viewers \u2014 clicking the CTA opens
            // the destination in a new tab, which immediately takes focus away
            // from the source tab, so the counter never moved. The viewer was
            // told to "keep this tab open" while looking at the *other* tab they
            // just opened.
            //
            // New model: the viewer's engagement signal is "they came back".
            // We listen for the next hidden\u2192visible transition on the source
            // tab, and submit on return iff the wall-clock elapsed is >= the
            // configured minDwell. A mobile / single-tab fallback submits after
            // dwell + 2s in case the browser never fires visibilitychange for
            // _blank navigations.
            //
            // Bots can't pass this without simulating a real document on a
            // headless browser that tracks visibility, AND they need to wait
            // the dwell window \u2014 same per-fingerprint rate limit applies.
            const dwell = Math.min(15000, Math.max(0, task.minDwellMs ?? 3000));
            const startedAt = Date.now();
            btn.disabled = true;
            btn.style.opacity = '0.7';
            btn.style.cursor = 'default';
            setStatus(`Opening\u2026 come back here in ${Math.max(1, Math.round(dwell / 1000))}s to claim +${reward}.`);
            let submitted = false;
            let awaySegments = 0;
            const finalize = async (source) => {
                if (submitted)
                    return;
                submitted = true;
                document.removeEventListener('visibilitychange', onVisChange);
                window.removeEventListener('pagehide', onUnload);
                const dwellMs = Date.now() - startedAt;
                // visibleMs is now "approximate time on destination" \u2014 we report
                // time the source was hidden, not the inverse. Server can still
                // reject implausibly low values.
                const hiddenMs = Math.max(0, dwellMs - 50); // ≈ the whole window
                await submit({ dwellMs, visibleMs: hiddenMs, awaySegments, source }, btn);
            };
            const onVisChange = () => {
                if (document.visibilityState === 'hidden') {
                    awaySegments += 1;
                    return;
                }
                if (document.visibilityState === 'visible') {
                    const elapsed = Date.now() - startedAt;
                    if (elapsed >= dwell) {
                        void finalize('return');
                    }
                    else {
                        const left = Math.max(1, Math.round((dwell - elapsed) / 1000));
                        setStatus(`Stay on the page a few more seconds, then come back (${left}s)\u2026`);
                    }
                }
            };
            const onUnload = () => {
                // Don't submit on unload \u2014 we'd lose attribution context. Just
                // detach so we don't leak when host swaps the panel out via SPA nav.
                document.removeEventListener('visibilitychange', onVisChange);
                window.removeEventListener('pagehide', onUnload);
            };
            document.addEventListener('visibilitychange', onVisChange);
            window.addEventListener('pagehide', onUnload);
            // Fallback: some mobile browsers don't fire visibilitychange for
            // target=_blank popups, especially when the destination opens in
            // the same tab via OS-level handlers. Submit after dwell + 2s.
            setTimeout(() => {
                void finalize('fallback');
            }, dwell + 2000);
        });
        applyDoneStyling(btn);
        row.appendChild(btn);
    }
    else if (task.kind === 'SIGN_MESSAGE') {
        // Phase 8 (#6): when no wallet is connected, the old flow dead-ended \u2014
        // the button got disabled forever after the first click. Now we relabel
        // the button up front so anonymous viewers see "Connect wallet to sign",
        // leave it ENABLED on click (so they can click again after connecting),
        // and swap back to the original label via onIdentify the moment a wallet
        // shows up.
        const originalLabel = task.buttonLabel || task.label || 'Sign to claim';
        const noWalletLabel = 'Connect wallet to sign';
        const hasWallet = !!ctx.sovads?.getWalletAddress();
        const btn = makeButton(hasWallet ? originalLabel : noWalletLabel, 'primary', {
            reward,
            gsLogoUrl: ctx.gsLogoUrl,
        });
        // `makeButton(..., reward)` puts the label in the first <span> child.
        // Hold a handle so onIdentify can swap the text without a full rebuild.
        const labelEl = btn.firstElementChild;
        const setLabel = (text) => {
            if (labelEl && labelEl.tagName === 'SPAN')
                labelEl.textContent = text;
            else
                btn.textContent = text;
        };
        // Live mode only: subscribe to wallet identification so the label tracks
        // reality. Auto-unsub on first wallet arrival. No-op in preview / done.
        if (!ctx.preview && !ctx.done && !hasWallet && ctx.sovads) {
            let unsubSign = null;
            unsubSign = ctx.sovads.onIdentify((next) => {
                if (!next)
                    return;
                setLabel(originalLabel);
                if (unsubSign) {
                    unsubSign();
                    unsubSign = null;
                }
            });
        }
        wireClick(btn, async () => {
            const wallet = ctx.sovads?.getWalletAddress() || null;
            if (!wallet) {
                // Anonymous click: signal the host (so it can pop its connect modal)
                // but DON'T disable the button \u2014 the viewer needs to be able to
                // click again once they're connected.
                setStatus('Connect your wallet, then click again to sign.');
                try {
                    ctx.onComplete?.({
                        taskId: task.id,
                        campaignId: task.campaignId,
                        kind: task.kind,
                        ok: false,
                        status: 0,
                        needsSignature: { message: task.signMessage || task.label },
                    });
                }
                catch {
                    /* host handler threw - swallow */
                }
                return;
            }
            setStatus('Awaiting signature from your wallet\u2026');
            btn.disabled = true;
            btn.style.opacity = '0.6';
            btn.style.cursor = 'wait';
            try {
                ctx.onComplete?.({
                    taskId: task.id,
                    campaignId: task.campaignId,
                    kind: task.kind,
                    ok: false,
                    status: 0,
                    needsSignature: { message: task.signMessage || task.label },
                });
            }
            catch {
                /* host handler threw - swallow */
            }
        });
        applyDoneStyling(btn);
        row.appendChild(btn);
    }
    else if (task.kind === 'POLL' || task.kind === 'QUIZ') {
        // Unified colored-tile renderer (POLL + QUIZ). 2\u20135 options laid out as
        // a Kahoot-style grid (1\u00d72, 2\u00d72, or 2\u00d73 with the 5th spanning the
        // last row). Each tile gets its own fixed hue so the viewer\u2019s eye can
        // pair color with label across both the attached and standalone forms.
        const optionsList = task.options ?? [];
        if (optionsList.length === 0) {
            setStatus(`${task.kind === 'QUIZ' ? 'Quiz' : 'Poll'} has no options.`, 'err');
            row.appendChild(status);
            return row;
        }
        // Reward chip floats above the option grid \u2014 same affordance the
        // standalone iframe paints, so the price reads identically across surfaces.
        // We pair it with the task label in a single header row: label on the
        // left, chip on the right. The label gives the viewer the question
        // (\u201cWhat did you use G$ for?\u201d); without it the tiles read as decisions
        // floating in space, especially in overlay mode where there\u2019s no
        // surrounding card chrome to imply context.
        const rewardChip = makeRewardChip(reward, ctx.gsLogoUrl);
        if (ctx.overlay) {
            // Lift the chip onto the dark gradient: white pill on a dark gradient
            // reads better than the default surface-tinted chip.
            rewardChip.style.background = 'rgba(255,255,255,0.94)';
            rewardChip.style.borderColor = 'rgba(255,255,255,0.94)';
            rewardChip.style.color = '#1a1a1a';
            rewardChip.style.boxShadow = '0 1px 3px rgba(0,0,0,0.25)';
        }
        const headerWrap = document.createElement('div');
        headerWrap.style.cssText =
            'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;';
        const labelEl = document.createElement('div');
        labelEl.textContent = task.label || '';
        labelEl.style.cssText = ctx.overlay
            ? // Overlay: white label over the dark gradient with a subtle text
                // shadow so it stays legible if the banner image is light at the
                // bottom edge (gradient is translucent at the very top of the panel).
                'flex:1 1 auto;min-width:0;font-size:13px;font-weight:700;line-height:1.2;' +
                    'color:#fff;text-shadow:0 1px 2px rgba(0,0,0,0.55);' +
                    'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
            : // Attached (non-overlay): standard dark label on the surface card.
                'flex:1 1 auto;min-width:0;font-size:13px;font-weight:600;line-height:1.2;' +
                    'color:var(--sovads-accent, #2D2D2D);' +
                    'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        headerWrap.appendChild(labelEl);
        headerWrap.appendChild(rewardChip);
        row.appendChild(headerWrap);
        // Palette mirrors /r/unit renderer so attached + iframe stay visually
        // unified. Light yellow (#d89e00) uses dark text for legibility; the rest
        // use white text on saturated backgrounds.
        const TILE_BG = ['#e21b3c', '#1368ce', '#d89e00', '#26890c', '#864cbf'];
        const TILE_FG = ['#fff', '#fff', '#1c1300', '#fff', '#fff'];
        const n = Math.min(5, Math.max(2, optionsList.length));
        // 2 \u2192 single row of 2; 3\u20134 \u2192 2x2 grid; 5 \u2192 2x3 with the last tile
        // spanning both columns of its row so it still reads as primary.
        const cols = n === 2 ? 2 : 2;
        const optionsWrap = document.createElement('div');
        optionsWrap.style.cssText =
            `display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px;`;
        // Single-shot submit guard \u2014 you only get one chance to answer. Wins
        // race conditions where the viewer mashes two tiles before the network
        // round-trip resolves.
        let submitted = false;
        const lockGrid = () => {
            for (const child of Array.from(optionsWrap.children)) {
                ;
                child.disabled = true;
                child.style.cursor = 'default';
            }
        };
        const renderSaved = (text, tone) => {
            // Replace the tile grid with a single confirmation card. Wipe the
            // status text too \u2014 the card itself communicates the outcome and a
            // duplicate \u201cThanks! +N\u201d below would feel like a bug.
            optionsWrap.replaceChildren();
            optionsWrap.style.display = 'flex';
            optionsWrap.style.flexDirection = 'column';
            optionsWrap.style.alignItems = 'stretch';
            const card = document.createElement('div');
            card.setAttribute('role', 'status');
            card.style.cssText =
                'display:flex;align-items:center;justify-content:center;gap:6px;' +
                    'padding:10px 12px;font-size:13px;font-weight:600;line-height:1.2;' +
                    'border:1px solid ' +
                    (tone === 'ok' ? 'var(--sovads-success, #1f7a3a)' : '#a02020') +
                    ';color:' +
                    (tone === 'ok' ? 'var(--sovads-success, #1f7a3a)' : '#a02020') +
                    ';background:var(--sovads-surface, #FAFAF8);border-radius:6px;';
            card.textContent = (tone === 'ok' ? '\u2713 ' : '\u2715 ') + text;
            optionsWrap.appendChild(card);
            setStatus('', 'info');
        };
        optionsList.slice(0, 5).forEach((opt, idx) => {
            const tile = document.createElement('button');
            tile.type = 'button';
            tile.setAttribute('data-option-id', opt.id);
            tile.style.cssText =
                'display:flex;align-items:center;justify-content:center;gap:6px;' +
                    'min-height:44px;padding:8px 10px;' +
                    'border:0;border-radius:6px;cursor:pointer;' +
                    'font-size:13px;font-weight:700;line-height:1.2;text-align:center;' +
                    `background:${TILE_BG[idx % 5]};color:${TILE_FG[idx % 5]};` +
                    'white-space:normal;word-break:break-word;' +
                    'transition:transform 0.05s ease, opacity 0.15s ease;';
            // 5th option spans both columns of its (third) row so the grid still
            // looks balanced instead of leaving an orphan slot.
            if (n === 5 && idx === 4)
                tile.style.gridColumn = '1 / -1';
            tile.textContent = opt.label || `Option ${idx + 1}`;
            wireClick(tile, async () => {
                if (submitted)
                    return;
                submitted = true;
                lockGrid();
                // Visual feedback on the picked tile while we round-trip.
                tile.style.outline = '3px solid rgba(255,255,255,0.6)';
                tile.style.outlineOffset = '-3px';
                if (!ctx.sovads)
                    return;
                setStatus('Submitting\u2026');
                const result = await ctx.sovads.submitTaskCompletion({
                    taskId: task.id,
                    proof: { optionId: opt.id },
                });
                // Notify host listeners regardless of outcome \u2014 mirrors the other
                // task kinds so analytics get a consistent event stream.
                try {
                    ctx.onComplete?.({
                        taskId: task.id,
                        campaignId: task.campaignId,
                        kind: task.kind,
                        ok: result.ok,
                        status: result.status,
                        awarded: result.awarded,
                        error: result.error,
                    });
                }
                catch {
                    /* host handler threw - swallow */
                }
                if (result.ok) {
                    const aw = result.awarded;
                    const total = aw ? (aw.points || 0) + (aw.gs || 0) : reward;
                    renderSaved(`Saved \u00b7 +${total}`, 'ok');
                    return;
                }
                // Already-answered (server returns 409). Treat as a soft \u201csaved\u201d
                // since from the viewer\u2019s POV the choice is final.
                if (result.status === 409) {
                    renderSaved('Already answered', 'ok');
                    return;
                }
                // QUIZ wrong-answer surfaces through the verifier error string.
                // Server today returns a verify failure with a message containing
                // "wrong answer" \u2014 match defensively so we don\u2019t break on minor
                // copy changes.
                const isWrong = /wrong\s+answer/i.test(result.error || '');
                if (task.kind === 'QUIZ' && isWrong) {
                    renderSaved('Wrong answer', 'err');
                    return;
                }
                // Any other failure: re-open the grid so the viewer can try again.
                submitted = false;
                for (const child of Array.from(optionsWrap.children)) {
                    ;
                    child.disabled = false;
                    child.style.cursor = 'pointer';
                }
                tile.style.outline = '';
                setStatus(result.error || `Submit failed (${result.status})`, 'err');
            });
            applyDoneStyling(tile);
            optionsWrap.appendChild(tile);
        });
        row.appendChild(optionsWrap);
    }
    // ✓ corner badge when the viewer has already completed this task. Anchored
    // to the row corner so it sits over the button(s) regardless of layout
    // (single button, side-by-side poll, or vertical poll).
    if (ctx.done) {
        const badge = document.createElement('span');
        badge.title = 'You\u2019ve already completed this';
        badge.setAttribute('aria-label', 'completed');
        badge.textContent = '\u2713';
        badge.style.cssText =
            'position:absolute;top:-6px;right:-6px;z-index:2;' +
                'display:inline-flex;align-items:center;justify-content:center;' +
                'width:20px;height:20px;border-radius:50%;' +
                'background:var(--sovads-success, #22c55e);color:#fff;font-size:12px;font-weight:800;line-height:1;' +
                'border:2px solid var(--sovads-surface, #FAFAF8);box-shadow:0 1px 2px rgba(0,0,0,0.15);' +
                'pointer-events:none;';
        row.appendChild(badge);
        setStatus('Already completed', 'ok');
    }
    row.appendChild(status);
    return row;
}
function makeRewardChip(amount, gsLogoUrl) {
    const chip = document.createElement('span');
    chip.style.cssText =
        'display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;' +
            'color:var(--sovads-accent, #2D2D2D);background:var(--sovads-on-accent, #F5F3F0);' +
            'border:1px solid var(--sovads-accent, #2D2D2D);' +
            'padding:3px 8px;border-radius:999px;line-height:1;';
    const num = document.createElement('span');
    num.textContent = `+${amount}`;
    chip.appendChild(num);
    const img = document.createElement('img');
    img.src = gsLogoUrl;
    img.alt = 'G$';
    img.width = 14;
    img.height = 14;
    img.style.cssText = 'width:14px;height:14px;object-fit:contain;display:block;';
    chip.appendChild(img);
    return chip;
}
function makeButton(label, variant, reward) {
    const btn = document.createElement('button');
    btn.type = 'button';
    const isPrimary = variant === 'primary';
    btn.style.cssText = `
    display: ${reward ? 'flex' : 'inline-flex'};
    align-items: center;
    justify-content: ${reward ? 'space-between' : 'center'};
    gap: 8px;
    border: 1px solid var(--sovads-accent, #2D2D2D);
    border-radius: 6px;
    padding: 10px 12px;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.2;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease, transform 0.05s ease;
    width: 100%;
    box-sizing: border-box;
    text-align: ${reward ? 'left' : 'center'};
    background: ${isPrimary ? 'var(--sovads-accent, #2D2D2D)' : 'var(--sovads-surface, #FAFAF8)'};
    color: ${isPrimary ? 'var(--sovads-on-accent, #F5F3F0)' : 'var(--sovads-accent, #2D2D2D)'};
  `;
    if (reward) {
        const labelEl = document.createElement('span');
        labelEl.textContent = label;
        labelEl.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        btn.appendChild(labelEl);
        const chip = document.createElement('span');
        // Inverted chip vs the button surface so the reward always pops.
        const chipBg = isPrimary
            ? 'var(--sovads-on-accent, #F5F3F0)'
            : 'var(--sovads-accent, #2D2D2D)';
        const chipFg = isPrimary
            ? 'var(--sovads-accent, #2D2D2D)'
            : 'var(--sovads-on-accent, #F5F3F0)';
        chip.style.cssText = `
      display:inline-flex;align-items:center;gap:4px;
      font-size:11px;font-weight:700;
      background:${chipBg};color:${chipFg};
      padding:3px 8px;border-radius:999px;line-height:1;
      flex-shrink:0;
    `;
        const num = document.createElement('span');
        num.textContent = `+${reward.reward}`;
        chip.appendChild(num);
        const img = document.createElement('img');
        img.src = reward.gsLogoUrl;
        img.alt = 'G$';
        img.width = 14;
        img.height = 14;
        img.style.cssText = 'width:14px;height:14px;object-fit:contain;display:block;';
        chip.appendChild(img);
        btn.appendChild(chip);
    }
    else {
        btn.textContent = label;
    }
    // Lightweight hover/active feedback so it visibly behaves like a button.
    // Phase 5: themable hover swatches (caller can override via
    // --sovads-accent-hover / --sovads-surface-hover).
    btn.addEventListener('mouseenter', () => {
        if (btn.disabled)
            return;
        btn.style.background = isPrimary
            ? 'var(--sovads-accent-hover, #1A1A1A)'
            : 'var(--sovads-surface-hover, #EFEDE7)';
    });
    btn.addEventListener('mouseleave', () => {
        if (btn.disabled)
            return;
        btn.style.background = isPrimary
            ? 'var(--sovads-accent, #2D2D2D)'
            : 'var(--sovads-surface, #FAFAF8)';
    });
    btn.addEventListener('mousedown', () => {
        if (btn.disabled)
            return;
        // Phase 7: skip the press animation entirely when the user prefers
        // reduced motion. Hover background change still happens (it's not a
        // movement) so the button keeps its hover affordance.
        if (prefersReducedMotion())
            return;
        btn.style.transform = 'translateY(1px)';
    });
    btn.addEventListener('mouseup', () => {
        if (prefersReducedMotion())
            return;
        btn.style.transform = 'translateY(0)';
    });
    return btn;
}
// Banner Component
export class Banner {
    constructor(sovads, containerId, slotConfig = {}) {
        this.currentAd = null;
        this.renderStartTime = 0;
        this.hasTrackedImpression = false;
        this.isRendering = false;
        this.refreshTimer = null;
        this.lazyLoadObserver = null;
        this.lastAdId = null;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.sovads = sovads;
        this.containerId = containerId;
        this.slotConfig = slotConfig;
    }
    async render(consumerId, forceRefresh = false) {
        // Prevent concurrent renders
        if (this.isRendering && !forceRefresh) {
            if (this.sovads.getConfig().debug) {
                console.warn(`Banner render already in progress for ${this.containerId}`);
            }
            return;
        }
        this.isRendering = true;
        try {
            const container = document.getElementById(this.containerId);
            if (!container) {
                console.error(`Container with id "${this.containerId}" not found`);
                this.isRendering = false;
                return;
            }
            // Phase 3: when the publisher declared a slot size, reserve the
            // CLS-safe aspect-ratio box BEFORE the fetch so the page layout
            // doesn't jump when the ad eventually loads. When no size is given
            // we fall back to the legacy hide-then-show behaviour for backcompat.
            const sizeReserved = reserveAdSlot(container, this.slotConfig.size);
            if (!sizeReserved) {
                // Legacy: hide until media loads.
                container.style.display = 'none';
            }
            // Lazy loading: wait for container to be in viewport
            if (this.sovads.getConfig().lazyLoad && !forceRefresh) {
                const isInViewport = await this.checkViewport(container);
                if (!isInViewport) {
                    // Set up intersection observer for lazy loading
                    this.setupLazyLoadObserver(container, consumerId);
                    this.isRendering = false;
                    return;
                }
            }
            this.renderStartTime = Date.now();
            this.currentAd = await this.sovads.loadAd({
                consumerId,
                placement: this.slotConfig.placementId || 'banner',
                size: this.slotConfig.size,
                // Auto-detect: ask the server for CTAs unless the publisher explicitly opted out.
                attached: this.slotConfig.attached !== false,
            });
            this.hasTrackedImpression = false;
            // Skip if same ad (rotation disabled or same ad returned)
            if (!forceRefresh && this.lastAdId === this.currentAd?.id && this.sovads.getConfig().rotationEnabled) {
                if (this.sovads.getConfig().debug) {
                    console.log('Same ad returned, skipping render');
                }
                this.isRendering = false;
                return;
            }
            this.lastAdId = this.currentAd?.id || null;
            this.retryCount = 0; // Reset retry count on success
            if (!this.currentAd) {
                container.style.display = 'none';
                this.isRendering = false;
                return;
            }
            // Handle dummy ads for unregistered sites
            if (this.currentAd.isDummy) {
                container.innerHTML = '';
                const dummyElement = document.createElement('div');
                dummyElement.className = 'sovads-banner-dummy';
                dummyElement.setAttribute('data-ad-id', this.currentAd.id);
                dummyElement.style.cssText = `
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 20px;
          text-align: center;
          background: #f9f9f9;
          cursor: pointer;
          transition: transform 0.2s ease;
        `;
                const img = document.createElement('img');
                img.src = this.currentAd.bannerUrl;
                img.alt = 'SovSeas';
                img.style.cssText = 'width: 120px; height: auto; margin: 0 auto 12px; display: block;';
                img.onerror = () => {
                    // If image fails to load, create a simple placeholder
                    img.style.display = 'none';
                    const placeholder = document.createElement('div');
                    placeholder.style.cssText = 'width: 120px; height: 60px; margin: 0 auto 12px; background: #e0e0e0; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #666;';
                    placeholder.textContent = 'SovSeas';
                    dummyElement.insertBefore(placeholder, dummyElement.firstChild);
                };
                const message = document.createElement('div');
                message.textContent = 'Register your site to get ads';
                message.style.cssText = 'color: #333; font-size: 14px; font-weight: 500; margin-top: 8px;';
                dummyElement.appendChild(img);
                dummyElement.appendChild(message);
                dummyElement.addEventListener('click', () => {
                    window.open(this.sovads.normalizeUrl(this.currentAd.targetUrl), '_blank', 'noopener,noreferrer');
                });
                dummyElement.addEventListener('mouseenter', () => {
                    // Phase 7: keep the bg change (informative), drop the scale
                    // (movement) when the user prefers reduced motion.
                    if (!prefersReducedMotion())
                        dummyElement.style.transform = 'scale(1.02)';
                    dummyElement.style.background = '#f0f0f0';
                });
                dummyElement.addEventListener('mouseleave', () => {
                    if (!prefersReducedMotion())
                        dummyElement.style.transform = 'scale(1)';
                    dummyElement.style.background = '#f9f9f9';
                });
                container.appendChild(dummyElement);
                this.isRendering = false;
                return;
            }
            const adElement = document.createElement('div');
            container.innerHTML = '';
            adElement.className = 'sovads-banner';
            adElement.setAttribute('data-ad-id', this.currentAd.id);
            // Phase 7: announce the unit as an advertisement to AT users so it
            // can be navigated to / skipped past with rotor + landmark shortcuts.
            adElement.setAttribute('role', 'region');
            adElement.setAttribute('aria-label', 'Advertisement');
            const mediaType = this.currentAd.mediaType === 'video' ? 'video' : 'image';
            // Phase 2: resolve click-target + disclosure once for this render pass.
            // Default for Banner stays 'media' = today's behaviour (backcompat).
            // Video / streaming embeds always render an explicit Learn-more button
            // regardless of clickTarget, because the iframe / <video> controls
            // intercept pointer events.
            const slotClickTarget = this.slotConfig.clickTarget ?? 'media';
            const useButtonCta = slotClickTarget === 'button' || mediaType === 'video';
            adElement.style.cssText = `
      position: relative;
      border: 1px solid #333;
      border-radius: 8px;
      overflow: hidden;
      cursor: ${useButtonCta ? 'default' : 'pointer'};
      transition: transform 0.2s ease;
      max-width: 100%;
      width: 100%;
      box-sizing: border-box;
      opacity: 0;
    `;
            // Phase 3: hide-until-loaded ONLY when we didn't reserve a CLS-safe
            // box up front. When `sizeReserved` is true the container is already
            // showing a placeholder of the right shape; hiding it now would
            // re-introduce the layout shift we just prevented.
            if (!sizeReserved) {
                container.style.display = 'none';
            }
            const handleVisibilityTracking = (renderInfo) => {
                this.sovads.setupRenderObserver(adElement, this.currentAd.id, (isVisible) => {
                    renderInfo.viewportVisible = isVisible;
                    if (isVisible && !this.hasTrackedImpression) {
                        this.hasTrackedImpression = true;
                        this.sovads._trackEvent('IMPRESSION', this.currentAd.id, this.currentAd.campaignId, renderInfo);
                    }
                });
            };
            const handleRenderSuccess = () => {
                adElement.style.opacity = '1';
                container.style.display = 'block';
                const renderTime = Date.now() - this.renderStartTime;
                handleVisibilityTracking({
                    rendered: true,
                    viewportVisible: false,
                    renderTime,
                });
            };
            const handleRenderError = () => {
                adElement.style.opacity = '1';
                if (this.sovads.getConfig().debug) {
                    console.warn(`Failed to load ad media: ${this.currentAd.bannerUrl}`);
                }
                handleVisibilityTracking({
                    rendered: false,
                    viewportVisible: false,
                    renderTime: Date.now() - this.renderStartTime,
                });
            };
            let mediaElement;
            let mediaWrapper;
            {
                const mounted = mountAdMedia({
                    ad: this.currentAd,
                    size: this.slotConfig.size,
                    // Phase 8: default to 'auto' so creatives sized to the slot
                    // (most of them) get a clean object-fit:cover and out-of-ratio
                    // creatives letterbox cleanly with a blur backdrop instead of
                    // being cropped by `overflow:hidden`.
                    fit: this.slotConfig.fit ?? 'auto',
                    focus: this.slotConfig.focus,
                    letterboxBlur: this.slotConfig.letterboxBlur,
                });
                mediaWrapper = mounted.wrapper;
                mediaElement = mounted.element;
                if (mounted.kind === 'streaming' || mounted.kind === 'video') {
                    mediaElement.addEventListener('loadeddata', handleRenderSuccess, { once: true });
                    mediaElement.addEventListener('load', handleRenderSuccess, { once: true });
                }
                else {
                    mediaElement.addEventListener('load', handleRenderSuccess, { once: true });
                }
                mediaElement.addEventListener('error', handleRenderError, { once: true });
            }
            // Streaming iframes can't be made clickable as a whole \u2014 the iframe
            // intercepts pointer events for its own player UI. Video <video> tags
            // get an external "Learn more" button below. Only plain images get the
            // banner-as-link cursor.
            mediaElement.style.cursor = mediaType === 'video' || toStreamingEmbed(this.currentAd.bannerUrl) ? 'default' : 'pointer';
            mediaElement.style.maxWidth = '100%';
            const handleClickThrough = () => {
                // When the campaign is out of token budget, banner click-through is
                // suppressed — viewers earn via the attached CTAs instead.
                if (this.currentAd.bannerClickActive === false) {
                    if (this.sovads.getConfig().debug) {
                        console.log('[SovAds] banner click suppressed (budget exhausted, attached CTAs active)');
                    }
                    return;
                }
                this.sovads._trackEvent('CLICK', this.currentAd.id, this.currentAd.campaignId, {
                    rendered: true,
                    viewportVisible: true,
                    renderTime: Date.now() - this.renderStartTime
                });
                this.sovads.logInteraction('CLICK', {
                    adId: this.currentAd.id,
                    campaignId: this.currentAd.campaignId,
                    elementType: 'BANNER',
                    metadata: { renderTime: Date.now() - this.renderStartTime },
                });
                window.open(this.sovads.normalizeUrl(this.currentAd.targetUrl), '_blank', 'noopener,noreferrer');
            };
            if (useButtonCta) {
                // Explicit "Learn more" button is the only click target. Used for:
                //   - video / streaming embeds (player intercepts pointer events)
                //   - slots configured with `clickTarget: 'button'` (Phase 2 opt-in
                //     for higher-quality click traffic).
                const ctaButton = document.createElement('button');
                ctaButton.type = 'button';
                ctaButton.textContent = 'Learn more';
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
        `;
                ctaButton.addEventListener('click', handleClickThrough);
                adElement.appendChild(mediaWrapper);
                adElement.appendChild(ctaButton);
            }
            else {
                // Legacy: whole element is the click target. Backwards compatible.
                adElement.addEventListener('click', handleClickThrough);
                adElement.appendChild(mediaWrapper);
            }
            // Phase 2: mount the Sponsored disclosure on every render unless
            // explicitly suppressed by config or slot override.
            const disclosure = buildPositionedDisclosure({
                slotOverride: this.slotConfig.disclosureLabel,
                configValue: this.sovads.getConfig().disclosureLabel,
                advertiser: this.sovads.getConfig().advertiserName,
                variant: 'dark',
                position: 'top-left',
            });
            if (disclosure)
                adElement.appendChild(disclosure);
            // Add hover effect
            // Only animate the whole element when the whole element is the click
            // target. With an explicit button the user's pointer is over the button,
            // not the media, so the scale would be misleading. Phase 7: also skip
            // the animation entirely when the user has asked the OS for reduced
            // motion \u2014 the click affordance is already in the cursor.
            if (!useButtonCta && !prefersReducedMotion()) {
                adElement.addEventListener('mouseenter', () => {
                    adElement.style.transform = 'scale(1.02)';
                });
                adElement.addEventListener('mouseleave', () => {
                    adElement.style.transform = 'scale(1)';
                });
            }
            container.appendChild(adElement);
            // Auto-detect: whenever the server returned at least one attached task,
            // mount the CTA panel under the banner. Publisher can suppress this by
            // constructing the slot with `attached: false`. When bannerClickActive=false
            // the CTA panel is the only way the viewer can earn from this impression.
            if (this.slotConfig.attached !== false &&
                Array.isArray(this.currentAd.attachedTasks) &&
                this.currentAd.attachedTasks.length > 0) {
                // POLL / QUIZ kinds render as a Kahoot-style tile grid that overlays
                // the banner image so the banner click-through stays available on
                // the uncovered area. We auto-pick overlay mode when every attached
                // task is one of those kinds; mixed panels (e.g. POLL + VISIT_URL)
                // fall back to stacked-below so the VISIT_URL button isn\u2019t
                // half-hidden under the gradient.
                const attached = this.currentAd.attachedTasks;
                const allChoice = attached.every((t) => t.kind === 'POLL' || t.kind === 'QUIZ');
                // Overlay needs a position:relative anchor that wraps the banner.
                // `adElement` already lives inside `container`; we attach the panel
                // straight onto `adElement` so its `position:absolute` is sized to
                // the banner box, not the (potentially full-width) container.
                const overlayHost = allChoice ? adElement : container;
                if (allChoice) {
                    // Don\u2019t clobber an explicit publisher style \u2014 only set when unset.
                    const pos = adElement.style.position;
                    if (!pos || pos === 'static')
                        adElement.style.position = 'relative';
                }
                try {
                    renderAttachedCtas({
                        container: overlayHost,
                        sovads: this.sovads,
                        tasks: attached,
                        campaignId: this.currentAd.campaignId,
                        bannerClickActive: this.currentAd.bannerClickActive !== false,
                        onComplete: this.slotConfig.onCtaComplete,
                        // 2 tasks → horizontal row (saves the second line under a thin
                        // banner); 1 or 3+ tasks → stack as before. Ignored when
                        // `overlay: true` is set.
                        layout: 'auto',
                        overlay: allChoice,
                    });
                }
                catch (e) {
                    if (this.sovads.getConfig().debug) {
                        console.error('[SovAds] renderAttachedCtas failed', e);
                    }
                }
            }
            // Set up auto-refresh if enabled
            this.setupAutoRefresh(consumerId);
        }
        catch (error) {
            // Retry logic on error
            if (this.retryCount < this.maxRetries) {
                this.retryCount++;
                if (this.sovads.getConfig().debug) {
                    console.warn(`Banner render failed, retrying (${this.retryCount}/${this.maxRetries})...`);
                }
                await new Promise(resolve => setTimeout(resolve, 1000 * this.retryCount)); // Exponential backoff
                this.isRendering = false;
                return this.render(consumerId, true);
            }
            else {
                const container = document.getElementById(this.containerId);
                if (container) {
                    container.innerHTML = '<div class="sovads-error" style="padding: 10px; text-align: center; color: #666; font-size: 12px;">Ad temporarily unavailable</div>';
                }
                if (this.sovads.getConfig().debug) {
                    console.error('Banner render failed after retries:', error);
                }
            }
        }
        finally {
            this.isRendering = false;
        }
    }
    async checkViewport(element) {
        return new Promise((resolve) => {
            if (typeof IntersectionObserver === 'undefined') {
                resolve(true); // Fallback: load immediately if IntersectionObserver not supported
                return;
            }
            const observer = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        observer.disconnect();
                        resolve(true);
                    }
                });
            }, { rootMargin: '50px' } // Start loading 50px before entering viewport
            );
            observer.observe(element);
            // Timeout after 5 seconds - load anyway
            setTimeout(() => {
                observer.disconnect();
                resolve(true);
            }, 5000);
        });
    }
    setupLazyLoadObserver(container, consumerId) {
        if (typeof IntersectionObserver === 'undefined') {
            // Fallback: load immediately
            this.render(consumerId);
            return;
        }
        // Disconnect any previous observer before creating a new one
        if (this.lazyLoadObserver) {
            this.lazyLoadObserver.disconnect();
            this.lazyLoadObserver = null;
        }
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting && !this.isRendering) {
                    observer.disconnect();
                    this.lazyLoadObserver = null;
                    this.render(consumerId);
                }
            });
        }, { rootMargin: '50px' });
        this.lazyLoadObserver = observer;
        observer.observe(container);
    }
    setupAutoRefresh(consumerId) {
        // Clear existing timer
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }
        const refreshInterval = this.sovads.getConfig().refreshInterval || 0;
        if (refreshInterval > 0) {
            this.refreshTimer = window.setInterval(() => {
                if (!this.isRendering) {
                    this.render(consumerId, true);
                }
            }, refreshInterval * 1000);
        }
    }
    destroy() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
        if (this.lazyLoadObserver) {
            this.lazyLoadObserver.disconnect();
            this.lazyLoadObserver = null;
        }
    }
}
export class Popup {
    constructor(sovads) {
        this.currentAd = null;
        this.popupElement = null;
        this.isShowing = false;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.storageKeyLastShown = 'sovads_popup_last_shown';
        this.storageKeySessionCount = 'sovads_popup_session_count';
        /** Phase 1: remembered across the show \u2192 renderPopup boundary so the CTA
         *  mount has access to the original opts without changing renderPopup's
         *  signature (kept private to preserve subclass compatibility). */
        this.currentOpts = {};
        /** Phase 7: keyboard escape hatch. Bound once per show() so we can
         *  removeEventListener on hide() and avoid listener leaks. */
        this.escHandler = null;
        this.sovads = sovads;
    }
    canShowByFrequencyCap() {
        try {
            const minIntervalMs = (this.sovads.getConfig().popupMinIntervalMinutes || 30) * 60 * 1000;
            const sessionMax = this.sovads.getConfig().popupSessionMax || 1;
            const now = Date.now();
            const lastShown = Number(localStorage.getItem(this.storageKeyLastShown) || 0);
            const sessionCount = Number(sessionStorage.getItem(this.storageKeySessionCount) || 0);
            if (sessionCount >= sessionMax)
                return false;
            if (lastShown > 0 && now - lastShown < minIntervalMs)
                return false;
            return true;
        }
        catch {
            return true;
        }
    }
    markShown() {
        try {
            const now = Date.now();
            const currentSessionCount = Number(sessionStorage.getItem(this.storageKeySessionCount) || 0);
            localStorage.setItem(this.storageKeyLastShown, String(now));
            sessionStorage.setItem(this.storageKeySessionCount, String(currentSessionCount + 1));
        }
        catch {
            // Ignore storage access issues.
        }
    }
    /**
     * Show the popup. Two call shapes (both supported \u2014 backwards compatible):
     *
     *   popup.show()                              // defaults
     *   popup.show('consumer-id', 3000)           // legacy positional
     *   popup.show({ consumerId, delay, attached, onCtaComplete })  // recommended
     */
    async show(consumerIdOrOpts, delay) {
        // Normalise the two call shapes into a single opts object. Old positional
        // calls take precedence over delay defaults to preserve today's semantics.
        let opts;
        if (typeof consumerIdOrOpts === 'string' || consumerIdOrOpts === undefined) {
            opts = {
                consumerId: consumerIdOrOpts,
                delay: delay ?? 3000,
            };
        }
        else {
            opts = { delay: 3000, ...consumerIdOrOpts };
        }
        this.currentOpts = opts;
        // Prevent concurrent shows
        if (this.isShowing) {
            if (this.sovads.getConfig().debug) {
                console.warn('Popup show already in progress');
            }
            return;
        }
        if (!this.canShowByFrequencyCap()) {
            if (this.sovads.getConfig().debug) {
                console.log('Popup skipped due to frequency cap');
            }
            return;
        }
        this.isShowing = true;
        try {
            this.currentAd = await this.sovads.loadAd({
                consumerId: opts.consumerId,
                placement: 'popup',
                size: window.innerWidth < 640 ? '320x100' : '360x120',
                // Auto-detect: ask the server for CTAs unless the caller explicitly opted out.
                attached: opts.attached !== false,
            });
            if (!this.currentAd) {
                if (this.retryCount < this.maxRetries) {
                    this.retryCount++;
                    await new Promise(resolve => setTimeout(resolve, 1000 * this.retryCount));
                    this.isShowing = false;
                    return this.show(opts);
                }
                if (this.sovads.getConfig().debug) {
                    console.log('No popup ad available after retries');
                }
                this.isShowing = false;
                this.retryCount = 0;
                return;
            }
            this.retryCount = 0; // Reset on success
            // Show popup after delay
            setTimeout(() => {
                this.renderPopup();
                this.markShown();
                this.isShowing = false;
            }, opts.delay ?? 3000);
        }
        catch (error) {
            if (this.sovads.getConfig().debug) {
                console.error('Error loading popup ad:', error);
            }
            this.isShowing = false;
            this.retryCount = 0;
        }
    }
    renderPopup() {
        if (!this.currentAd)
            return;
        const renderStartTime = Date.now();
        let impressionTracked = false;
        const trackPopupImpression = (rendered, renderTime) => {
            if (impressionTracked || !this.currentAd || this.currentAd.isDummy)
                return;
            impressionTracked = true;
            this.sovads._trackEvent('IMPRESSION', this.currentAd.id, this.currentAd.campaignId, {
                rendered,
                viewportVisible: true,
                renderTime,
            });
            this.sovads.logInteraction('IMPRESSION', {
                adId: this.currentAd.id,
                campaignId: this.currentAd.campaignId,
                elementType: 'POPUP',
                metadata: { renderTime, rendered },
            });
        };
        // Create non-blocking sticky container
        const wrapper = document.createElement('div');
        wrapper.className = 'sovads-popup-overlay';
        // Phase 7: dialog semantics for AT. `aria-modal=false` because the
        // popup deliberately does NOT block page interaction — viewers should
        // be able to keep reading and tab past it. Focus is not trapped here
        // for the same reason.
        wrapper.setAttribute('role', 'dialog');
        wrapper.setAttribute('aria-modal', 'false');
        wrapper.setAttribute('aria-label', 'Advertisement');
        wrapper.style.cssText = `
      position: fixed;
      right: 16px;
      bottom: 16px;
      width: min(360px, calc(100vw - 24px));
      z-index: 10000;
    `;
        // Create popup
        this.popupElement = document.createElement('div');
        // Compact padding: 22px top reserves a thin strip for the absolute
        // "Sponsored" label + close button; 8px elsewhere keeps the media
        // flush with the card edge so the popup feels visually denser than
        // the legacy 14px-all-around treatment.
        this.popupElement.style.cssText = `
      background: white;
      border-radius: 12px;
      padding: 22px 8px 8px 8px;
      max-width: 360px;
      position: relative;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
      opacity: 0;
      transition: opacity 0.2s ease;
    `;
        // (Removed) Legacy 'SA' brand badge \u2014 was visual noise on a small
        // surface and competed with the close button. The Sponsored label
        // below remains as the disclosure.
        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '×';
        closeBtn.style.cssText = `
      position: absolute;
      top: 4px;
      right: 8px;
      background: none;
      border: none;
      font-size: 22px;
      cursor: pointer;
      color: #666;
      z-index: 2;
      line-height: 1;
      padding: 2px 6px;
    `;
        closeBtn.addEventListener('click', () => {
            this.hide();
        });
        // Add "Ad" message text below logo. Phase 2: label text is configurable
        // via SovAdsConfig.disclosureLabel / show({ disclosureLabel }). Passing
        // `false` hides this badge entirely. (advertiserName isn't relevant here
        // — this is the legacy inline label; the SDK-wide advertiser hint only
        // shows up via buildPositionedDisclosure, used by Banner/Sidebar.)
        const popupDisclosureLabel = resolveDisclosureLabel(this.currentOpts.disclosureLabel, this.sovads.getConfig().disclosureLabel);
        const adLabel = document.createElement('div');
        adLabel.style.cssText = `
      position: absolute;
      top: 6px;
      left: 10px;
      font-size: 9px;
      color: #999;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    `;
        if (popupDisclosureLabel) {
            adLabel.textContent = popupDisclosureLabel;
        }
        else {
            // Suppressed by config \u2014 detach so it never enters the DOM.
            adLabel.style.display = 'none';
        }
        // Handle dummy ads
        if (this.currentAd.isDummy) {
            const dummyContent = document.createElement('div');
            dummyContent.style.cssText = 'text-align: center; padding: 20px;';
            const img = document.createElement('img');
            img.src = this.currentAd.bannerUrl;
            img.alt = 'SovSeas';
            img.style.cssText = 'width: 150px; height: auto; margin: 0 auto 20px; display: block;';
            img.onerror = () => {
                // If image fails to load, create a simple placeholder
                img.style.display = 'none';
                const placeholder = document.createElement('div');
                placeholder.style.cssText = 'width: 150px; height: 75px; margin: 0 auto 20px; background: #e0e0e0; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 14px; color: #666;';
                placeholder.textContent = 'SovSeas';
                dummyContent.insertBefore(placeholder, dummyContent.firstChild);
            };
            const message = document.createElement('div');
            message.textContent = 'Register your site to get ads';
            message.style.cssText = 'color: #333; font-size: 16px; font-weight: 500; margin-bottom: 16px;';
            const link = document.createElement('a');
            link.href = this.sovads.normalizeUrl(this.currentAd.targetUrl);
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = 'Register Now';
            link.style.cssText = 'display: inline-block; padding: 10px 20px; background: #007bff; color: white; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500;';
            dummyContent.appendChild(img);
            dummyContent.appendChild(message);
            dummyContent.appendChild(link);
            this.popupElement.appendChild(adLabel);
            this.popupElement.appendChild(closeBtn);
            this.popupElement.appendChild(dummyContent);
            wrapper.appendChild(this.popupElement);
            document.body.appendChild(wrapper);
            this.bindEscHandler();
            // Auto close after 10 seconds
            setTimeout(() => {
                this.hide();
            }, 10000);
            return;
        }
        const mediaType = this.currentAd.mediaType === 'video' ? 'video' : 'image';
        const handleMediaError = () => {
            if (this.popupElement) {
                this.popupElement.style.opacity = '1';
            }
            if (this.sovads.getConfig().debug) {
                console.warn(`Failed to load popup ad media: ${this.currentAd.bannerUrl}`);
            }
            const renderTime = Date.now() - renderStartTime;
            trackPopupImpression(false, renderTime);
        };
        let mediaElement;
        let mediaWrapper;
        const streamingEmbed = toStreamingEmbed(this.currentAd.bannerUrl);
        {
            const mounted = mountAdMedia({
                ad: this.currentAd,
                // Popups don't have a fixed slot ratio \u2014 we don't pass `size` so the
                // wrapper falls back to media-driven layout. `auto` fit + (optional)
                // blur backdrop still apply if the publisher explicitly opts in.
                fit: this.currentOpts.fit ?? 'auto',
                focus: this.currentOpts.focus,
                letterboxBlur: this.currentOpts.letterboxBlur ?? false,
                borderRadius: '8px',
            });
            mediaWrapper = mounted.wrapper;
            mediaElement = mounted.element;
            const onSuccess = () => {
                if (this.popupElement)
                    this.popupElement.style.opacity = '1';
                const renderTime = Date.now() - renderStartTime;
                trackPopupImpression(true, renderTime);
                if (this.sovads.getConfig().debug) {
                    console.log(`Popup ad ${mounted.kind} loaded in ${renderTime}ms`);
                }
            };
            if (mounted.kind === 'video' || mounted.kind === 'streaming') {
                mediaElement.addEventListener('loadeddata', onSuccess, { once: true });
                mediaElement.addEventListener('load', onSuccess, { once: true });
            }
            else {
                mediaElement.addEventListener('load', onSuccess, { once: true });
            }
            mediaElement.addEventListener('error', handleMediaError, { once: true });
        }
        const handleClickThrough = () => {
            this.sovads._trackEvent('CLICK', this.currentAd.id, this.currentAd.campaignId, {
                rendered: true,
                viewportVisible: true,
                renderTime: Date.now() - renderStartTime
            });
            this.sovads.logInteraction('CLICK', {
                adId: this.currentAd.id,
                campaignId: this.currentAd.campaignId,
                elementType: 'POPUP',
                metadata: { renderTime: Date.now() - renderStartTime },
            });
            window.open(this.sovads.normalizeUrl(this.currentAd.targetUrl), '_blank', 'noopener,noreferrer');
            this.hide();
        };
        // Phase 2: caller can force a button click target instead of the
        // legacy click-the-whole-image behaviour.
        //
        // Render policy:
        //   - 'media'  (default for images) — image is clickable AND a visible
        //              "Learn more" button is rendered below as an explicit
        //              affordance. Without the button the popup looks like a
        //              decorative card, viewers don't realise they can click.
        //   - 'button' — only the button is clickable (image is decorative).
        //   - video / streaming embeds — only the button is clickable, because
        //              the media element captures its own pointer events.
        const popupClickTarget = this.currentOpts.clickTarget ?? 'media';
        const mediaIsClickable = popupClickTarget === 'media' && mediaType !== 'video' && !streamingEmbed;
        if (mediaIsClickable) {
            mediaElement.style.cursor = 'pointer';
            mediaElement.addEventListener('click', handleClickThrough);
        }
        else {
            mediaElement.style.cursor = 'default';
        }
        this.popupElement.appendChild(adLabel);
        this.popupElement.appendChild(closeBtn);
        this.popupElement.appendChild(mediaWrapper);
        // Render an explicit "Learn more" button only when the media itself is
        // NOT clickable (i.e. clickTarget === 'button', or media is video /
        // streaming embed). When the image is clickable, the image is the CTA
        // and adding a second button would be visual noise.
        if (!mediaIsClickable) {
            const ctaButton = document.createElement('button');
            ctaButton.type = 'button';
            ctaButton.textContent = 'Learn more';
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
      `;
            ctaButton.addEventListener('click', handleClickThrough);
            this.popupElement.appendChild(ctaButton);
        }
        // Auto-detect: mount attached CTAs inside the popup card whenever the
        // server returned at least one task. Caller can suppress with `attached: false`.
        if (this.currentOpts.attached !== false &&
            Array.isArray(this.currentAd.attachedTasks) &&
            this.currentAd.attachedTasks.length > 0) {
            const ctaSlot = document.createElement('div');
            ctaSlot.style.cssText = 'margin-top:10px;';
            this.popupElement.appendChild(ctaSlot);
            mountCtaPanel({
                container: ctaSlot,
                sovads: this.sovads,
                surface: 'POPUP',
                tasks: this.currentAd.attachedTasks,
                campaignId: this.currentAd.campaignId,
                bannerClickActive: this.currentAd.bannerClickActive !== false,
                onComplete: this.currentOpts.onCtaComplete,
                // 2 tasks → horizontal row to keep the popup compact; otherwise
                // stack so 3+ tasks don't crush their labels.
                layout: 'auto',
            });
        }
        wrapper.appendChild(this.popupElement);
        document.body.appendChild(wrapper);
        this.bindEscHandler();
        // Auto close after 10 seconds \u2014 but only when there are no CTAs to
        // complete. If the viewer might be mid-interaction with an attached task
        // (typing, signing, waiting for dwell), keep the card open until they
        // dismiss it manually.
        const hasCtas = this.currentOpts.attached !== false &&
            Array.isArray(this.currentAd?.attachedTasks) &&
            (this.currentAd?.attachedTasks?.length ?? 0) > 0;
        if (!hasCtas) {
            setTimeout(() => {
                this.hide();
            }, 10000);
        }
    }
    /** Phase 7: keyboard escape hatch. The popup is a non-modal sticky card,
     *  so we don't trap focus — but pressing Esc anywhere should dismiss it.
     *  Bound on each renderPopup() so re-shows install a fresh handler, and
     *  always paired with removeEventListener in hide(). */
    bindEscHandler() {
        if (typeof document === 'undefined')
            return;
        if (this.escHandler) {
            document.removeEventListener('keydown', this.escHandler);
        }
        this.escHandler = (ev) => {
            if (ev.key === 'Escape' || ev.key === 'Esc') {
                this.hide();
            }
        };
        document.addEventListener('keydown', this.escHandler);
    }
    hide() {
        // Phase 7: detach the Esc key listener before tearing down the DOM so
        // we don't leak handlers across show → hide cycles.
        if (this.escHandler) {
            document.removeEventListener('keydown', this.escHandler);
            this.escHandler = null;
        }
        const overlay = document.querySelector('.sovads-popup-overlay');
        if (overlay) {
            try {
                // Check if element is still connected to DOM before removing
                if (overlay.isConnected) {
                    // Use remove() method which is safer and doesn't require parentNode
                    overlay.remove();
                }
            }
            catch (error) {
                // Element may have already been removed by React or another process
                // Silently fail - this is expected in some cases
                if (this.sovads.getConfig().debug) {
                    console.warn('Could not remove popup overlay:', error);
                }
            }
        }
        this.popupElement = null;
        this.currentAd = null;
    }
}
export class BottomBar {
    constructor(sovads) {
        this.barElement = null;
        this.currentAd = null;
        this.isVisible = false;
        this.retryCount = 0;
        this.maxRetries = 3;
        /** Phase 1: remembered across show \u2192 renderBar so the CTA mount has
         *  access to the original opts. */
        this.currentOpts = {};
        /** Phase 7: keyboard escape hatch. Bound when the bar is appended to
         *  the DOM, removed in hide() to avoid listener leaks. */
        this.escHandler = null;
        this.sovads = sovads;
    }
    /**
     * Show the bottom bar. Two call shapes (both supported \u2014 backwards compatible):
     *
     *   bottomBar.show()
     *   bottomBar.show('consumer-id')                 // legacy positional
     *   bottomBar.show({ consumerId, attached, onCtaComplete })  // recommended
     */
    async show(consumerIdOrOpts) {
        let opts;
        if (typeof consumerIdOrOpts === 'string' || consumerIdOrOpts === undefined) {
            opts = { consumerId: consumerIdOrOpts };
        }
        else {
            opts = { ...consumerIdOrOpts };
        }
        this.currentOpts = opts;
        if (this.isVisible) {
            if (this.sovads.getConfig().debug) {
                console.warn('BottomBar already visible');
            }
            return;
        }
        try {
            this.currentAd = await this.sovads.loadAd({
                consumerId: opts.consumerId,
                placement: 'bottom-bar',
                size: 'full-width',
                // Auto-detect: ask the server for CTAs unless the caller explicitly opted out.
                attached: opts.attached !== false,
            });
            if (!this.currentAd) {
                if (this.retryCount < this.maxRetries) {
                    this.retryCount++;
                    await new Promise(resolve => setTimeout(resolve, 1000 * this.retryCount));
                    return this.show(opts);
                }
                if (this.sovads.getConfig().debug) {
                    console.log('No bottom‑bar ad available after retries');
                }
                this.retryCount = 0;
                return;
            }
            this.retryCount = 0;
            this.renderBar();
            this.isVisible = true;
        }
        catch (error) {
            if (this.sovads.getConfig().debug) {
                console.error('Error loading bottom bar ad:', error);
            }
        }
    }
    renderBar() {
        if (!this.currentAd)
            return;
        const renderStart = Date.now();
        let impressionTracked = false;
        const trackImp = (rendered, renderTime) => {
            if (impressionTracked || !this.currentAd || this.currentAd.isDummy)
                return;
            impressionTracked = true;
            this.sovads._trackEvent('IMPRESSION', this.currentAd.id, this.currentAd.campaignId, {
                rendered,
                viewportVisible: true,
                renderTime,
            });
        };
        // wrapper fixed bottom
        const wrapper = document.createElement('div');
        wrapper.className = 'sovads-bottom-bar';
        // Phase 7: region landmark + label so AT users can jump straight to /
        // past the bar with rotor navigation.
        wrapper.setAttribute('role', 'region');
        wrapper.setAttribute('aria-label', 'Advertisement');
        wrapper.style.cssText = `
      position: fixed;
      left: 0;
      bottom: 0;
      width: 100%;
      z-index: 10000;
      display: flex;
      justify-content: center;
      background: rgba(255,255,255,0.95);
      box-shadow: 0 -2px 6px rgba(0,0,0,0.2);
    `;
        const bar = document.createElement('div');
        bar.style.cssText = `
      max-width: 720px;
      width: 100%;
      position: relative;
      padding: 8px;
      cursor: pointer;
    `;
        // close button
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '×';
        closeBtn.style.cssText = `
      position: absolute;
      right: 8px;
      top: 8px;
      background: none;
      border: none;
      font-size: 20px;
      cursor: pointer;
      color: #666;
    `;
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.hide();
        });
        // create media element (Phase 8 \u2014 ratio-aware mount).
        // BottomBar has no fixed slot size, so we leave `size` unset and let the
        // wrapper drive layout from the media's intrinsic ratio.
        const mediaType = this.currentAd.mediaType === 'video' ? 'video' : 'image';
        let mediaEl;
        let mediaWrap;
        {
            const mounted = mountAdMedia({
                ad: this.currentAd,
                fit: this.currentOpts.fit ?? 'auto',
                focus: this.currentOpts.focus,
                letterboxBlur: this.currentOpts.letterboxBlur ?? false,
            });
            mediaEl = mounted.element;
            mediaWrap = mounted.wrapper;
            const onSuccess = () => {
                const rt = Date.now() - renderStart;
                trackImp(true, rt);
            };
            const onErr = () => {
                const rt = Date.now() - renderStart;
                trackImp(false, rt);
            };
            if (mounted.kind === 'video' || mounted.kind === 'streaming') {
                mediaEl.addEventListener('loadeddata', onSuccess, { once: true });
                mediaEl.addEventListener('load', onSuccess, { once: true });
            }
            else {
                mediaEl.addEventListener('load', onSuccess, { once: true });
            }
            mediaEl.addEventListener('error', onErr, { once: true });
        }
        const handleClick = () => {
            if (!this.currentAd)
                return;
            this.sovads._trackEvent('CLICK', this.currentAd.id, this.currentAd.campaignId, {
                rendered: true,
                viewportVisible: true,
                renderTime: Date.now() - renderStart,
            });
            window.open(this.sovads.normalizeUrl(this.currentAd.targetUrl), '_blank', 'noopener,noreferrer');
            this.hide();
        };
        bar.appendChild(closeBtn);
        // Phase 2: resolve click-target + disclosure once.
        // BottomBar default stays 'media' (bar-wide click) for full backwards
        // compatibility. Publishers worried about accidental clicks should set
        // `{ clickTarget: 'button' }` in the show() options, which renders an
        // explicit "Learn more" button inside the bar instead.
        const barClickTarget = this.currentOpts.clickTarget ?? 'media';
        const useButtonCta = barClickTarget === 'button' || mediaType === 'video';
        // Mount disclosure once \u2014 same badge regardless of CTA layout.
        // We anchor it inside `bar` because `wrapper` is the fullscreen rail.
        const disclosure = buildPositionedDisclosure({
            slotOverride: this.currentOpts.disclosureLabel,
            configValue: this.sovads.getConfig().disclosureLabel,
            advertiser: this.sovads.getConfig().advertiserName,
            variant: 'light',
            position: 'top-left',
        });
        if (disclosure)
            bar.appendChild(disclosure);
        // Auto-detect: when CTAs were returned, lay media + CTA panel in a
        // horizontal row. Media keeps its own click target (so the existing
        // banner-click path still works); CTA buttons get their own click handlers
        // and we suppress the bar-wide click handler so taps on a poll option
        // don't double-fire as a banner click + redirect. Caller can opt out with
        // `attached: false`.
        const hasCtas = this.currentOpts.attached !== false &&
            Array.isArray(this.currentAd.attachedTasks) &&
            this.currentAd.attachedTasks.length > 0;
        if (hasCtas) {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;flex-direction:row;gap:12px;align-items:center;width:100%;';
            const mediaCol = document.createElement('div');
            mediaCol.style.cssText = `flex:1 1 auto;min-width:0;cursor:${useButtonCta ? 'default' : 'pointer'};`;
            mediaCol.appendChild(mediaWrap);
            // Phase 2: only the media column is clickable when clickTarget='media'.
            // With 'button', media is silent and viewers must use the inline CTA
            // panel (which has its own per-task buttons).
            if (!useButtonCta) {
                mediaCol.addEventListener('click', handleClick);
            }
            row.appendChild(mediaCol);
            const ctaCol = document.createElement('div');
            ctaCol.style.cssText = 'flex:0 0 auto;min-width:160px;max-width:50%;';
            // Stop propagation so taps on CTA buttons don't bubble into the bar's
            // legacy click handler (kept off in this branch, but defence-in-depth).
            ctaCol.addEventListener('click', (e) => e.stopPropagation());
            row.appendChild(ctaCol);
            bar.appendChild(row);
            mountCtaPanel({
                container: ctaCol,
                sovads: this.sovads,
                surface: 'BOTTOM_BAR',
                tasks: this.currentAd.attachedTasks,
                campaignId: this.currentAd.campaignId,
                bannerClickActive: this.currentAd.bannerClickActive !== false,
                onComplete: this.currentOpts.onCtaComplete,
                layout: 'inline',
            });
        }
        else if (useButtonCta) {
            // No attached tasks but caller wants an explicit click target. Render
            // the media + a "Learn more" pill underneath, same as Banner/Popup.
            bar.style.cursor = 'default';
            bar.appendChild(mediaWrap);
            const ctaButton = document.createElement('button');
            ctaButton.type = 'button';
            ctaButton.textContent = 'Learn more';
            ctaButton.style.cssText = `
        display:block;
        margin: 8px auto 0;
        border: none;
        border-radius: 6px;
        background: #111;
        color: #fff;
        font-size: 12px;
        font-weight: 600;
        padding: 8px 16px;
        cursor: pointer;
      `;
            ctaButton.addEventListener('click', (e) => {
                e.stopPropagation();
                handleClick();
            });
            bar.appendChild(ctaButton);
        }
        else {
            bar.appendChild(mediaWrap);
            bar.addEventListener('click', handleClick);
        }
        wrapper.appendChild(bar);
        document.body.appendChild(wrapper);
        this.barElement = wrapper;
        // Phase 7: dismiss on Esc. The bar is non-modal so we don't trap focus,
        // but the keyboard still needs an explicit escape hatch.
        if (typeof document !== 'undefined') {
            if (this.escHandler)
                document.removeEventListener('keydown', this.escHandler);
            this.escHandler = (ev) => {
                if (ev.key === 'Escape' || ev.key === 'Esc')
                    this.hide();
            };
            document.addEventListener('keydown', this.escHandler);
        }
    }
    hide() {
        if (this.escHandler) {
            document.removeEventListener('keydown', this.escHandler);
            this.escHandler = null;
        }
        if (this.barElement && this.barElement.isConnected) {
            this.barElement.remove();
        }
        this.barElement = null;
        this.currentAd = null;
        this.isVisible = false;
    }
}
// Sidebar Component
export class Sidebar {
    constructor(sovads, containerId, slotConfig = {}) {
        this.currentAd = null;
        this.renderStartTime = 0;
        this.hasTrackedImpression = false;
        this.isRendering = false;
        this.refreshTimer = null;
        this.lazyLoadObserver = null;
        this.lastAdId = null;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.sovads = sovads;
        this.containerId = containerId;
        this.slotConfig = slotConfig;
    }
    async render(consumerId, forceRefresh = false) {
        // Prevent concurrent renders
        if (this.isRendering && !forceRefresh) {
            if (this.sovads.getConfig().debug) {
                console.warn(`Sidebar render already in progress for ${this.containerId}`);
            }
            return;
        }
        this.isRendering = true;
        try {
            const container = document.getElementById(this.containerId);
            if (!container) {
                console.error(`Container with id "${this.containerId}" not found`);
                this.isRendering = false;
                return;
            }
            // Phase 3: CLS reservation. See Banner.render() for the rationale.
            // Sidebars are usually fixed-width but variable-height, so reserving
            // the IAB aspect ratio still prevents the column re-flow that today
            // happens when the ad image loads.
            reserveAdSlot(container, this.slotConfig.size);
            // Lazy loading: wait for container to be in viewport
            if (this.sovads.getConfig().lazyLoad && !forceRefresh) {
                const isInViewport = await this.checkViewport(container);
                if (!isInViewport) {
                    this.setupLazyLoadObserver(container, consumerId);
                    this.isRendering = false;
                    return;
                }
            }
            this.renderStartTime = Date.now();
            this.currentAd = await this.sovads.loadAd({
                consumerId,
                placement: this.slotConfig.placementId || 'sidebar',
                size: this.slotConfig.size,
                // Auto-detect: ask the server for CTAs unless the publisher explicitly opted out.
                attached: this.slotConfig.attached !== false,
            });
            this.hasTrackedImpression = false;
            // Skip if same ad (rotation disabled or same ad returned)
            if (!forceRefresh && this.lastAdId === this.currentAd?.id && this.sovads.getConfig().rotationEnabled) {
                if (this.sovads.getConfig().debug) {
                    console.log('Same ad returned, skipping render');
                }
                this.isRendering = false;
                return;
            }
            this.lastAdId = this.currentAd?.id || null;
            this.retryCount = 0;
            if (!this.currentAd) {
                container.innerHTML = '<div class="sovads-no-ad">No ads available</div>';
                this.isRendering = false;
                return;
            }
            // Handle dummy ads for unregistered sites
            if (this.currentAd.isDummy) {
                container.innerHTML = '';
                const dummyElement = document.createElement('div');
                dummyElement.className = 'sovads-sidebar-dummy';
                dummyElement.setAttribute('data-ad-id', this.currentAd.id);
                dummyElement.style.cssText = `
          background: #f9f9f9;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 15px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s ease;
        `;
                const img = document.createElement('img');
                img.src = this.currentAd.bannerUrl;
                img.alt = 'SovSeas';
                img.style.cssText = 'width: 100px; height: auto; margin: 0 auto 12px; display: block;';
                img.onerror = () => {
                    // If image fails to load, create a simple placeholder
                    img.style.display = 'none';
                    const placeholder = document.createElement('div');
                    placeholder.style.cssText = 'width: 100px; height: 50px; margin: 0 auto 12px; background: #e0e0e0; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #666;';
                    placeholder.textContent = 'SovSeas';
                    dummyElement.insertBefore(placeholder, dummyElement.firstChild);
                };
                const message = document.createElement('div');
                message.textContent = 'Register your site to get ads';
                message.style.cssText = 'color: #333; font-size: 13px; font-weight: 500; margin-top: 8px;';
                dummyElement.appendChild(img);
                dummyElement.appendChild(message);
                dummyElement.addEventListener('click', () => {
                    window.open(this.sovads.normalizeUrl(this.currentAd.targetUrl), '_blank', 'noopener,noreferrer');
                });
                dummyElement.addEventListener('mouseenter', () => {
                    dummyElement.style.background = '#f0f0f0';
                    if (!prefersReducedMotion())
                        dummyElement.style.transform = 'translateY(-2px)';
                });
                dummyElement.addEventListener('mouseleave', () => {
                    dummyElement.style.background = '#f9f9f9';
                    if (!prefersReducedMotion())
                        dummyElement.style.transform = 'translateY(0)';
                });
                container.appendChild(dummyElement);
                this.isRendering = false;
                return;
            }
            const adElement = document.createElement('div');
            container.innerHTML = '';
            adElement.className = 'sovads-sidebar';
            adElement.setAttribute('data-ad-id', this.currentAd.id);
            // Phase 7: a11y — see Banner.render() for rationale.
            adElement.setAttribute('role', 'region');
            adElement.setAttribute('aria-label', 'Advertisement');
            const mediaType = this.currentAd.mediaType === 'video' ? 'video' : 'image';
            // Phase 2: same click-target / disclosure pattern as Banner.
            const slotClickTarget = this.slotConfig.clickTarget ?? 'media';
            const useButtonCta = slotClickTarget === 'button' || mediaType === 'video';
            adElement.style.cssText = `
      position: relative;
      background: #f8f9fa;
      border: 1px solid #e9ecef;
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 15px;
      cursor: ${useButtonCta ? 'default' : 'pointer'};
      transition: all 0.2s ease;
      opacity: 0;
    `;
            const handleVisibilityTracking = (renderInfo) => {
                this.sovads.setupRenderObserver(adElement, this.currentAd.id, (isVisible) => {
                    renderInfo.viewportVisible = isVisible;
                    if (isVisible && !this.hasTrackedImpression) {
                        this.hasTrackedImpression = true;
                        this.sovads._trackEvent('IMPRESSION', this.currentAd.id, this.currentAd.campaignId, renderInfo);
                    }
                });
            };
            const handleRenderSuccess = () => {
                adElement.style.opacity = '1';
                const renderTime = Date.now() - this.renderStartTime;
                handleVisibilityTracking({
                    rendered: true,
                    viewportVisible: false,
                    renderTime,
                });
            };
            const handleRenderError = () => {
                adElement.style.opacity = '1';
                if (this.sovads.getConfig().debug) {
                    console.warn(`Failed to load sidebar ad media: ${this.currentAd.bannerUrl}`);
                }
                handleVisibilityTracking({
                    rendered: false,
                    viewportVisible: false,
                    renderTime: Date.now() - this.renderStartTime,
                });
            };
            let mediaElement;
            let mediaWrapper;
            {
                const mounted = mountAdMedia({
                    ad: this.currentAd,
                    size: this.slotConfig.size,
                    fit: this.slotConfig.fit ?? 'auto',
                    focus: this.slotConfig.focus,
                    letterboxBlur: this.slotConfig.letterboxBlur,
                    borderRadius: '4px',
                });
                mediaWrapper = mounted.wrapper;
                mediaElement = mounted.element;
                if (mounted.kind === 'video' || mounted.kind === 'streaming') {
                    mediaElement.addEventListener('loadeddata', handleRenderSuccess, { once: true });
                    mediaElement.addEventListener('load', handleRenderSuccess, { once: true });
                }
                else {
                    mediaElement.addEventListener('load', handleRenderSuccess, { once: true });
                }
                mediaElement.addEventListener('error', handleRenderError, { once: true });
            }
            const handleClickThrough = () => {
                this.sovads._trackEvent('CLICK', this.currentAd.id, this.currentAd.campaignId, {
                    rendered: true,
                    viewportVisible: true,
                    renderTime: Date.now() - this.renderStartTime
                });
                this.sovads.logInteraction('CLICK', {
                    adId: this.currentAd.id,
                    campaignId: this.currentAd.campaignId,
                    elementType: 'SIDEBAR',
                    metadata: { renderTime: Date.now() - this.renderStartTime },
                });
                window.open(this.sovads.normalizeUrl(this.currentAd.targetUrl), '_blank', 'noopener,noreferrer');
            };
            // Add hover effect. Phase 7: bg change always fires; translateY only
            // when motion is allowed.
            adElement.addEventListener('mouseenter', () => {
                adElement.style.background = '#e9ecef';
                if (!prefersReducedMotion())
                    adElement.style.transform = 'translateY(-2px)';
            });
            adElement.addEventListener('mouseleave', () => {
                adElement.style.background = '#f8f9fa';
                if (!prefersReducedMotion())
                    adElement.style.transform = 'translateY(0)';
            });
            mediaElement.style.cursor = useButtonCta ? 'default' : 'pointer';
            if (useButtonCta) {
                const ctaButton = document.createElement('button');
                ctaButton.type = 'button';
                ctaButton.textContent = 'Learn more';
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
        `;
                ctaButton.addEventListener('click', handleClickThrough);
                adElement.appendChild(mediaWrapper);
                adElement.appendChild(ctaButton);
            }
            else {
                adElement.addEventListener('click', handleClickThrough);
                adElement.appendChild(mediaWrapper);
            }
            // Phase 2: mount disclosure badge after media so it stacks on top.
            const disclosure = buildPositionedDisclosure({
                slotOverride: this.slotConfig.disclosureLabel,
                configValue: this.sovads.getConfig().disclosureLabel,
                advertiser: this.sovads.getConfig().advertiserName,
                variant: 'light',
                position: 'top-left',
            });
            if (disclosure)
                adElement.appendChild(disclosure);
            container.appendChild(adElement);
            // Auto-detect: mount attached CTAs under the sidebar ad whenever the
            // server returned at least one task. Same semantics as Banner. Publisher
            // can suppress this by constructing the slot with `attached: false`.
            if (this.slotConfig.attached !== false &&
                Array.isArray(this.currentAd.attachedTasks) &&
                this.currentAd.attachedTasks.length > 0) {
                mountCtaPanel({
                    container,
                    sovads: this.sovads,
                    surface: 'SIDEBAR',
                    tasks: this.currentAd.attachedTasks,
                    campaignId: this.currentAd.campaignId,
                    bannerClickActive: this.currentAd.bannerClickActive !== false,
                    onComplete: this.slotConfig.onCtaComplete,
                    layout: 'stack',
                });
            }
            // Set up auto-refresh if enabled
            this.setupAutoRefresh(consumerId);
        }
        catch (error) {
            // Retry logic on error
            if (this.retryCount < this.maxRetries) {
                this.retryCount++;
                if (this.sovads.getConfig().debug) {
                    console.warn(`Sidebar render failed, retrying (${this.retryCount}/${this.maxRetries})...`);
                }
                await new Promise(resolve => setTimeout(resolve, 1000 * this.retryCount));
                this.isRendering = false;
                return this.render(consumerId, true);
            }
            else {
                const container = document.getElementById(this.containerId);
                if (container) {
                    container.innerHTML = '<div class="sovads-error" style="padding: 10px; text-align: center; color: #666; font-size: 12px;">Ad temporarily unavailable</div>';
                }
                if (this.sovads.getConfig().debug) {
                    console.error('Sidebar render failed after retries:', error);
                }
            }
        }
        finally {
            this.isRendering = false;
        }
    }
    async checkViewport(element) {
        return new Promise((resolve) => {
            if (typeof IntersectionObserver === 'undefined') {
                resolve(true);
                return;
            }
            const observer = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        observer.disconnect();
                        resolve(true);
                    }
                });
            }, { rootMargin: '50px' });
            observer.observe(element);
            setTimeout(() => {
                observer.disconnect();
                resolve(true);
            }, 5000);
        });
    }
    setupLazyLoadObserver(container, consumerId) {
        if (typeof IntersectionObserver === 'undefined') {
            this.render(consumerId);
            return;
        }
        if (this.lazyLoadObserver) {
            this.lazyLoadObserver.disconnect();
            this.lazyLoadObserver = null;
        }
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting && !this.isRendering) {
                    observer.disconnect();
                    this.lazyLoadObserver = null;
                    this.render(consumerId);
                }
            });
        }, { rootMargin: '50px' });
        this.lazyLoadObserver = observer;
        observer.observe(container);
    }
    setupAutoRefresh(consumerId) {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }
        const refreshInterval = this.sovads.getConfig().refreshInterval || 0;
        if (refreshInterval > 0) {
            this.refreshTimer = window.setInterval(() => {
                if (!this.isRendering) {
                    this.render(consumerId, true);
                }
            }, refreshInterval * 1000);
        }
    }
    destroy() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
        if (this.lazyLoadObserver) {
            this.lazyLoadObserver.disconnect();
            this.lazyLoadObserver = null;
        }
    }
}
export class Overlay {
    constructor(sovads) {
        this.currentAd = null;
        this.overlayElement = null;
        this.isShowing = false;
        this.currentOpts = {};
        this.escHandler = null;
        this.previousBodyOverflow = '';
        // Subclasses (Interstitial) override these to get independent caps.
        this.storageKeyLastShown = 'sovads_overlay_last_shown';
        this.storageKeySessionCount = 'sovads_overlay_session_count';
        this.placement = 'overlay';
        this.sovads = sovads;
    }
    canShowByFrequencyCap() {
        try {
            // Reuse Popup's tuning knobs \u2014 publishers shouldn't have to think about
            // a second set of dials for the overlay surface.
            const minIntervalMs = (this.sovads.getConfig().popupMinIntervalMinutes || 30) * 60 * 1000;
            const sessionMax = this.sovads.getConfig().popupSessionMax || 1;
            const now = Date.now();
            const lastShown = Number(localStorage.getItem(this.storageKeyLastShown) || 0);
            const sessionCount = Number(sessionStorage.getItem(this.storageKeySessionCount) || 0);
            if (sessionCount >= sessionMax)
                return false;
            if (lastShown > 0 && now - lastShown < minIntervalMs)
                return false;
            return true;
        }
        catch {
            return true;
        }
    }
    markShown() {
        try {
            const now = Date.now();
            const currentSessionCount = Number(sessionStorage.getItem(this.storageKeySessionCount) || 0);
            localStorage.setItem(this.storageKeyLastShown, String(now));
            sessionStorage.setItem(this.storageKeySessionCount, String(currentSessionCount + 1));
        }
        catch {
            // Ignore storage failures (private mode, quota, etc).
        }
    }
    /**
     * Show the overlay. Two call shapes (both supported \u2014 backwards compatible):
     *
     *   overlay.show()                          // defaults
     *   overlay.show('consumer-id')              // legacy positional
     *   overlay.show({ consumerId, attached, onCtaComplete, ... })
     */
    async show(consumerIdOrOpts) {
        let opts;
        if (typeof consumerIdOrOpts === 'string' || consumerIdOrOpts === undefined) {
            opts = { consumerId: consumerIdOrOpts };
        }
        else {
            opts = { ...consumerIdOrOpts };
        }
        this.currentOpts = opts;
        if (this.isShowing) {
            if (this.sovads.getConfig().debug) {
                console.warn('Overlay show already in progress');
            }
            return;
        }
        if (!this.canShowByFrequencyCap()) {
            if (this.sovads.getConfig().debug) {
                console.log('Overlay skipped due to frequency cap');
            }
            return;
        }
        this.isShowing = true;
        try {
            this.currentAd = await this.sovads.loadAd({
                consumerId: opts.consumerId,
                placement: this.placement,
                // Auto-detect: ask the server for CTAs unless the caller explicitly opted out.
                attached: opts.attached !== false,
            });
            if (!this.currentAd) {
                this.isShowing = false;
                return;
            }
            this.renderOverlay();
            this.markShown();
        }
        catch (err) {
            if (this.sovads.getConfig().debug) {
                console.error('Overlay show failed:', err);
            }
            this.isShowing = false;
        }
    }
    renderOverlay() {
        if (!this.currentAd)
            return;
        const renderStart = Date.now();
        let impressionTracked = false;
        const trackImp = (rendered) => {
            if (impressionTracked || !this.currentAd || this.currentAd.isDummy)
                return;
            impressionTracked = true;
            this.sovads._trackEvent('IMPRESSION', this.currentAd.id, this.currentAd.campaignId, {
                rendered,
                viewportVisible: true,
                renderTime: Date.now() - renderStart,
            });
            this.sovads.logInteraction('IMPRESSION', {
                adId: this.currentAd.id,
                campaignId: this.currentAd.campaignId,
                elementType: 'OVERLAY',
                metadata: { renderTime: Date.now() - renderStart },
            });
        };
        const wrapper = document.createElement('div');
        wrapper.className = 'sovads-overlay';
        wrapper.setAttribute('role', 'dialog');
        wrapper.setAttribute('aria-modal', 'true');
        wrapper.setAttribute('aria-label', 'Advertisement');
        wrapper.style.cssText = `
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.5); z-index: 10001;
      display: flex; align-items: center; justify-content: center;
      opacity: 0; transition: opacity 0.3s ease;
    `;
        const card = document.createElement('div');
        card.style.cssText = `
      position: relative; max-width: 90%; max-height: 90vh;
      background: white; border-radius: 12px; overflow: hidden;
      box-shadow: 0 20px 40px rgba(0,0,0,0.4);
      display: flex; flex-direction: column;
    `;
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', 'Close advertisement');
        closeBtn.innerHTML = '&times;';
        closeBtn.style.cssText = `
      position: absolute; top: 10px; right: 10px;
      background: rgba(0,0,0,0.5); color: white; border: none;
      width: 30px; height: 30px; border-radius: 15px;
      cursor: pointer; z-index: 11; font-size: 20px;
    `;
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.hide();
        });
        // Phase 2: resolve clickTarget + disclosure.
        const mediaType = this.currentAd.mediaType === 'video' ? 'video' : 'image';
        const clickTarget = this.currentOpts.clickTarget ?? 'media';
        const useButtonCta = clickTarget === 'button' || mediaType === 'video';
        let mediaEl;
        let mediaWrap;
        {
            const mounted = mountAdMedia({
                ad: this.currentAd,
                // Overlay/Interstitial don't impose a slot size \u2014 media drives layout.
                fit: this.currentOpts.fit ?? 'auto',
                focus: this.currentOpts.focus,
                letterboxBlur: this.currentOpts.letterboxBlur ?? false,
            });
            mediaEl = mounted.element;
            mediaWrap = mounted.wrapper;
            const onSuccess = () => {
                wrapper.style.opacity = '1';
                trackImp(true);
            };
            if (mounted.kind === 'video' || mounted.kind === 'streaming') {
                mediaEl.addEventListener('loadeddata', onSuccess, { once: true });
                mediaEl.addEventListener('load', onSuccess, { once: true });
            }
            else {
                mediaEl.addEventListener('load', onSuccess, { once: true });
            }
            mediaEl.addEventListener('error', () => trackImp(false), { once: true });
        }
        const handleClick = () => {
            if (!this.currentAd)
                return;
            this.sovads._trackEvent('CLICK', this.currentAd.id, this.currentAd.campaignId, {
                rendered: true,
                viewportVisible: true,
                renderTime: Date.now() - renderStart,
            });
            this.sovads.logInteraction('CLICK', {
                adId: this.currentAd.id,
                campaignId: this.currentAd.campaignId,
                elementType: 'OVERLAY',
                metadata: { renderTime: Date.now() - renderStart },
            });
            window.open(this.sovads.normalizeUrl(this.currentAd.targetUrl), '_blank', 'noopener,noreferrer');
            this.hide();
        };
        if (useButtonCta) {
            mediaEl.style.cursor = 'default';
        }
        else {
            mediaEl.style.cursor = 'pointer';
            mediaEl.addEventListener('click', handleClick);
        }
        card.appendChild(closeBtn);
        card.appendChild(mediaWrap);
        if (useButtonCta) {
            const ctaButton = document.createElement('button');
            ctaButton.type = 'button';
            ctaButton.textContent = 'Learn more';
            ctaButton.style.cssText = `
        display:block;
        width: calc(100% - 24px);
        margin: 12px;
        border: none;
        border-radius: 6px;
        background: #111;
        color: #fff;
        font-size: 13px;
        font-weight: 600;
        padding: 10px 16px;
        cursor: pointer;
      `;
            ctaButton.addEventListener('click', (e) => {
                e.stopPropagation();
                handleClick();
            });
            card.appendChild(ctaButton);
        }
        // Auto-detect: mount the attached CTA panel whenever the server returned
        // at least one task. Caller can suppress with `attached: false`.
        if (this.currentOpts.attached !== false &&
            Array.isArray(this.currentAd.attachedTasks) &&
            this.currentAd.attachedTasks.length > 0) {
            const ctaSlot = document.createElement('div');
            ctaSlot.style.cssText = 'padding: 0 12px 12px;';
            ctaSlot.addEventListener('click', (e) => e.stopPropagation());
            card.appendChild(ctaSlot);
            mountCtaPanel({
                container: ctaSlot,
                sovads: this.sovads,
                surface: 'OVERLAY',
                tasks: this.currentAd.attachedTasks,
                campaignId: this.currentAd.campaignId,
                bannerClickActive: this.currentAd.bannerClickActive !== false,
                onComplete: this.currentOpts.onCtaComplete,
                layout: 'stack',
            });
        }
        // Phase 2: disclosure badge anchored over the card.
        const disclosure = buildPositionedDisclosure({
            slotOverride: this.currentOpts.disclosureLabel,
            configValue: this.sovads.getConfig().disclosureLabel,
            advertiser: this.sovads.getConfig().advertiserName,
            variant: 'light',
            position: 'top-left',
        });
        if (disclosure)
            card.appendChild(disclosure);
        wrapper.appendChild(card);
        // Backdrop click dismiss \u2014 only when the click was on the wrapper itself
        // (not bubbled from the card). Default on; opt-out via dismissOnBackdrop:false.
        const dismissOnBackdrop = this.currentOpts.dismissOnBackdrop !== false;
        if (dismissOnBackdrop) {
            wrapper.addEventListener('click', (e) => {
                if (e.target === wrapper)
                    this.hide();
            });
        }
        // ESC dismiss \u2014 default on. We keep the handler reference so hide() can
        // detach it cleanly (no listener leaks across multiple show/hide cycles).
        const dismissOnEscape = this.currentOpts.dismissOnEscape !== false;
        if (dismissOnEscape) {
            this.escHandler = (e) => {
                if (e.key === 'Escape')
                    this.hide();
            };
            window.addEventListener('keydown', this.escHandler);
        }
        // Scroll lock \u2014 stash the previous overflow so hide() can restore it
        // even when another script has changed body.style.overflow in the meantime.
        this.previousBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        document.body.appendChild(wrapper);
        this.overlayElement = wrapper;
    }
    hide() {
        if (this.overlayElement && this.overlayElement.isConnected) {
            try {
                this.overlayElement.remove();
            }
            catch { /* swallow */ }
        }
        this.overlayElement = null;
        if (this.escHandler) {
            window.removeEventListener('keydown', this.escHandler);
            this.escHandler = null;
        }
        // Restore scroll. Only touch body.style.overflow when we actually set it,
        // so we don't clobber a publisher's own scroll-lock for an unrelated modal.
        document.body.style.overflow = this.previousBodyOverflow;
        this.isShowing = false;
    }
}
// Interstitial Component (Full page ad before content). Same machinery as
// Overlay but with its own frequency-cap storage so the two surfaces don't
// share a counter.
export class Interstitial extends Overlay {
    constructor() {
        super(...arguments);
        this.storageKeyLastShown = 'sovads_interstitial_last_shown';
        this.storageKeySessionCount = 'sovads_interstitial_session_count';
        this.placement = 'interstitial';
    }
}
export class NativeCard {
    constructor(sovads, containerId) {
        this.currentAd = null;
        this.sovads = sovads;
        this.containerId = containerId;
    }
    /**
     * Render the native card. Two call shapes (backwards compatible):
     *
     *   nativeCard.render()
     *   nativeCard.render('consumer-id')                    // legacy positional
     *   nativeCard.render({ consumerId, attached, onCtaComplete })  // recommended
     */
    async render(consumerIdOrOpts) {
        let opts;
        if (typeof consumerIdOrOpts === 'string' || consumerIdOrOpts === undefined) {
            opts = { consumerId: consumerIdOrOpts };
        }
        else {
            opts = { ...consumerIdOrOpts };
        }
        const container = document.getElementById(this.containerId);
        if (!container)
            return;
        container.style.display = 'none';
        this.currentAd = await this.sovads.loadAd({
            consumerId: opts.consumerId,
            placement: 'native',
            // Auto-detect: ask the server for CTAs unless the caller explicitly opted out.
            attached: opts.attached !== false,
        });
        if (!this.currentAd)
            return;
        // Phase 2: resolve disclosure + click-target once for this render pass.
        // NativeCard renders the disclosure as an inline text line (not the
        // floating badge), so we don't pass `advertiserName` here — the badge
        // helper handles that. The headline already names the campaign anyway.
        const nativeDisclosureLabel = resolveDisclosureLabel(opts.disclosureLabel, this.sovads.getConfig().disclosureLabel);
        const nativeClickTarget = opts.clickTarget ?? 'media';
        const useButtonCta = nativeClickTarget === 'button';
        const card = document.createElement('div');
        card.style.cssText = `
      display: flex; gap: 16px; padding: 16px;
      background: white; border: 1px solid #eee; border-radius: 12px;
      cursor: ${useButtonCta ? 'default' : 'pointer'}; position: relative;
    `;
        // Phase 7: a11y landmark.
        card.setAttribute('role', 'region');
        card.setAttribute('aria-label', 'Advertisement');
        const img = document.createElement('img');
        img.src = this.currentAd.bannerUrl;
        img.alt = this.currentAd.description || 'Sponsored';
        img.decoding = 'async';
        // Phase 8: honour `focus` so the advertiser can keep the subject in
        // frame when the 1:1 thumbnail crops an off-centre creative.
        const thumbFocus = opts.focus ?? '50% 50%';
        img.style.cssText = `width: 80px; height: 80px; object-fit: cover; object-position: ${thumbFocus}; border-radius: 8px;`;
        const content = document.createElement('div');
        content.style.cssText = 'flex:1 1 auto;min-width:0;';
        // Phase 1 nit: only append ellipsis when actually truncated.
        const rawDesc = this.currentAd.description || '';
        const headline = rawDesc.length > 40 ? `${rawDesc.slice(0, 40)}\u2026` : rawDesc;
        const headlineEl = document.createElement('div');
        headlineEl.style.cssText = 'font-weight: bold; font-size: 16px; margin-bottom: 4px;';
        headlineEl.textContent = headline;
        content.appendChild(headlineEl);
        // Disclosure: configurable text, or omitted entirely when disclosureLabel:false.
        if (nativeDisclosureLabel) {
            const discEl = document.createElement('div');
            discEl.style.cssText = 'font-size: 12px; color: #666;';
            discEl.textContent = nativeDisclosureLabel;
            content.appendChild(discEl);
        }
        // Phase 6: gate the IMPRESSION on actual viewport visibility, not just
        // image decode. Before this fix, NativeCards placed below-the-fold fired
        // a paid IMPRESSION the moment the browser decoded the image \u2014 even
        // when the viewer never scrolled to see them. We now wait until the
        // observer reports the card is on screen, and we only fire once.
        let nativeImpressionFired = false;
        img.onload = () => {
            container.style.display = 'block';
            this.sovads.setupRenderObserver(card, this.currentAd.id, (isVisible) => {
                if (!isVisible || nativeImpressionFired)
                    return;
                nativeImpressionFired = true;
                this.sovads._trackEvent('IMPRESSION', this.currentAd.id, this.currentAd.campaignId);
                this.sovads.logInteraction('IMPRESSION', {
                    adId: this.currentAd.id,
                    campaignId: this.currentAd.campaignId,
                    elementType: 'NATIVE',
                });
            });
        };
        const handleCardClick = () => {
            this.sovads._trackEvent('CLICK', this.currentAd.id, this.currentAd.campaignId);
            this.sovads.logInteraction('CLICK', {
                adId: this.currentAd.id,
                campaignId: this.currentAd.campaignId,
                elementType: 'NATIVE',
            });
            window.open(this.sovads.normalizeUrl(this.currentAd.targetUrl), '_blank', 'noopener,noreferrer');
        };
        if (useButtonCta) {
            // 'button' mode: explicit "Learn more" pill, card itself is silent.
            const ctaButton = document.createElement('button');
            ctaButton.type = 'button';
            ctaButton.textContent = 'Learn more \u2192';
            ctaButton.style.cssText = `
        margin-top: 6px;
        border: none;
        border-radius: 6px;
        background: #111;
        color: #fff;
        font-size: 12px;
        font-weight: 600;
        padding: 6px 12px;
        cursor: pointer;
        align-self: flex-start;
      `;
            ctaButton.addEventListener('click', (e) => {
                e.stopPropagation();
                handleCardClick();
            });
            content.appendChild(ctaButton);
        }
        else {
            card.onclick = handleCardClick;
        }
        card.appendChild(img);
        card.appendChild(content);
        container.innerHTML = '';
        container.appendChild(card);
        // Auto-detect: mount attached CTAs underneath the card body whenever the
        // server returned at least one task. Caller can suppress with `attached: false`.
        if (opts.attached !== false &&
            Array.isArray(this.currentAd.attachedTasks) &&
            this.currentAd.attachedTasks.length > 0) {
            const ctaSlot = document.createElement('div');
            ctaSlot.style.cssText = 'margin-top:8px;';
            // CTA buttons must not bubble into card.onclick (which would open the ad).
            ctaSlot.addEventListener('click', (e) => e.stopPropagation());
            container.appendChild(ctaSlot);
            mountCtaPanel({
                container: ctaSlot,
                sovads: this.sovads,
                surface: 'NATIVE',
                tasks: this.currentAd.attachedTasks,
                campaignId: this.currentAd.campaignId,
                bannerClickActive: this.currentAd.bannerClickActive !== false,
                onComplete: opts.onCtaComplete,
                // 2 tasks → horizontal row (native cards are narrow but tall enough
                // for a single CTA row); 1 or 3+ stay stacked.
                layout: 'auto',
            });
        }
    }
}
export class CtaUnit {
    constructor(sovads, containerId) {
        this.currentAd = null;
        this.isRendering = false;
        this.sovads = sovads;
        this.containerId = containerId;
    }
    async render(consumerIdOrOpts) {
        let opts;
        if (typeof consumerIdOrOpts === 'string' || consumerIdOrOpts === undefined) {
            opts = { consumerId: consumerIdOrOpts };
        }
        else {
            opts = { ...consumerIdOrOpts };
        }
        if (this.isRendering) {
            if (this.sovads.getConfig().debug) {
                console.warn(`CtaUnit render already in progress for ${this.containerId}`);
            }
            return;
        }
        const container = document.getElementById(this.containerId);
        if (!container) {
            console.error(`Container with id "${this.containerId}" not found`);
            return;
        }
        this.isRendering = true;
        container.style.display = 'none';
        try {
            this.currentAd = await this.sovads.loadAd({
                consumerId: opts.consumerId,
                placement: 'cta',
                attached: true,
            });
            if (!this.currentAd) {
                container.style.display = 'none';
                return;
            }
            // No-tasks \u2192 nothing to render. Hide the slot entirely so the publisher
            // page doesn't reserve empty space.
            const tasks = this.currentAd.attachedTasks;
            if (!Array.isArray(tasks) || tasks.length === 0) {
                container.style.display = 'none';
                return;
            }
            container.innerHTML = '';
            container.style.display = 'block';
            // Fire a single IMPRESSION on render so advertiser dashboards see the slot
            // even though no banner media was shown.
            this.sovads._trackEvent('IMPRESSION', this.currentAd.id, this.currentAd.campaignId, {
                rendered: true,
                viewportVisible: true,
                renderTime: 0,
            });
            mountCtaPanel({
                container,
                sovads: this.sovads,
                surface: 'NATIVE',
                tasks,
                campaignId: this.currentAd.campaignId,
                bannerClickActive: this.currentAd.bannerClickActive !== false,
                onComplete: opts.onCtaComplete,
                layout: opts.layout ?? 'stack',
            });
        }
        catch (e) {
            if (this.sovads.getConfig().debug) {
                console.error('CtaUnit render failed:', e);
            }
        }
        finally {
            this.isRendering = false;
        }
    }
}
// ============================================================================
// GoodDollar reward icon
// ----------------------------------------------------------------------------
// Inlined as a base64 data URI so the SDK is asset-self-contained: any
// consumer (publisher page, advertiser preview, e2e test) gets the icon
// without an extra HTTP request or hosting concern.
// Source: sdk/assets/g-dollar.png (64x64 PNG, ~2.9 KB).
// ============================================================================
export const GOOD_DOLLAR_ICON_DATA_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAMAAACdt4HsAAAABGdBTUEAALGPC/xhBQAAAAFzUkdCAK7OHOkAAAMAUExURUxpcQKy/wCw/3u//+D//wCv/zg4ygOx/wGx/3/m/zqm/wCx/wCw/wCL+QOx/wKy/yef5gCu/3zc3AKy/QCu/6ra/wCv////9f///+v5/wSx/f/+9vz+9///967k92HT+QGx/ZXc9vn/80XC+P//8///9fr/+DO99wCu/bvs9ff7/+f///3/+vX++i+9+HbS9vv++FvJ9Ija+Mbw+UvJ+Mb0/DHB+6Pm90rG9///4lvI9F/O+a3j9f//9FzK9wCw/0nF92jR+FDL+lvO+v///0zK+wCw/ITX+HLP84bc91vM9mzS+K3o+MPr9X7Z9l/Q+gGv/T/F+FjP+fz9+HbU9zrB+UfC9aLi92jN9vb59DXB+k/H9KPq8bTo91nI9bDm9GnS+v3++ETD92DK8////0zJ+v7/94vf/IDX9ZXd9kjD+Yza95zi9T7D+UDE+j3C92bM9GzO9XvT9HLW+ark+HXU9ZD/AJ7i91rP+kTE9m7S95Hh+U3F9v//8ZLe+Nr09Krn9Zvg82PP+QCw/Sy99zbA+fD7927P8f3983vS9IDY9sHr95bg8lbO+Yrc+LTq+GDI81TN+U3G+IXY9HfW+Sy69kbD8kTG+tTy8kvE9NDu+GDP+Te/92PK81DE9v//8mzS+onW9r3v+GbR+XvR9inD+ym9+1HJ+2LL8uL/92jP83/V9X/X93zX+F3Q+oLZ9tb18VXH9bHs91jM9UrC+P//9/n/+VfI9hW7/DrC+oHV9X3V+Iza+Nrz90fF+FLL+gKx/wOx/wOx/gCx/wSx/wOy/gOy/wCw/wG3/wC1/wCy/wCv/wu//x/E/wGy/gS7/wC4/wC0/wGw/wCu/wK6/wCw/gm6/wW8/wKy/wy9/yzD/ynC/wCz/xq39jXD/gqz+gWy/RTB/xHB/wa7/yfH/w20/CfD/zO99RK+/yPI/w6//x7A/xvB/wm9/x+9/znF/hq//w60+x/D/xjA/zS/9y7G/yLB/xnH/zjC+wm3/xm9/xu39xjC/xG6/w7J/yq/+5C2f9YAAADAdFJOUwD9+wQB+wH+/AID/fwC/f4E/gT9+wP9AgME/iAmImYI/QYH7x0bOPX+TAgFCzX3nCnTmEXcUPph4QnGwm4Zyv3c2ODGDuz8mqB406dyP6jG/PH8TaD42GXMMvbZCVzIVLVF6LIT5y2YpIv3mmDt7fCprKqweagBddnzvo3LE4RPNWrU//7zQ7czgnNkW/J9e8/335Ox78v1PNV4y+255hS1q1LEl/z50aMktZrUx+11OMVF7OlgMMz70L2hxDLo2h8hnHYAAAcoSURBVFjDpVdneNPmFj52bOuzazsOOLLj2OAQNwHiQJhJgLJnS1uXPUvZULr3HnQBnXd23dve23Fv97z79oclWZZsg2MHZzgJkEEhEFYobdPS9uknJU4kxWmSp+8PP34knaNPZ74vQC9km/CPq3Ts5dcfv9h+5Ej7oeP5l48tdXqFW9A/hGdKFs0pPFcdj3BMJROt5Kq4UPW5J3Z/XHxX/y50+O2T/jK5iWdIlZmlgxTFBqnGTDMimXjr2fsmAZh0v2SfATBhan3ioNZM0GGaovwiKJpmaEKlzeLrp04QH+oDGhN4rqjjRyLCnxYBRMbqbveATpPeXg/w/E0tJIr6+wSLyIobFwPY0tnnQPmyoxEU8P8iAog7elU5DOltPwS2XX3SSvj7BWFNznH1DkSRs2BijTroHwCCvpqZS3P0cvs8TfGSsC/gHxCCKLxktfwMtnXOiWFE+QcK5J+YK42kRuedlXD7BwFUMb3cpJHUz7KkOjAYB0Ft8jYw9NhPO2EN+geFoPXEtFQY9DrXNaj//AUw6ED3OYkZN18mdA6GAW6tQelMKEKFkFqNzIJ3gszCOBjpvmusuaXzI7Lhyjqj8gOCgVp6qI+LxVqSp2Mhzm02h+vOHj58uOPx7lRRxvorxe7W26fEzMr6p1n3SP5U4QNP/XXB2PvWjmmKx/7xZEFBcck/n30s9bGUKvSCTSMcYNQxK6ssAXY+X/dmaW5nkOyuO/6+tkD45/xv3NzzjPHYKGxuyNmcUCteHyXIr6Y+jA1MBsvwPIvgYwTkeGHbs7yj51WUumKzEIU9Z7MUJVDrYOp25oBONBXznIeLLdueWxZyS48ayJrsxHf3NauV/XbJ5PVgycFZ9haPWv9Irh3Agl+VWxZDAVb6oLb5Oez505hKljuatdZtAAsOz7btsx//5vyZMfc85IF1UDCb9wUZSnoEc2icF1yFDC0LAD2/6SHIsIPz/jXJcIQ0ZnENrfNWQklZzKdMNs0UuqD0HCkLQa2Kv9ZmsMGDH3x7EKkcFIXLScu07VgR89HKSqPJczfA2GqVPIHGtx+GIn3uh7y1scuCrnWQSd7N1vbqN1S9EMaFzLIQqPhVGk0G7PxW1l6U0Zym1mlVaBzkc5nSuFDqA8MgD5xrjI091ySQNwtbdT1ciMjKkOCe8OAB+/5+lDo/hbQSVMq/97HjcJGrlV5SxR4AE4wua0hFhvV9d6Ab589/J/MQrDoE7ZWy2lDXvIOr5t2/VXUdIDi/9X9PD0th2itlYcnkoCimHY5UybKjPv0WDIdR35CUeDlgbfr/aOn4nSItO4qubIQjYdlXqZMLsIMNbUYxMMGspi/mWoZ3Ii9jSIZ9Fa900F4ZZaQOWnbYLfDImSzBAYX+M16+/eFamQOK+RIOcbICRYn3cAxcYzihaIjo5zsX7No7ftd4jO3P4OlZtEJWNkIQcRr9sv5YW6TT5awNDaXFwXT6ZHK/gGTyp6dwenOXR2hZGi9APpMpvURXjfHgQlrU7BOzyxjVIrTIeuYzvAA3tJHSqsmsyselrJI6oFDT3fhBz70zHLKZroqPG6GxwELZ/BZLWdlMjtDL5boMWHlCG6SjqWBTjcaOTyBPd+k1ldIFEhaaqfSUrJ0pB//aXI3GAAt+sDpS1cwOJY89CtkZsKtV3aud8UCROkXxratBjz1ofne0QY0IIkCo3GSo41HQ62HjmksclHKg2KSZrXWH5+3B2cIudLB+9qlEOJzFNFScefUlsHgN3lny1verQv8uAs2ikz3HMsfnFYA+G0aDzmYC78rrNv3hcOHM25/WgAF7vTNplLeztnkfrq7VPWOdYLaWAJ6fznv2YtIk7F7vg8WXjRAYlAU8d/6ooCCdYx0vloquIxCOjzZ6t2wp2Tg71PZ7D76V18kALMKCWDqrFbHygaRO/Bm3fudqEy9UNt67KT8/f1NH3G2snnf3FmE1mSyiE+f9y0NaxVBmreJqE5Yr3xUbhgszDBM+ODRAI+6rrdsnvN65Gt9Y9mJrxK3cnyg2xWYSCeKEr1P8jHU4CILIpKM0TfiY0/V/+uP0VdNXLG+riRgdvQhHar2DwX5ri4xgMF30ApFhHiPEkZjA9KJw3QQDc+S+KA7eKRhmIh3/k1AcgWQd0A6eZN3RwzUzchb+KpqHiWb57gQajAO3nGhi1uqa6B8M1W3AVFcv1zoFS8LGAcYBk+3fFCgJf97cpb+tGCDd1yZmPjlaKTk068A1cMHhsaVRXiOg/KqjXH+SJyhInrlQ1IfoWiyILrZPa4o1G1tuXGxPL7q6ZR/Z1ykINJL/+oq+ZZ9EeKrNRAAzg1QD0LRQ1dpIov7qSZBOsSmlb0czz8xAKhbL3ij+YTulb/Pk6/qVvl3i+19YfH+PxXcVx0RF8R2v/r5w93MlA9Xvovy/YQeW/4cE+X9RkP/PuPBoNGXf1evpnwH9wKyz1N0ryQAAAABJRU5ErkJggg==';
/**
 * Build a compact reward badge ("Earn <icon> <amount>") that ad surfaces
 * overlay to surface the viewer-reward. Returns an HTMLElement; caller is
 * responsible for absolute positioning over the creative.
 */
export function buildRewardBadge(opts) {
    const amount = opts?.amount ?? '0.5';
    const variant = opts?.variant ?? 'dark';
    // Phase 5: brand hexes must always ship inside a `var(--sovads-*, …)`
    // fallback so publishers can re-theme the badge. Bare literals would
    // fail the bundle-grep regression test.
    const bg = variant === 'dark'
        ? 'var(--sovads-accent, #2D2D2D)'
        : 'rgba(255,255,255,0.95)';
    const fg = variant === 'dark'
        ? '#FFFFFF'
        : 'var(--sovads-accent, #2D2D2D)';
    const span = document.createElement('span');
    span.className = 'sovads-reward-badge';
    span.setAttribute('role', 'note');
    span.setAttribute('aria-label', `Earn ${amount} GoodDollar`);
    span.style.cssText =
        `display:inline-flex;align-items:center;gap:4px;` +
            `padding:2px 6px 2px 4px;border-radius:999px;` +
            `font-size:11px;font-weight:800;line-height:1;letter-spacing:0.02em;` +
            `background:${bg};color:${fg};` +
            `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;`;
    const icon = document.createElement('img');
    icon.src = GOOD_DOLLAR_ICON_DATA_URI;
    icon.alt = '';
    icon.width = 12;
    icon.height = 12;
    icon.style.cssText = 'display:block;border-radius:50%;flex:none;';
    const text = document.createElement('span');
    text.textContent = `Earn ${amount}`;
    span.appendChild(icon);
    span.appendChild(text);
    return span;
}
export default SovAds;
//# sourceMappingURL=index.js.map