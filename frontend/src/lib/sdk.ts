// Re-export from the in-repo SDK package.
//
// Turbopack only resolves modules inside the project root, so we don't import
// from `sovads-sdk` (npm) or via `../../../sdk/...` (outside the project).
// Instead, `pnpm sdk:build` / `pnpm sdk:watch` compile `../sdk/index.ts` into
// `frontend/src/_sovads_sdk/` (kept in .gitignore). `pnpm dev` runs the watch
// task alongside `next dev` so changes to sdk/index.ts hot-reload here.
export {
  SovAds,
  Banner,
  Popup,
  Sidebar,
  BottomBar,
  NativeCard,
  CtaUnit,
  // Phase 4 \u2014 Overlay + Interstitial rewritten to actually load an ad.
  Overlay,
  Interstitial,
  renderAttachedCtas,
  toStreamingEmbed,
  buildStreamingIframe,
  // Phase 0 helpers \u2014 useful when frontend wants to mount the SDK CTA panel
  // or a media element without going through a full component class.
  mountMedia,
  mountCtaPanel,
  buildDisclosureBadge,
  // Phase 2 helpers \u2014 disclosure-label layering + positioned badge factory.
  resolveDisclosureLabel,
  buildPositionedDisclosure,
  // Phase 3 helpers \u2014 CLS-safe slot reservation.
  parseAdSize,
  reserveAdSlot,
  // Phase 7 helper \u2014 reduced-motion query (publishers can mirror our
  // animation gating in their own UI around the ad).
  prefersReducedMotion,
  // GoodDollar reward icon \u2014 inlined as a data URI so previews + surfaces
  // render the brand mark without an extra HTTP request.
  GOOD_DOLLAR_ICON_DATA_URI,
  buildRewardBadge,
} from '@/_sovads_sdk/index'
export type {
  AttachedTask,
  AttachedTaskKind,
  AttachedPollOption,
  AttachedCtaCompleteEvent,
  StreamingEmbed,
  TaskStatusEntry,
  AdSurface,
  // Phase 1 \u2014 new option types for the overloaded show/render signatures.
  PopupShowOptions,
  BottomBarShowOptions,
  NativeCardRenderOptions,
  CtaUnitRenderOptions,
  // Phase 4 \u2014 Overlay options.
  OverlayShowOptions,
} from '@/_sovads_sdk/index'
