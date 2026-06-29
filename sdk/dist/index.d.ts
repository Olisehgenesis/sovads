/** Runtime SDK version. Kept in sync with `sdk/package.json#version`.
 *  Sent as `X-SovAds-SDK-Version` on signed tracking requests and exported
 *  so host pages can log / gate on it. */
export declare const SDK_VERSION = "1.2.1";
export interface SovAdsConfig {
    siteId?: string;
    apiUrl?: string;
    apiKey?: string;
    apiSecret?: string;
    debug?: boolean;
    consumerId?: string;
    refreshInterval?: number;
    lazyLoad?: boolean;
    rotationEnabled?: boolean;
    popupMinIntervalMinutes?: number;
    popupSessionMax?: number;
    walletAddress?: string;
    /** Phase 2: render the "Sponsored" disclosure badge on every ad surface.
     *  - `true` (default) \u2192 show 'Sponsored'.
     *  - `false`          \u2192 suppress (advertisers / publishers should NOT use
     *                       this in production; it exists for very narrow
     *                       contexts like SDK-internal previews).
     *  - string           \u2192 use as the label text (e.g. 'Ad', 'Promoted').      */
    disclosureLabel?: boolean | string;
    /** Phase 2: advertiser/brand name to append to the disclosure (rendered as
     *  "Sponsored \u00b7 {advertiserName}"). When omitted, only the label is shown.
     *  Per-ad advertiser metadata would override this once the server returns it. */
    advertiserName?: string;
}
export interface AdComponent {
    id: string;
    campaignId: string;
    bannerUrl: string;
    targetUrl: string;
    description: string;
    consumerId?: string;
    isDummy?: boolean;
    tags?: string[];
    targetLocations?: string[];
    metadata?: Record<string, unknown>;
    startDate?: string | null;
    endDate?: string | null;
    mediaType?: 'image' | 'video';
    trackingToken?: string;
    placement?: string;
    size?: string;
    isUnverified?: boolean;
    /** false when the campaign is out of token budget; the SDK suppresses banner click-through. */
    bannerClickActive?: boolean;
    /** Up to 2 inline CTAs (VISIT_URL / SIGN_MESSAGE / POLL) rendered under the banner. */
    attachedTasks?: AttachedTask[];
}
export type AttachedTaskKind = 'VISIT_URL' | 'SIGN_MESSAGE' | 'POLL';
export interface AttachedPollOption {
    id: string;
    label: string;
}
export interface AttachedTask {
    id: string;
    campaignId: string;
    kind: AttachedTaskKind;
    label: string;
    buttonLabel: string | null;
    description: string | null;
    rewardPoints: number;
    rewardGs: number;
    url?: string | null;
    minDwellMs?: number;
    signMessage?: string | null;
    options?: AttachedPollOption[];
}
/** Per-task viewer status returned by GET /api/tasks/status. Loose shape —
 *  the SDK only consumes `id` + `eligibility.completionsUsed` + the most
 *  recent verified/paid completion, so additional fields are tolerated. */
export interface TaskStatusEntry {
    id: string;
    eligibility?: {
        eligible?: boolean;
        reason?: string;
        completionsUsed?: number;
        maxPerWallet?: number;
        cooldownSecs?: number;
        retryAfterSec?: number;
    };
    completions?: Array<{
        id: string;
        status: string;
        createdAt?: string | Date;
    }>;
}
interface AdLoadOptions {
    consumerId?: string;
    placement?: string;
    size?: string;
    walletAddress?: string;
    /** Ask the server to include attached CTA tasks (VISIT_URL/SIGN_MESSAGE/POLL)
     *  and to keep serving banners whose token budget is exhausted (with
     *  bannerClickActive=false). Defaults to ON — the SDK auto-detects CTAs.
     *  Pass `false` explicitly to opt out (e.g. for legacy bare-banner slots). */
    attached?: boolean;
}
interface SlotConfig {
    placementId?: string;
    size?: string;
    /** Request attached CTAs and render them under the banner. Defaults to ON;
     *  pass `false` to opt out. When the server returns no tasks for the
     *  selected campaign, the slot quietly renders as a bare banner. */
    attached?: boolean;
    /** Optional handler invoked after each attached-CTA submission attempt. */
    onCtaComplete?: (ev: AttachedCtaCompleteEvent) => void;
    /** Phase 2: where the click-through is wired.
     *  - 'media' (default for inline units) \u2014 the whole banner element is the
     *    click target. Preserves today's behaviour for Banner/Sidebar.
     *  - 'button' \u2014 an explicit "Learn more \u2192" button below the media is the
     *    only click target. Massively reduces accidental clicks. Recommended for
     *    new integrations; default for BottomBar (where bar-wide clicks were
     *    generating fraudulent traffic). */
    clickTarget?: 'media' | 'button';
    /** Phase 2: per-slot override for the disclosure badge. Falls back to
     *  `SovAdsConfig.disclosureLabel` (which defaults to `true`). */
    disclosureLabel?: boolean | string;
}
export interface AttachedCtaCompleteEvent {
    taskId: string;
    campaignId: string;
    kind: AttachedTaskKind;
    ok: boolean;
    status: number;
    awarded?: {
        points: number;
        gs: number;
        bonusPointsInLieuOfGs?: number;
    };
    error?: string;
    /** Only emitted for SIGN_MESSAGE when the SDK cannot sign on the viewer's behalf. */
    needsSignature?: {
        message: string;
    };
}
export type MountUnitKind = 'BANNER' | 'POLL' | 'FEEDBACK' | 'SURVEY';
export type MountUnitEventType = 'READY' | 'LOADED' | 'NONE' | 'IMPRESSION' | 'INTERACTION' | 'COMPLETE' | 'CLICK' | 'DISMISS' | 'ERROR' | 'RESIZE';
export interface MountUnitEvent {
    type: MountUnitEventType;
    slotId: string;
    payload: Record<string, unknown>;
}
export interface MountUnitOptions {
    /** csv of BANNER|POLL|FEEDBACK|SURVEY — default BANNER */
    kind?: string;
    slotId?: string;
    location?: string;
    placement?: string;
    size?: string;
    wallet?: string;
    /** minHeight CSS value for the iframe (e.g. '180px') */
    minHeight?: string;
    onEvent?: (ev: MountUnitEvent) => void;
}
export declare class SovAds {
    protected config: SovAdsConfig;
    private fingerprint;
    private components;
    private siteId;
    private renderObservers;
    private debugLoggingEnabled;
    private adTrackingTokens;
    private walletAddress;
    private unitListeners;
    /** Subscribers notified whenever the viewer's wallet identity becomes known
     *  or changes. Used by `renderAttachedCtas` to lazy-mount CTAs once the host
     *  page connects a wallet. */
    private identityListeners;
    constructor(config?: SovAdsConfig);
    /**
     * Lightweight "I'm alive" ping to `/api/sites/heartbeat`. Best-effort:
     * never blocks SDK init, never retries, never surfaces errors to the
     * host page. The server is responsible for write-throttling so we can
     * call this freely on every constructor.
     */
    private sendHeartbeat;
    /**
     * Identifies the current viewer with a wallet address.
     * This links the device fingerprint to the wallet on the backend.
     */
    identify(walletAddress: string): void;
    /**
     * Subscribe to wallet-identity changes. Fires once immediately if a wallet
     * is already known, then on every subsequent `identify()` call that changes
     * the address. Returns an unsubscribe function.
     */
    onIdentify(cb: (wallet: string | null) => void): () => void;
    private notifyIdentityListeners;
    private loadPersistedIdentity;
    private generateFingerprint;
    private detectSiteId;
    /**
     * Setup IntersectionObserver to verify ad is actually rendered and visible
     * This helps with fraud prevention and accurate impression tracking
     * Falls back to manual visibility check for older browsers
     */
    setupRenderObserver(element: HTMLElement, adId: string, callback: (isVisible: boolean) => void): void;
    /**
     * Get client metadata for tracking
     */
    private getClientMetadata;
    /**
     * Normalize URL - add protocol if missing for localhost
     */
    normalizeUrl(url: string): string;
    /**
     * Validate URL format
     */
    private isValidUrl;
    private inferMediaTypeFromUrl;
    /**
     * Fetch with retry logic
     */
    private fetchWithRetry;
    loadAd(options?: AdLoadOptions): Promise<AdComponent | null>;
    private toBase64;
    private signTrackingPayload;
    private sendTrackingEnvelope;
    /**
     * Track event with retry logic (internal helper)
     */
    private trackEventWithRetry;
    /**
     * Track event with enhanced metadata using Beacon API
     * Includes render verification, IP (collected server-side), and site ID validation
     */
    private trackEvent;
    addComponent(componentId: string, component: any): void;
    getComponent(componentId: string): any;
    removeComponent(componentId: string): void;
    _trackEvent(type: 'IMPRESSION' | 'CLICK', adId: string, campaignId: string, renderInfo?: {
        rendered: boolean;
        viewportVisible: boolean;
        renderTime: number;
    }): Promise<void>;
    /**
     * Get config (for components to access debug mode)
     */
    getConfig(): SovAdsConfig;
    /**
     * Submit a CTA-task completion (POLL / VISIT_URL / SIGN_MESSAGE) on behalf
     * of the current viewer. Uses plain fetch (no retry) to avoid double-submitting
     * an idempotent task; rate-limit/dedupe is enforced server-side.
     */
    submitTaskCompletion(params: {
        taskId: string;
        proof?: Record<string, unknown>;
    }): Promise<{
        ok: boolean;
        status: number;
        awarded?: {
            points: number;
            gs: number;
            bonusPointsInLieuOfGs?: number;
        };
        error?: string;
        data?: Record<string, unknown> | null;
    }>;
    /**
     * Public accessor for the current wallet address (read-only).
     * CTA renderers use this to suppress wallet-bound rewards on anonymous viewers.
     */
    getWalletAddress(): string | null;
    /**
     * Fetch this viewer's completion / eligibility status for every active task
     * of a campaign. Used by the attached-CTA panel to mark already-completed
     * tasks with a \u2713 badge after the wallet connects. Returns a Map keyed by
     * taskId so callers can do O(1) lookups; tasks missing from the map are
     * assumed eligible.
     */
    fetchTaskStatuses(campaignId: string): Promise<Map<string, TaskStatusEntry>>;
    /**
     * Log interaction (public method for components)
     */
    logInteraction(type: string, data: any): Promise<void>;
    /**
     * Log debug event to server
     */
    private logDebug;
    /**
     * Clean up observers when SDK is destroyed
     */
    destroy(): void;
    /**
     * Mount a standalone unit iframe (BANNER / POLL / FEEDBACK / SURVEY) into
     * `containerId`. Forwards lifecycle/interaction events from the iframe
     * (via postMessage protocol) to the supplied `onEvent` callback.
     *
     * Returns an object with `unmount()` for cleanup.
     */
    mountUnit(containerId: string, options: MountUnitOptions): {
        slotId: string;
        unmount: () => void;
    };
}
export interface StreamingEmbed {
    /** Iframe `src` to use for the embed. */
    embedUrl: string;
    /** Provider name \u2014 useful for analytics / debug. */
    provider: 'youtube' | 'vimeo' | 'tiktok';
}
export declare function toStreamingEmbed(url: string): StreamingEmbed | null;
/** Build a sandboxed `<iframe>` for a streaming embed URL. Shared by Banner
 *  and Popup so both surfaces behave identically. */
export declare function buildStreamingIframe(embed: StreamingEmbed, alt: string): HTMLIFrameElement;
export type AdSurface = 'BANNER' | 'SIDEBAR' | 'POPUP' | 'BOTTOM_BAR' | 'NATIVE' | 'OVERLAY' | 'INTERSTITIAL';
export interface MediaMountResult {
    /** The DOM element to insert into the slot. May be <img>, <video>, or <iframe>. */
    element: HTMLImageElement | HTMLVideoElement | HTMLIFrameElement;
    /** Resolved kind — 'streaming' means a sandboxed platform iframe. */
    kind: 'image' | 'video' | 'streaming';
    /** True if the whole element is safe to wrap in a click-through handler.
     *  Videos and streaming iframes intercept their own pointer events, so the
     *  publisher should render an external "Learn more" button instead. */
    clickable: boolean;
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
export declare function mountMedia(opts: {
    ad: AdComponent;
    /** Optional inline style override; helper sets sensible defaults. */
    style?: string;
}): MediaMountResult;
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
export declare function buildDisclosureBadge(opts?: {
    /** Visible text, default 'Sponsored'. */
    label?: string;
    /** Optional advertiser name appended as `Sponsored · {advertiser}`. */
    advertiser?: string;
    /** Visual variant — 'light' for dark backgrounds, 'dark' for light. */
    variant?: 'light' | 'dark';
}): HTMLElement;
/**
 * Phase 2 \u2014 resolve the effective disclosure setting from a 3-level cascade:
 *   slot-override \u2192 SovAdsConfig.disclosureLabel \u2192 default (true \u2192 'Sponsored').
 *
 * Returns the resolved label string, or `null` if disclosure is explicitly
 * disabled (which callers should treat as "do not render"). Centralised here
 * so every component reads the rule the same way.
 */
export declare function resolveDisclosureLabel(slotOverride: boolean | string | undefined, configValue: boolean | string | undefined): string | null;
/**
 * Phase 2 \u2014 small helper that builds AND positions a disclosure badge over
 * the top-left of an ad surface (absolute positioning). Caller must ensure
 * the parent has `position: relative` (or another non-static positioning
 * context). Returns `null` when disclosure is disabled \u2014 caller should
 * handle that as "do not append".
 */
export declare function buildPositionedDisclosure(opts: {
    slotOverride?: boolean | string;
    configValue?: boolean | string;
    advertiser?: string;
    variant?: 'light' | 'dark';
    /** 'top-left' (default) | 'top-right' \u2014 the only two positions the SDK uses. */
    position?: 'top-left' | 'top-right';
}): HTMLElement | null;
/**
 * Parse an IAB-style size string ('300x250', '728x90', '160x600', etc.) into
 * a {width, height} pair. Returns null when the string is malformed so the
 * caller falls back to legacy behaviour rather than throwing.
 */
export declare function parseAdSize(size: string | undefined): {
    width: number;
    height: number;
} | null;
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
export declare function reserveAdSlot(container: HTMLElement, size: string | undefined): boolean;
/**
 * Phase 7 \u2014 returns true when the user / OS prefers reduced motion. Used
 * by hover-scale and translate animations so we don't trigger vestibular
 * discomfort for users who've asked the system to dial back animation.
 * Falls back to `false` (= motion allowed) when matchMedia isn't available
 * so server-side rendering / older browsers see the same animation as today.
 */
export declare function prefersReducedMotion(): boolean;
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
export declare function mountCtaPanel(opts: {
    container: HTMLElement;
    sovads?: SovAds;
    surface: AdSurface;
    tasks: AttachedTask[];
    campaignId: string;
    bannerClickActive: boolean;
    onComplete?: (ev: AttachedCtaCompleteEvent) => void;
    /** When true, buttons render disabled and do not submit / open links. */
    preview?: boolean;
    /** Visual layout. 'stack' = vertical (default). 'inline' = horizontal row,
     *  used by BottomBar where vertical stacking would blow up bar height.
     *  'auto' = stack normally, switch to inline at exactly 2 tasks so small
     *  surfaces (Banner, Popup, NativeCard) don't waste a row of vertical space. */
    layout?: 'stack' | 'inline' | 'auto';
}): void;
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
export declare function renderAttachedCtas(opts: {
    container: HTMLElement;
    /** Required when `preview` is not true. */
    sovads?: SovAds;
    tasks: AttachedTask[];
    campaignId: string;
    bannerClickActive: boolean;
    onComplete?: (ev: AttachedCtaCompleteEvent) => void;
    /** When true, buttons render disabled and do not submit / open links. */
    preview?: boolean;
    /** Layout for the panel itself. 'stack' (default) = today's vertical column.
     *  'inline' = horizontal row, used by BottomBar where vertical stacking
     *  would blow up the bar height. 'auto' = stack normally, but switch to
     *  inline when there are exactly 2 tasks so small surfaces (Banner, Popup)
     *  don't waste a second row of vertical space. Backcompat: omit \u2192 stack. */
    layout?: 'stack' | 'inline' | 'auto';
}): void;
export declare class Banner {
    private sovads;
    private containerId;
    private currentAd;
    private renderStartTime;
    private hasTrackedImpression;
    private isRendering;
    private refreshTimer;
    private lazyLoadObserver;
    private lastAdId;
    private retryCount;
    private maxRetries;
    private slotConfig;
    constructor(sovads: SovAds, containerId: string, slotConfig?: SlotConfig);
    render(consumerId?: string, forceRefresh?: boolean): Promise<void>;
    private checkViewport;
    private setupLazyLoadObserver;
    private setupAutoRefresh;
    destroy(): void;
}
export interface PopupShowOptions {
    consumerId?: string;
    /** Milliseconds to wait after `show()` before mounting the popup. Default 3000. */
    delay?: number;
    /** Request attached CTA tasks and render them beneath the media. Defaults to
     *  ON — the SDK auto-detects CTAs. Pass `false` to opt out. */
    attached?: boolean;
    /** Phase 1: callback fired after each CTA submission attempt. */
    onCtaComplete?: (ev: AttachedCtaCompleteEvent) => void;
    /** Phase 2: 'media' (default) = media is the click target. 'button' = an
     *  explicit "Learn more" button is the only click target. */
    clickTarget?: 'media' | 'button';
    /** Phase 2: per-slot override for the Sponsored badge. */
    disclosureLabel?: boolean | string;
}
export declare class Popup {
    private sovads;
    private currentAd;
    private popupElement;
    private isShowing;
    private retryCount;
    private maxRetries;
    private storageKeyLastShown;
    private storageKeySessionCount;
    /** Phase 1: remembered across the show \u2192 renderPopup boundary so the CTA
     *  mount has access to the original opts without changing renderPopup's
     *  signature (kept private to preserve subclass compatibility). */
    private currentOpts;
    /** Phase 7: keyboard escape hatch. Bound once per show() so we can
     *  removeEventListener on hide() and avoid listener leaks. */
    private escHandler;
    constructor(sovads: SovAds);
    private canShowByFrequencyCap;
    private markShown;
    /**
     * Show the popup. Two call shapes (both supported \u2014 backwards compatible):
     *
     *   popup.show()                              // defaults
     *   popup.show('consumer-id', 3000)           // legacy positional
     *   popup.show({ consumerId, delay, attached, onCtaComplete })  // recommended
     */
    show(consumerIdOrOpts?: string | PopupShowOptions, delay?: number): Promise<void>;
    private renderPopup;
    /** Phase 7: keyboard escape hatch. The popup is a non-modal sticky card,
     *  so we don't trap focus — but pressing Esc anywhere should dismiss it.
     *  Bound on each renderPopup() so re-shows install a fresh handler, and
     *  always paired with removeEventListener in hide(). */
    private bindEscHandler;
    hide(): void;
}
export interface BottomBarShowOptions {
    consumerId?: string;
    /** Request attached CTA tasks and render them to the right of the media
     *  (inline layout). Defaults to ON; pass `false` to opt out. */
    attached?: boolean;
    /** Phase 1: callback fired after each CTA submission attempt. */
    onCtaComplete?: (ev: AttachedCtaCompleteEvent) => void;
    /** Phase 2: 'button' (default for BottomBar) = only an explicit "Learn more"
     *  button is clickable. 'media' = legacy bar-wide click target (NOT
     *  recommended — produces accidental clicks at the screen edge). */
    clickTarget?: 'media' | 'button';
    /** Phase 2: per-slot override for the Sponsored badge. */
    disclosureLabel?: boolean | string;
}
export declare class BottomBar {
    private sovads;
    private barElement;
    private currentAd;
    private isVisible;
    private retryCount;
    private maxRetries;
    /** Phase 1: remembered across show \u2192 renderBar so the CTA mount has
     *  access to the original opts. */
    private currentOpts;
    /** Phase 7: keyboard escape hatch. Bound when the bar is appended to
     *  the DOM, removed in hide() to avoid listener leaks. */
    private escHandler;
    constructor(sovads: SovAds);
    /**
     * Show the bottom bar. Two call shapes (both supported \u2014 backwards compatible):
     *
     *   bottomBar.show()
     *   bottomBar.show('consumer-id')                 // legacy positional
     *   bottomBar.show({ consumerId, attached, onCtaComplete })  // recommended
     */
    show(consumerIdOrOpts?: string | BottomBarShowOptions): Promise<void>;
    private renderBar;
    hide(): void;
}
export declare class Sidebar {
    private sovads;
    private containerId;
    private currentAd;
    private renderStartTime;
    private hasTrackedImpression;
    private isRendering;
    private refreshTimer;
    private lazyLoadObserver;
    private lastAdId;
    private retryCount;
    private maxRetries;
    private slotConfig;
    constructor(sovads: SovAds, containerId: string, slotConfig?: SlotConfig);
    render(consumerId?: string, forceRefresh?: boolean): Promise<void>;
    private checkViewport;
    private setupLazyLoadObserver;
    private setupAutoRefresh;
    destroy(): void;
}
export interface OverlayShowOptions {
    consumerId?: string;
    /** Render attached CTA tasks inside the overlay. Defaults to ON; pass `false` to opt out. */
    attached?: boolean;
    /** Callback fired after each CTA submission attempt. */
    onCtaComplete?: (ev: AttachedCtaCompleteEvent) => void;
    /** 'media' (default) = whole image is the click target. 'button' = explicit
     *  "Learn more" CTA only. */
    clickTarget?: 'media' | 'button';
    /** Per-slot override for the Sponsored badge. */
    disclosureLabel?: boolean | string;
    /** When true, clicking outside the card dismisses the overlay. Default true. */
    dismissOnBackdrop?: boolean;
    /** When true, pressing Escape dismisses the overlay. Default true. */
    dismissOnEscape?: boolean;
}
export declare class Overlay {
    protected sovads: SovAds;
    protected currentAd: AdComponent | null;
    protected overlayElement: HTMLElement | null;
    protected isShowing: boolean;
    protected currentOpts: OverlayShowOptions;
    protected escHandler: ((e: KeyboardEvent) => void) | null;
    protected previousBodyOverflow: string;
    protected storageKeyLastShown: string;
    protected storageKeySessionCount: string;
    protected placement: string;
    constructor(sovads: SovAds);
    protected canShowByFrequencyCap(): boolean;
    protected markShown(): void;
    /**
     * Show the overlay. Two call shapes (both supported \u2014 backwards compatible):
     *
     *   overlay.show()                          // defaults
     *   overlay.show('consumer-id')              // legacy positional
     *   overlay.show({ consumerId, attached, onCtaComplete, ... })
     */
    show(consumerIdOrOpts?: string | OverlayShowOptions): Promise<void>;
    protected renderOverlay(): void;
    hide(): void;
}
export declare class Interstitial extends Overlay {
    protected storageKeyLastShown: string;
    protected storageKeySessionCount: string;
    protected placement: string;
}
export interface NativeCardRenderOptions {
    consumerId?: string;
    /** Request attached CTA tasks and render them under the card body. Defaults to
     *  ON — the SDK auto-detects CTAs. Pass `false` to opt out. */
    attached?: boolean;
    /** Phase 1: callback fired after each CTA submission attempt. */
    onCtaComplete?: (ev: AttachedCtaCompleteEvent) => void;
    /** Phase 2: 'media' (default) = card is the click target. 'button' = explicit
     *  "Learn more" button only. */
    clickTarget?: 'media' | 'button';
    /** Phase 2: per-slot override for the Sponsored badge. */
    disclosureLabel?: boolean | string;
}
export declare class NativeCard {
    private sovads;
    private containerId;
    private currentAd;
    constructor(sovads: SovAds, containerId: string);
    /**
     * Render the native card. Two call shapes (backwards compatible):
     *
     *   nativeCard.render()
     *   nativeCard.render('consumer-id')                    // legacy positional
     *   nativeCard.render({ consumerId, attached, onCtaComplete })  // recommended
     */
    render(consumerIdOrOpts?: string | NativeCardRenderOptions): Promise<void>;
}
export interface CtaUnitRenderOptions {
    consumerId?: string;
    /** Layout for the CTA panel itself. 'stack' (default), 'inline', or 'auto'
     *  (inline at exactly 2 tasks, stack otherwise). */
    layout?: 'stack' | 'inline' | 'auto';
    /** Callback fired after each CTA submission attempt. */
    onCtaComplete?: (ev: AttachedCtaCompleteEvent) => void;
}
export declare class CtaUnit {
    private sovads;
    private containerId;
    private currentAd;
    private isRendering;
    constructor(sovads: SovAds, containerId: string);
    render(consumerIdOrOpts?: string | CtaUnitRenderOptions): Promise<void>;
}
export declare const GOOD_DOLLAR_ICON_DATA_URI = "data:image/png;base64,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";
/**
 * Build a compact reward badge ("Earn <icon> <amount>") that ad surfaces
 * overlay to surface the viewer-reward. Returns an HTMLElement; caller is
 * responsible for absolute positioning over the creative.
 */
export declare function buildRewardBadge(opts?: {
    /** Numeric or pre-formatted reward amount. Default: '0.5'. */
    amount?: number | string;
    /** 'dark' (default, black pill) for light backgrounds; 'light' for dark. */
    variant?: 'light' | 'dark';
}): HTMLElement;
export default SovAds;
//# sourceMappingURL=index.d.ts.map