# sovads-sdk

[![npm version](https://img.shields.io/npm/v/sovads-sdk.svg)](https://www.npmjs.com/package/sovads-sdk)
[![license](https://img.shields.io/npm/l/sovads-sdk.svg)](https://github.com/sovseas/sovads/blob/main/sdk/LICENSE)

Publisher SDK for the [SovAds](https://ads.sovseas.xyz) ad network. Ships
seven modular surfaces (Banner, Sidebar, Popup, BottomBar, Overlay,
Interstitial, NativeCard) plus an opt-in **attached CTA** system that lets a
single ad carry up to two on-page tasks (visit-url, sign-message, poll) and
reward viewers for completing them.

- Zero peer dependencies. Works in any HTML page or framework (React, Vue,
  Svelte, plain `<script type="module">`).
- Full TypeScript types.
- Backward compatible — every existing positional call site keeps working;
  attached CTAs are strictly opt-in.

---

## Installation

```bash
npm install sovads-sdk@latest
# or
pnpm add sovads-sdk@latest
# or
yarn add sovads-sdk@latest
```

CDN / no-bundler usage:

```html
<script type="module">
  import { SovAds, Banner } from 'https://ads.sovseas.xyz/api/v1/sdk'
  const sovads = new SovAds({ debug: true })
  await new Banner(sovads, 'banner').render()
</script>
```

---

## Quick start

```ts
import { SovAds, Banner, Popup, Sidebar, BottomBar } from 'sovads-sdk'

const sovads = new SovAds({
  // apiUrl defaults to https://ads.sovseas.xyz in production builds; override
  // for self-hosting or local dev.
  apiUrl: 'https://ads.sovseas.xyz',
  debug: false,
  // Optional — auto-detected from the page origin if omitted.
  siteId: 'your-site-id',
  // Optional — viewer wallet for reward attribution.
  walletAddress: '0x...',
})

// 1. Inline banner
await new Banner(sovads, 'banner-container').render()

// 2. Sidebar
await new Sidebar(sovads, 'sidebar-container').render()

// 3. Popup (modal, with frequency cap)
await new Popup(sovads).show()

// 4. Bottom bar (sticky, dismissible)
await new BottomBar(sovads).show()
```

---

## Attached CTAs (v1.1+)

A campaign can attach up to **2 tasks** to its banner. The SDK renders them
inline beneath the media. Reward issuance and HMAC-signed verification are
handled server-side; the SDK only mounts UI and reports submissions.

```ts
import { Banner } from 'sovads-sdk'

const banner = new Banner(sovads, 'banner-container', {
  attached: true,              // ask the server for attached tasks
  clickTarget: 'button',       // optional: route click-through through an
                               //   explicit "Learn more" button (recommended)
  onCtaComplete: (ev) => {
    if (ev.ok) {
      console.log('rewarded', ev.awarded) // { points, gs, bonusPointsInLieuOfGs? }
    } else if (ev.needsSignature) {
      // SIGN_MESSAGE task — your wallet code should sign ev.needsSignature.message
    }
  },
})
await banner.render()
```

Supported task kinds:

| Kind            | What the viewer does                       |
| --------------- | ------------------------------------------ |
| `VISIT_URL`     | Clicks through and dwells `minDwellMs`.    |
| `SIGN_MESSAGE`  | Signs a short message with their wallet.   |
| `POLL`          | Picks one of up to 4 options.              |

If the campaign has no attached tasks, or you don't pass `attached: true`, the
SDK falls back to the classic banner-only experience.

### Pure-CTA unit (no media)

For a CTA-only slot (e.g. an inline poll under an article):

```ts
import { CtaUnit } from 'sovads-sdk'

await new CtaUnit(sovads, 'poll-here').render({
  layout: 'auto',   // 'stack' | 'inline' | 'auto' (inline at 2 tasks)
  onCtaComplete: (ev) => { /* … */ },
})
```

---

## API reference

### `new SovAds(config?: SovAdsConfig)`

| Field                       | Type                       | Default                       | Notes                                                                                |
| --------------------------- | -------------------------- | ----------------------------- | ------------------------------------------------------------------------------------ |
| `apiUrl`                    | `string`                   | `https://ads.sovseas.xyz`     | API origin. Set to your local server in dev.                                         |
| `siteId`                    | `string`                   | auto-detected                 | Publisher site ID.                                                                   |
| `apiKey` / `apiSecret`      | `string`                   | —                             | Enables HMAC-signed tracking.                                                        |
| `debug`                     | `boolean`                  | `false`                       | Verbose console logging.                                                             |
| `consumerId`                | `string`                   | —                             | Target a specific advertiser slug.                                                   |
| `walletAddress`             | `string`                   | —                             | Viewer wallet for reward attribution.                                                |
| `refreshInterval`           | `number` (seconds)         | `0` (off)                     | Auto-refresh interval for Banner / Sidebar.                                          |
| `lazyLoad`                  | `boolean`                  | `true`                        | Use IntersectionObserver to defer load until in-viewport.                            |
| `rotationEnabled`           | `boolean`                  | `true`                        | Rotate between ads when refreshing.                                                  |
| `popupMinIntervalMinutes`   | `number`                   | `30`                          | Min minutes between popup / overlay impressions per viewer.                          |
| `popupSessionMax`           | `number`                   | `1`                           | Hard cap on popup / overlay impressions per browser session.                         |
| `disclosureLabel`           | `boolean \| string`        | `true` (`"Sponsored"`)        | Force a custom label (e.g. `"Ad"`) or `false` to suppress (not recommended).         |
| `advertiserName`            | `string`                   | —                             | Appended to the disclosure: `"Sponsored · {advertiserName}"`.                        |

### `Banner`

```ts
new Banner(sovads, containerId, slotConfig?: SlotConfig)
banner.render(consumerId?: string, forceRefresh?: boolean): Promise<void>
```

`SlotConfig`: `{ placementId?, size?, attached?, onCtaComplete?, clickTarget?, disclosureLabel? }`.

### `Sidebar`

```ts
new Sidebar(sovads, containerId, slotConfig?: SlotConfig)
sidebar.render(consumerId?: string, forceRefresh?: boolean): Promise<void>
```

### `Popup`

```ts
new Popup(sovads)
popup.show(consumerIdOrOpts?: string | PopupShowOptions): Promise<void>
popup.hide(): void
```

`PopupShowOptions`: `{ consumerId?, delay? (ms, default 3000), attached?, onCtaComplete?, clickTarget?, disclosureLabel? }`.

### `BottomBar`

```ts
new BottomBar(sovads)
bottomBar.show(consumerIdOrOpts?: string | BottomBarShowOptions): Promise<void>
bottomBar.hide(): void
```

Defaults to `clickTarget: 'button'` to suppress accidental bar-wide clicks.

### `Overlay` / `Interstitial`

`Overlay` is a full-viewport modal with backdrop dismiss. `Interstitial`
extends it with its own frequency-cap counter so the two surfaces never
share a budget.

```ts
new Overlay(sovads)
overlay.show(opts?: OverlayShowOptions): Promise<void>
overlay.hide(): void

new Interstitial(sovads) // same API
```

`OverlayShowOptions`: `{ consumerId?, attached?, onCtaComplete?, clickTarget?, disclosureLabel?, dismissOnBackdrop? (default true), dismissOnEscape? (default true) }`.

### `NativeCard`

```ts
new NativeCard(sovads, containerId)
card.render(consumerIdOrOpts?: string | NativeCardRenderOptions): Promise<void>
```

### `CtaUnit`

Pure CTA panel (no media). See [Attached CTAs](#attached-ctas-v11) above.

### Other exports

- `SDK_VERSION` — runtime version string, kept in sync with `package.json`.
- `mountMedia`, `mountCtaPanel`, `renderAttachedCtas` — low-level building blocks for custom layouts.
- `buildRewardBadge`, `buildDisclosureBadge` — drop-in UI primitives.
- `toStreamingEmbed`, `buildStreamingIframe` — helpers for video creatives.
- Types: `SovAdsConfig`, `AdComponent`, `AttachedTask`, `AttachedTaskKind`, `AttachedPollOption`, `AttachedCtaCompleteEvent`, `SlotConfig`, `PopupShowOptions`, `BottomBarShowOptions`, `OverlayShowOptions`, `NativeCardRenderOptions`, `CtaUnitRenderOptions`, `AdSurface`.

---

## Styling

Every surface ships unstyled-friendly hooks; target these classes in your own
CSS to brand the units:

| Class                          | Surface       |
| ------------------------------ | ------------- |
| `.sovads-banner`               | Banner        |
| `.sovads-sidebar`              | Sidebar       |
| `.sovads-popup-overlay`        | Popup         |
| `.sovads-bottom-bar`           | BottomBar     |
| `.sovads-overlay`              | Overlay / Interstitial |
| `.sovads-native-card`          | NativeCard    |
| `.sovads-cta-panel`            | Attached CTA panel (all surfaces) |
| `.sovads-disclosure`           | "Sponsored" badge |
| `.sovads-reward-badge`         | "Earn N pts" badge |

---

## Frequency capping

Popup, Overlay, and Interstitial each persist a `last-shown` timestamp in
`localStorage` and a session counter in `sessionStorage`. The same
`popupMinIntervalMinutes` / `popupSessionMax` knobs apply to all three —
publishers don't have to think about three sets of dials. Banner / Sidebar /
BottomBar / NativeCard do **not** frequency-cap (they're publisher-placed).

---

## Tracking

The SDK sends two events:

- `IMPRESSION` — fired once the creative is verified visible
  (IntersectionObserver, ≥ 50% area for ≥ 1s by default).
- `CLICK` — fired on banner / button click-through.

Attached-CTA submissions go through the regular `/api/tasks/*` endpoints and
emit `onCtaComplete` callbacks.

All outbound tracking carries the `X-SovAds-SDK-Version` header so the server
can correlate metrics with SDK releases.

---

## Features

- Automatic site detection
- IntersectionObserver-based viewability tracking
- Network retry with exponential backoff
- Image / video load error handling
- `navigator.sendBeacon` fallback for tracking on page unload
- Reduced-motion respect (`prefers-reduced-motion`)
- TypeScript-first
- Zero runtime dependencies

## Browser support

Evergreen Chromium, Firefox, Safari (last 2 versions). Requires native
`IntersectionObserver` and ES2020.

## License

MIT — see [LICENSE](https://github.com/sovseas/sovads/blob/main/sdk/LICENSE).

## Links

- [Documentation](https://ads.sovseas.xyz/docs)
- [Repository](https://github.com/sovseas/sovads)
- [Issues](https://github.com/sovseas/sovads/issues)
