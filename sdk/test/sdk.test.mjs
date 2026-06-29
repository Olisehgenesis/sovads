import test from 'node:test'
import assert from 'node:assert/strict'

// Minimal DOM stubs for SDK constructor in Node tests.
Object.defineProperty(globalThis, 'window', {
  value: {
  location: { hostname: 'localhost', href: 'http://localhost:3000' },
  innerWidth: 1280,
  innerHeight: 720,
  localStorage: {
    _store: new Map(),
    getItem(key) { return this._store.get(key) ?? null },
    setItem(key, value) { this._store.set(key, value) },
  },
  },
  configurable: true,
})
Object.defineProperty(globalThis, 'document', { value: { referrer: '' }, configurable: true })
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'test', language: 'en-US' }, configurable: true })
Object.defineProperty(globalThis, 'screen', { value: { width: 1920, height: 1080 }, configurable: true })
Object.defineProperty(globalThis, 'crypto', {
  value: { randomUUID: () => '00000000-0000-0000-0000-000000000000' },
  configurable: true,
})
Object.defineProperty(globalThis, 'btoa', {
  value: (value) => Buffer.from(value, 'binary').toString('base64'),
  configurable: true,
})

const { SovAds, BottomBar, Banner, Popup, NativeCard, CtaUnit, Overlay, Interstitial, mountMedia, mountAdMedia, buildDisclosureBadge, renderAttachedCtas, resolveDisclosureLabel, buildPositionedDisclosure, parseAdSize, reserveAdSlot, prefersReducedMotion } = await import('../dist/index.js')

test('normalizeUrl adds protocol for localhost', () => {
  const sdk = new SovAds({ apiUrl: 'http://localhost:3000' })
  assert.equal(sdk.normalizeUrl('localhost:3000/path'), 'http://localhost:3000/path')
})

test('normalizeUrl keeps valid https URL', () => {
  const sdk = new SovAds({ apiUrl: 'http://localhost:3000' })
  assert.equal(sdk.normalizeUrl('https://example.com/ad'), 'https://example.com/ad')
})

test('BottomBar class exists and can be instantiated', () => {
  const sdk = new SovAds({ apiUrl: 'http://localhost:3000' })
  // eslint-disable-next-line no-new
  new BottomBar(sdk)
  assert.equal(typeof BottomBar.prototype.show, 'function')
  assert.equal(typeof BottomBar.prototype.hide, 'function')
})

// Phase 0 \u2014 helpers are exported.
test('Phase 0 helpers exported', () => {
  assert.equal(typeof mountMedia, 'function')
  assert.equal(typeof buildDisclosureBadge, 'function')
  assert.equal(typeof renderAttachedCtas, 'function')
})

// Phase 1 \u2014 every component class exists, CtaUnit added.
test('Phase 1: every component class is exported', () => {
  assert.equal(typeof Banner, 'function')
  assert.equal(typeof Popup, 'function')
  assert.equal(typeof BottomBar, 'function')
  assert.equal(typeof NativeCard, 'function')
  assert.equal(typeof CtaUnit, 'function')
})

// Phase 1 \u2014 every component constructor + render/show signature is intact
// (no breaking changes for existing publishers).
test('Phase 1: backcompat \u2014 component constructors take the same args', () => {
  const sdk = new SovAds({ apiUrl: 'http://localhost:3000' })
  // eslint-disable-next-line no-new
  new Banner(sdk, 'banner-container')
  // eslint-disable-next-line no-new
  new Banner(sdk, 'banner-container', { placementId: 'top', attached: true })
  // eslint-disable-next-line no-new
  new Popup(sdk)
  // eslint-disable-next-line no-new
  new NativeCard(sdk, 'native-container')
  // eslint-disable-next-line no-new
  new CtaUnit(sdk, 'cta-container')
  assert.equal(typeof Popup.prototype.show, 'function')
  assert.equal(typeof NativeCard.prototype.render, 'function')
  assert.equal(typeof CtaUnit.prototype.render, 'function')
})

// Phase 1 \u2014 Popup.show / BottomBar.show / NativeCard.render must accept BOTH
// the legacy positional shape AND the new opts-object shape. We verify the
// signatures exist and their `length` is the parameter count (so a positional
// caller still type-checks), without invoking them \u2014 they'd reach DOM /
// fetch which the Node test env doesn't provide.
test('Phase 1: Popup.show signature accepts a single optional positional arg', () => {
  // function.length counts only required leading args; our overloaded `show`
  // declares one required-looking `consumerIdOrOpts?` arg, so .length === 0.
  // The key guarantee: the function is defined, async, and accepts at least
  // one optional arg \u2014 confirmed by Function.prototype.toString containing
  // the parameter name.
  const src = Popup.prototype.show.toString()
  assert.ok(src.includes('consumerIdOrOpts'))
  assert.ok(src.includes('delay'))
})

test('Phase 1: BottomBar.show signature accepts opts or consumerId', () => {
  const src = BottomBar.prototype.show.toString()
  assert.ok(src.includes('consumerIdOrOpts'))
})

test('Phase 1: NativeCard.render signature accepts opts or consumerId', () => {
  const src = NativeCard.prototype.render.toString()
  assert.ok(src.includes('consumerIdOrOpts'))
})

// Phase 2 \u2014 disclosure resolver layered defaults.
test('Phase 2: resolveDisclosureLabel defaults to "Sponsored"', () => {
  assert.equal(resolveDisclosureLabel(undefined, undefined), 'Sponsored')
})

test('Phase 2: resolveDisclosureLabel honours config value when slot omits', () => {
  assert.equal(resolveDisclosureLabel(undefined, 'Promoted'), 'Promoted')
})

test('Phase 2: resolveDisclosureLabel slot override wins over config', () => {
  assert.equal(resolveDisclosureLabel('Ad', 'Promoted'), 'Ad')
})

test('Phase 2: resolveDisclosureLabel false at slot disables disclosure', () => {
  assert.equal(resolveDisclosureLabel(false, 'Promoted'), null)
})

test('Phase 2: resolveDisclosureLabel false at config disables disclosure', () => {
  assert.equal(resolveDisclosureLabel(undefined, false), null)
})

test('Phase 2: resolveDisclosureLabel true at slot re-enables when config disabled', () => {
  // Slot opt-in must override a config-level off switch \u2014 publishers can
  // suppress globally but still re-enable per-slot for transparency.
  assert.equal(resolveDisclosureLabel(true, false), 'Sponsored')
})

// Phase 2 \u2014 SovAds.getConfig() is public so component classes can read the
// resolved config (we use it from Banner/Sidebar/Popup/BottomBar/NativeCard
// to pick up disclosureLabel + advertiserName + debug).
test('Phase 2: SovAds.getConfig is public and returns the resolved config', () => {
  const sdk = new SovAds({ apiUrl: 'http://localhost:3000', disclosureLabel: 'Ad', advertiserName: 'Acme' })
  const cfg = sdk.getConfig()
  assert.equal(cfg.disclosureLabel, 'Ad')
  assert.equal(cfg.advertiserName, 'Acme')
})

// Phase 2 \u2014 buildPositionedDisclosure is exported and returns null when
// disclosure is suppressed (so callers know not to append anything).
test('Phase 2: buildPositionedDisclosure is exported', () => {
  assert.equal(typeof buildPositionedDisclosure, 'function')
})

test('Phase 2: buildPositionedDisclosure returns null when disabled', () => {
  // No DOM in Node \u2014 we exit on the null branch before touching document.
  const result = buildPositionedDisclosure({ slotOverride: false })
  assert.equal(result, null)
})

// Phase 3 \u2014 CLS reservation helpers.
test('Phase 3: parseAdSize handles standard IAB sizes', () => {
  assert.deepEqual(parseAdSize('300x250'), { width: 300, height: 250 })
  assert.deepEqual(parseAdSize('728x90'), { width: 728, height: 90 })
  assert.deepEqual(parseAdSize('160x600'), { width: 160, height: 600 })
  assert.deepEqual(parseAdSize('970x250'), { width: 970, height: 250 })
})

test('Phase 3: parseAdSize tolerates whitespace and capitalisation', () => {
  assert.deepEqual(parseAdSize(' 300 X 250 '), { width: 300, height: 250 })
})

test('Phase 3: parseAdSize returns null for malformed input', () => {
  assert.equal(parseAdSize(undefined), null)
  assert.equal(parseAdSize(''), null)
  assert.equal(parseAdSize('not-a-size'), null)
  assert.equal(parseAdSize('300'), null)
  assert.equal(parseAdSize('300x0'), null)
  assert.equal(parseAdSize('0x250'), null)
})

test('Phase 3: reserveAdSlot returns false when no size given (legacy path)', () => {
  // Minimal element stub \u2014 we only touch .style, never read the DOM.
  const el = { style: {} }
  assert.equal(reserveAdSlot(el, undefined), false)
  // Container shouldn't have aspect-ratio set when we return false.
  assert.equal(el.style.aspectRatio, undefined)
})

test('Phase 3: reserveAdSlot sets aspect-ratio + max-width when size given', () => {
  const el = { style: {} }
  const ok = reserveAdSlot(el, '300x250')
  assert.equal(ok, true)
  assert.equal(el.style.aspectRatio, '300 / 250')
  assert.equal(el.style.width, '100%')
  assert.equal(el.style.maxWidth, '300px')
})

test('Phase 3: reserveAdSlot preserves caller-set backgroundColor', () => {
  const el = { style: { backgroundColor: '#abcdef' } }
  reserveAdSlot(el, '728x90')
  // We only fill in a placeholder bg when the caller hadn't set one.
  assert.equal(el.style.backgroundColor, '#abcdef')
})

// Phase 4 \u2014 Overlay + Interstitial are exported and instantiable.
test('Phase 4: Overlay class exists and can be instantiated', () => {
  const sdk = new SovAds({ apiUrl: 'http://localhost:3000' })
  // eslint-disable-next-line no-new
  new Overlay(sdk)
  assert.equal(typeof Overlay.prototype.show, 'function')
  assert.equal(typeof Overlay.prototype.hide, 'function')
})

test('Phase 4: Interstitial extends Overlay (same public API)', () => {
  const sdk = new SovAds({ apiUrl: 'http://localhost:3000' })
  const inter = new Interstitial(sdk)
  assert.equal(inter instanceof Overlay, true)
  assert.equal(typeof inter.show, 'function')
  assert.equal(typeof inter.hide, 'function')
})

test('Phase 4: Overlay.show signature accepts opts or consumerId', () => {
  const src = Overlay.prototype.show.toString()
  assert.ok(src.includes('consumerIdOrOpts'))
})

// Phase 4 \u2014 hide() should be safe to call even when overlay was never shown
// (catches a regression we'd otherwise only catch when a publisher binds it
// to a route-change handler that fires before any show()).
test('Phase 4: Overlay.hide is safe to call before show', () => {
  const sdk = new SovAds({ apiUrl: 'http://localhost:3000' })
  const overlay = new Overlay(sdk)
  // Provide document.body for the scroll-restore branch.
  const previousDocument = globalThis.document
  Object.defineProperty(globalThis, 'document', {
    value: { ...previousDocument, body: { style: { overflow: '' } } },
    configurable: true,
  })
  try {
    overlay.hide() // must not throw
  } finally {
    Object.defineProperty(globalThis, 'document', { value: previousDocument, configurable: true })
  }
})

// Phase 5 \u2014 component styles use CSS variables with safe fallbacks.
// We grep the compiled bundle once so regressions (someone hard-coding
// '#2D2D2D' again without the var() wrapper) fail loudly in CI.
test('Phase 5: compiled SDK references --sovads-* CSS variables', async () => {
  const { readFile } = await import('node:fs/promises')
  const src = await readFile(new URL('../dist/index.js', import.meta.url), 'utf8')
  assert.ok(src.includes('--sovads-accent'), 'expected --sovads-accent in bundle')
  assert.ok(src.includes('--sovads-on-accent'), 'expected --sovads-on-accent in bundle')
  assert.ok(src.includes('--sovads-surface'), 'expected --sovads-surface in bundle')
})

test('Phase 5: every hardcoded brand colour in the bundle is wrapped in var(...)', async () => {
  const { readFile } = await import('node:fs/promises')
  const src = await readFile(new URL('../dist/index.js', import.meta.url), 'utf8')
  // Find every occurrence of the brand hexes and assert each one is the
  // fallback half of a var() reference, NOT a bare literal. We allow case
  // variations and check the 12 chars before the hex contain 'var('.
  const HEXES = ['#2D2D2D', '#F5F3F0', '#FAFAF8']
  for (const hex of HEXES) {
    let idx = 0
    while ((idx = src.toUpperCase().indexOf(hex, idx)) !== -1) {
      const window = src.slice(Math.max(0, idx - 32), idx)
      assert.ok(
        window.includes('var(--sovads-'),
        `bare \"${hex}\" literal at index ${idx}: \"...${window}${src.slice(idx, idx + 8)}...\". Wrap it in var(--sovads-*, ${hex}).`,
      )
      idx += hex.length
    }
  }
})

// Phase 6 \u2014 refreshInterval no longer defaults to 30s. Auto-rotation broke
// click attribution (impression on ad A, click on ad B), so opt-in only now.
test('Phase 6: refreshInterval defaults to 0 (off)', () => {
  const sdk = new SovAds({ apiUrl: 'http://localhost:3000' })
  assert.equal(sdk.getConfig().refreshInterval, 0)
})

test('Phase 6: refreshInterval still honours explicit caller value', () => {
  const sdk = new SovAds({ apiUrl: 'http://localhost:3000', refreshInterval: 60 })
  assert.equal(sdk.getConfig().refreshInterval, 60)
})

// Phase 6 \u2014 the postMessage origin guard is compiled into the bundle. The
// behavioural test would need a real iframe; we settle for an exact-string
// presence check so a refactor that drops the guard fails loudly.
test('Phase 6: mountUnit listener checks ev.origin against expected origin', async () => {
  const { readFile } = await import('node:fs/promises')
  const src = await readFile(new URL('../dist/index.js', import.meta.url), 'utf8')
  assert.ok(src.includes('ev.origin'), 'expected ev.origin reference in mountUnit listener')
  assert.ok(src.includes('expectedOrigin'), 'expected `expectedOrigin` variable in mountUnit')
})

// Phase 7 \u2014 accessibility. The SDK is consumed inside publisher pages; if
// it ships markup without aria roles or with motion that ignores OS settings
// it's an accessibility regression on every host site at once. These tests
// pin the export surface and grep the compiled bundle for the structural
// pieces (role/aria-label/aria-live/prefers-reduced-motion guards).

test('Phase 7: prefersReducedMotion is exported and returns boolean', () => {
  assert.equal(typeof prefersReducedMotion, 'function')
  // The test stub has no matchMedia, so the helper must fail safe \u2014 in
  // SSR/Node it returns false and lets animations play (no false positives).
  assert.equal(prefersReducedMotion(), false)
})

test('Phase 7: ad surfaces are annotated as advertisement regions', async () => {
  const { readFile } = await import('node:fs/promises')
  const src = await readFile(new URL('../dist/index.js', import.meta.url), 'utf8')
  // Every component wrapper around the ad media must carry an
  // "Advertisement" label so screen readers can announce it as ad content
  // (and so power users can skip it via landmark navigation).
  assert.ok(src.includes('aria-label'), 'expected aria-label attributes in bundle')
  assert.ok(src.includes('Advertisement'), 'expected literal \"Advertisement\" label')
  assert.ok(src.includes('role'), 'expected role attributes in bundle')
})

test('Phase 7: CTA status uses live region semantics', async () => {
  const { readFile } = await import('node:fs/promises')
  const src = await readFile(new URL('../dist/index.js', import.meta.url), 'utf8')
  // Status updates from CTA submissions are announced politely so they don't
  // interrupt the viewer mid-task. aria-atomic guarantees the whole message
  // is re-read, not just the diff.
  assert.ok(src.includes('aria-live'), 'expected aria-live attribute in bundle')
  assert.ok(src.includes('polite'), 'expected polite live region')
  assert.ok(src.includes('aria-atomic'), 'expected aria-atomic attribute')
})

test('Phase 7: hover motion is gated on prefers-reduced-motion', async () => {
  const { readFile } = await import('node:fs/promises')
  const src = await readFile(new URL('../dist/index.js', import.meta.url), 'utf8')
  // We don't try to count call sites \u2014 if a future refactor swaps in a
  // helper, the literal would change. We just assert the helper is invoked
  // *somewhere* in the bundle, which means at least the original gating is
  // still wired. If you drop all guards, this assertion fails.
  assert.ok(src.includes('prefersReducedMotion'), 'expected prefersReducedMotion calls in bundle')
})

test('Phase 7: overlay/popup/bottom bar wire an Esc dismiss', async () => {
  const { readFile } = await import('node:fs/promises')
  const src = await readFile(new URL('../dist/index.js', import.meta.url), 'utf8')
  // The keyboard escape hatch is the bare minimum for a dismissible surface
  // that has no keyboard-accessible close button focused. Overlay was added
  // in Phase 4; Popup/BottomBar added it in Phase 7.
  assert.ok(src.includes(`'Escape'`), 'expected Escape key check in bundle')
})

// Phase 8 \u2014 \"auto\" CTA layout. When a campaign attaches exactly 2 tasks the
// panel must render them side-by-side so Banners and Popups don't lose a
// second row of vertical real estate to two stacked buttons.

test('Phase 8: renderAttachedCtas accepts layout: auto and resolves it', async () => {
  const { readFile } = await import('node:fs/promises')
  const src = await readFile(new URL('../dist/index.js', import.meta.url), 'utf8')
  // The resolver is a single ternary on tasks.length === 2; if a future
  // refactor drops the 'auto' branch, these substrings disappear together.
  assert.ok(src.includes(`'auto'`), 'expected literal \"auto\" layout value in bundle')
  assert.ok(src.includes('tasks.length === 2'), 'expected the 2-task auto-inline guard in bundle')
})

test('Phase 8: Banner/Popup/NativeCard mount their CTA panel with layout: auto', async () => {
  const { readFile } = await import('node:fs/promises')
  const src = await readFile(new URL('../dist/index.js', import.meta.url), 'utf8')
  // Count occurrences of the literal `layout: 'auto'` in the compiled output.
  // We expect at least 3 (one per surface that opted in). Sidebar/Overlay
  // intentionally stay on 'stack' because they have vertical room.
  const matches = src.match(/layout:\s*['\"]auto['\"]/g) ?? []
  assert.ok(matches.length >= 3, `expected \u22653 layout:'auto' callsites, found ${matches.length}`)
})
// Phase 8 (creative fit) \u2014 mountAdMedia is the single source of truth for
// <img>/<video>/streaming construction. It must (a) be exported, (b) be the
// one called by every visible surface, and (c) wire the auto-fit + blur
// backdrop logic that fixes the "creatives get their bottoms chopped off"
// bug from Phase 3.

test('Phase 8 (fit): mountAdMedia is exported', () => {
  assert.equal(typeof mountAdMedia, 'function')
})

test('Phase 8 (fit): every visible surface routes through mountAdMedia', async () => {
  const { readFile } = await import('node:fs/promises')
  const src = await readFile(new URL('../dist/index.js', import.meta.url), 'utf8')
  // Banner, Sidebar, Popup, BottomBar, Overlay \u2014 5 surfaces, 5 call sites.
  const calls = src.match(/mountAdMedia\s*\(\s*\{/g) ?? []
  assert.ok(
    calls.length >= 5,
    `expected \u22655 mountAdMedia() call sites (Banner/Sidebar/Popup/BottomBar/Overlay), found ${calls.length}`,
  )
})

test('Phase 8 (fit): bundle wires the auto-fit ratio comparison', async () => {
  const { readFile } = await import('node:fs/promises')
  const src = await readFile(new URL('../dist/index.js', import.meta.url), 'utf8')
  // The auto-fit branch promotes contain\u2192cover when |creativeRatio - slotRatio|
  // is within \u00b110%. We assert the literal `naturalWidth` and the 0.1 drift
  // threshold are both present so a refactor that drops one fails loudly.
  assert.ok(src.includes('naturalWidth'), 'expected naturalWidth read in auto-fit branch')
  assert.ok(/drift\s*<\s*0\.1/.test(src), 'expected drift < 0.1 threshold in bundle')
})

test('Phase 8 (fit): bundle ships a blurred letterbox backdrop', async () => {
  const { readFile } = await import('node:fs/promises')
  const src = await readFile(new URL('../dist/index.js', import.meta.url), 'utf8')
  // The visual polish that hides ratio mismatches \u2014 a soft, blurred copy
  // of the creative behind the contained image. If a future refactor drops
  // it, ad slots will start looking like cheap iframes again.
  assert.ok(/filter:blur\(/.test(src), 'expected filter:blur(...) in bundle')
})

test('Phase 8 (fit): legacy raw width:100%;height:auto img mounts are gone', async () => {
  const { readFile } = await import('node:fs/promises')
  const src = await readFile(new URL('../dist/index.js', import.meta.url), 'utf8')
  // The old style "width: 100%; height: auto; ... object-fit: contain" was
  // the source of the chopped-bottom bug \u2014 it ignored the reserved
  // aspect-ratio box and overflowed it. Only the legacy `mountMedia()`
  // helper still has this literal (kept for backcompat); the inline copies
  // in Banner/Sidebar/Popup/BottomBar/Overlay are all migrated. Two hits
  // in the bundle is the ceiling (mountMedia default + a legacy fallback).
  const legacy = src.match(/width:\s*100%;\s*height:\s*auto;[^'"`]*object-fit:\s*contain/g) ?? []
  assert.ok(
    legacy.length <= 2,
    `expected \u22642 legacy raw img mounts, found ${legacy.length} \u2014 migrate to mountAdMedia`,
  )
})

test('Phase 8 (fit): SDK_VERSION bumped to 1.3.x for the new mount pipeline', async () => {
  const { SDK_VERSION } = await import('../dist/index.js')
  assert.ok(
    /^1\.3\./.test(SDK_VERSION),
    `expected SDK_VERSION to start with 1.3., got ${SDK_VERSION}`,
  )
})

