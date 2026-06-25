# CTA-on-Banner Implementation Plan

> Build attached-CTA support into the SDK so a single ad slot can show:
> banner image + 1–2 CTA buttons, banner + inline poll, poll-only, or
> buttons-only (when the banner click budget is exhausted but CTAs still pay).
>
> Status: PLAN — nothing in this doc has been implemented yet.

---

## 0. Goals & non-goals

### Goals
- A viewer in any existing slot (banner, sidebar, popup) can earn rewards by
  tapping CTA buttons or voting in a poll **next to** the banner image.
- When a campaign's click budget is exhausted (so the banner click no longer
  pays in tokens), the slot keeps rendering and offers the same CTAs — the
  viewer earns SovPoints via the fallback we already shipped.
- Zero breakage for the seven integrated callers listed above.

### Non-goals (this iteration)
- New CTA *kinds* — we ship with the kinds the backend already knows:
  `VISIT_URL`, `SIGN_MESSAGE`, `POLL`. The others (`SOCIAL_FOLLOW`, `QUIZ`,
  `STAKE_GS`, `CONTRACT_CALL`, `FEEDBACK`, `SURVEY`) keep going through
  `mountUnit()` standalone surfaces.
- Multi-step SURVEY inside an attached slot (won't fit a 728×90 banner).
- Mobile interstitials, full-page takeovers.

---

## 1. What exists today (grounded reference)

- **Schema** already supports it: `CampaignTask.surface` defaults to
  `'attached'` ([schema.prisma:385](prisma/schema.prisma#L385)) but no API
  endpoint actually returns attached tasks with their parent banner.
- **`/api/serve`** picks either a BANNER campaign **or** a standalone task,
  never both ([api/serve/route.ts:226-269](src/app/api/serve/route.ts#L226)).
- **SDK** ships a single hardcoded "Learn more" button per banner-like unit at
  three locations: [sdk/index.ts:1247](../sdk/index.ts#L1247),
  [sdk/index.ts:1721](../sdk/index.ts#L1721),
  [sdk/index.ts:2176](../sdk/index.ts#L2176).
- **Points fallback** for exhausted budgets already lives in
  [api/tasks/complete/route.ts](src/app/api/tasks/complete/route.ts) and
  [api/advertiser/review/route.ts](src/app/api/advertiser/review/route.ts)
  (shipped earlier this session). Whatever the SDK earns via CTAs is paid
  through these endpoints, so no payout work needed here.

---

## 2. Wire format (smallest viable change)

### 2.1 New query flag on `/api/serve`

```
GET /api/serve?siteId=…&kind=BANNER&attached=1
```

`attached=1` is **opt-in**. Old callers see today's response byte-for-byte.

### 2.2 New response fields (only when `attached=1`)

```ts
{
  kind: 'BANNER',
  siteId, isUnverified,
  ad: { … unchanged … },
  bannerClickActive: boolean,   // false ⇢ campaign budget exhausted; SDK
                                // still renders the image but doesn't fire
                                // CLICK tracking and disables the link
  attachedTasks?: Array<PublicAttachedTask>,
}
```

### 2.3 `PublicAttachedTask` shape

Reuses the existing `publicTaskShape()` in
[api/serve/route.ts:79](src/app/api/serve/route.ts#L79) but only for
`VISIT_URL | SIGN_MESSAGE | POLL`. Returned fields:

```ts
{
  id: string
  campaignId: string
  kind: 'VISIT_URL' | 'SIGN_MESSAGE' | 'POLL'
  label: string                  // primary button text
  buttonLabel?: string           // optional override (already in schema)
  description: string | null
  rewardPoints: number
  rewardGs: number               // 0 when no on-chain reward
  config: {
    url?: string                 // VISIT_URL
    signMessage?: string         // SIGN_MESSAGE
    options?: Array<{ id, label }>  // POLL
  }
}
```

### 2.4 Backend selection rule

After we pick the BANNER campaign in
[api/serve/route.ts:160-180](src/app/api/serve/route.ts#L160), if `attached=1`:

1. Fetch up to 2 `CampaignTask` where
   `campaignId = pickedCampaign.id AND surface = 'attached' AND active AND startDate/endDate within now`.
2. Filter to safe kinds (`VISIT_URL | SIGN_MESSAGE | POLL`).
3. Return them in the response. **Always serve the banner**, even when
   `effectiveSpent >= budget` — just set `bannerClickActive: false`.

---

## 3. SDK refactor

### 3.1 Folder split (no public-API break)

```
sdk/
  src/
    index.ts                # barrel re-exports unchanged
    core/
      SovAds.ts             # client, fingerprint, tracking, mountUnit
      types.ts
      tracking.ts
    units/                  # one file per existing class
      Banner.ts
      Popup.ts
      BottomBar.ts
      Sidebar.ts
      Overlay.ts
      Interstitial.ts
      NativeCard.ts
    cta/                    # NEW
      types.ts              # AttachedTask, CtaLayoutKind
      pickLayout.ts         # given attachedTasks[], pick a layout
      layouts/
        ImageWithButtons.ts # banner image + 1-2 buttons stacked or inline
        ImageWithPoll.ts    # banner image + 2-4 poll chips
        ButtonsOnly.ts      # used when slot is too small for image
        PollOnly.ts
      buttons/
        PrimaryCta.ts
        SecondaryCta.ts
        RewardBadge.ts      # "+5 pts" / "+2 G$"
      polls/
        InlinePoll.ts
      submit.ts             # POSTs to /api/tasks/complete
```

The barrel re-exports keep the public surface identical:

```ts
export { SovAds } from './core/SovAds'
export { Banner, Popup, Sidebar, BottomBar, Overlay, Interstitial, NativeCard } from './units'
export type { AdComponent, MountUnitOptions, … } from './core/types'
```

Build command stays `pnpm sdk:build` (`tsc --project ../sdk/tsconfig.json
--outDir ./src/_sovads_sdk`) — only the `rootDir` in tsconfig moves from
`.` to `./src`.

### 3.2 Opt-in flag

`Banner`, `Sidebar`, `Popup`, `BottomBar` gain an optional constructor option:

```ts
new Banner(client, slotId, {
  placementId: 'banner',
  size: '728x90',
  attached: true,              // ← NEW, default false
  onCtaComplete?: (e: CtaEvent) => void,
})
```

Inside the constructor, when `attached: true` the unit passes `attached=1` to
`/api/serve` and routes its render through `cta/pickLayout.ts` instead of the
plain banner code path.

Existing callers (no `attached` flag) keep today's render exactly.

### 3.3 `pickLayout` decision table

| Slot context | `attachedTasks[]` | Layout |
|---|---|---|
| Any | empty | plain banner (today) |
| 1 task: POLL | `[POLL]` | `ImageWithPoll` |
| 1 task: VISIT_URL or SIGN_MESSAGE | `[task]` | `ImageWithButtons` (1 primary) |
| 2 tasks, both non-POLL | `[t1, t2]` | `ImageWithButtons` (primary + secondary) |
| 1 POLL + 1 button task | `[POLL, btn]` | `ImageWithPoll` + small button below |
| Slot height < 100px | any | `ButtonsOnly` / `PollOnly` |
| `bannerClickActive: false` AND any tasks | any | same picks above, but main image is non-clickable |

### 3.4 Submission logic — hybrid (recommendation)

The SDK auto-submits the simple kinds (no host code needed), and emits events
for the wallet-signing kinds so the host can wire its own wallet.

| Kind | Behaviour |
|---|---|
| `POLL` | Tap option → SDK POSTs `/api/tasks/complete` with `{ optionId }` → swap chip area with "Thanks! +N points" inline. |
| `VISIT_URL` | Tap button → open `task.config.url` in new tab + start dwell timer + after `minDwellMs` (default 3s) POST `/api/tasks/complete` with `{ url, dwellMs }`. |
| `SIGN_MESSAGE` | Tap button → emit `onCtaComplete({ type: 'NEED_SIGNATURE', task })`. Host signs with its wallet and calls `banner.submitCtaProof(taskId, { signature, message })`. |

`onCtaComplete` also fires `{ type: 'SUBMITTED', task, awarded }` after a
successful POST so the host can refresh balances.

### 3.5 Reward badge

Every CTA renders a small `RewardBadge` next to the label:
- `rewardPoints > 0 && rewardGs > 0` → `"+5 pts · +2 G$"`
- `rewardPoints > 0` only → `"+5 pts"`
- `rewardGs > 0` only → `"+2 G$"`
- both zero → no badge

When the parent campaign's `bannerClickActive` is false AND `rewardGs > 0`,
swap "+2 G$" for "+2 pts" (the fallback rate) and append a tiny `*` tooltip
explaining the swap. Same constant we already settled on: 1 SovPoint = 1 G$.

---

## 4. Step-by-step delivery (3 PRs)

### PR 1 — Plumbing (no UI change)
1. Add `attached=1` query handling to [api/serve/route.ts](src/app/api/serve/route.ts);
   return `attachedTasks` and `bannerClickActive` only when set.
2. Refactor `/api/serve` to also serve when `effectiveSpent >= budget` if
   attached tasks exist; surface `bannerClickActive: false`.
3. Unit test for serve route covering: no flag (legacy), flag with 0 tasks,
   flag with 1 POLL, flag with budget-exhausted parent.

### PR 2 — SDK folder split
4. Move classes into `sdk/src/units/*.ts` and `sdk/src/core/*.ts`.
5. Update `sdk/tsconfig.json` `rootDir` and `frontend/package.json` `sdk:build`
   script accordingly.
6. Verify `pnpm sdk:build` still emits a shape compatible with
   `frontend/src/_sovads_sdk/index.js`.
7. Smoke test: load `sdk-demo.html` and `BannerAd` in `AdSlots.tsx`.

### PR 3 — Attached CTA rendering
8. Add `cta/` folder with `types`, `pickLayout`, `submit`, three button/poll
   primitives, and the four layouts.
9. Add `attached` and `onCtaComplete` options to `Banner`, `Sidebar`, `Popup`,
   `BottomBar`. Wire through to `pickLayout`.
10. Update `AdSlots.tsx` to expose `attached` and a default `onCtaComplete` that
    refreshes the viewer's points balance.
11. Update `sdk-demo.html`, `llm.txt`, `docs/page.tsx`, and
    `PublisherDashboard.tsx` snippet to show the new option.
12. Bump SDK version (currently `1.0.9` per `tsconfig.tsbuildinfo`) to `1.1.0`.

---

## 5. Risks & open questions

| Risk | Mitigation |
|---|---|
| Adding buttons inside the banner element changes IntersectionObserver math (impression tracking) | Wrap image in its own `data-ad-id` element and let the observer keep watching that, not the whole CTA cluster. |
| Two CTA buttons on a 320×50 mobile banner won't fit | `pickLayout` checks `container.clientWidth` and falls back to `ButtonsOnly` (stacked) below 360px. |
| Submitting POLL from the SDK without a wallet | Backend already accepts wallet-less viewers (fingerprint only). POLL pays only points, never G$, so no signing needed. |
| Double-submission on rapid taps | Disable button + show spinner on tap; `submit.ts` ignores second call while one is in flight. |
| Auto-refresh (`refreshInterval`) wiping a half-completed poll | Pause auto-refresh while a CTA submission is in flight; resume after `awarded` arrives. |

### Open questions for product
- Min/max CTAs per attached banner? Current plan: cap at 2 buttons + 1 poll.
- Should `bannerClickActive: false` hide the click cursor on the image, or
  keep the cursor and just suppress CLICK tracking? (Plan: hide the cursor.)
- Where does the publisher opt into `attached: true`? Site-level setting in the
  publisher dashboard, or per-slot in their integration code? (Plan: per-slot;
  publisher dashboard gets a "default attached?" checkbox in PR 4.)
