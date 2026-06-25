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
     *  bannerClickActive=false). Off by default for backward compatibility. */
    attached?: boolean;
}
interface SlotConfig {
    placementId?: string;
    size?: string;
    /** Render attached CTAs under the banner (auto-passes attached=true to loadAd). */
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
    /** Phase 1: request attached CTA tasks from the server and render them
     *  beneath the media. Off by default for backward compatibility. */
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
    /** Phase 1: request attached CTA tasks from the server and render them
     *  to the right of the media (inline layout). Off by default. */
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
    /** Render attached CTA tasks inside the overlay. Off by default. */
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
    /** Phase 1: request attached CTA tasks and render them under the card body. */
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
export default SovAds;
//# sourceMappingURL=index.d.ts.map