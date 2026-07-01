// Post Karma GAP impacts + updates for the SovAds project, sourced from git history.
// Run with: node scripts/karma-post-impacts-updates.mjs

const API = 'https://gapapi.karmahq.xyz/v2/agent/execute';
const KEY = process.env.KARMA_API_KEY || 'karma_ti2w8K3bUI9B9UVmRJWNJURZWX9aVxJ7';

const PROJECT_UID =
  '0x1cf0f443fd6a6e7b618577664db4f7df5b472e0c29cade1351f05de61011d9f4';
const CHAIN_ID = 42220;
const REPO = 'https://github.com/Olisehgenesis/sovads';

// Helper to convert an ISO date to Unix seconds.
const ts = (iso) => Math.floor(Date.parse(iso) / 1000);

// -------------------------- IMPACTS --------------------------
// Each impact: work (what shipped), impact (who/what it changed), proof (link), completedAt.

const impacts = [
  {
    work: [
      'Integrated Superfluid CFA + Distribution Pools into the SovAdsStreaming UUPS contract and migrated payout accounting away from batch settlement.',
      '- Added Superfluid Super-Token (G$) accounting for per-second flow rates',
      '- Wired distribution pools for publishers (60%) and stakers (20%)',
      '- Replaced manual ReentrancyGuard with ReentrancyGuardUpgradeable for proxy compatibility',
      '- Upgraded OpenZeppelin deps to keep proxy/UUPS path safe',
    ].join('\n'),
    impact:
      'Publishers and stakers now receive real-time G$ streams the moment a campaign is funded, instead of waiting 30-60 days for batch payouts. Every flow rate and pool share is verifiable on Celoscan, removing the trust-the-network-operator step that defines legacy ad payouts.',
    proof: [
      `${REPO}/commit/a659128 — Add Superfluid streaming and upgrade OpenZeppelin`,
      `${REPO}/commit/ec8603e — Use ReentrancyGuardUpgradeable; update deps`,
      `${REPO}/commit/faf8bfa — Add ReentrancyGuard util and deploy tweaks`,
      'SovAdsStreaming on Celo Mainnet: https://celoscan.io/address/0xFb76103FC70702413cEa55805089106D0626823f',
    ].join('\n'),
    startedAt: ts('2026-03-03T00:00:00Z'),
    completedAt: ts('2026-03-10T07:32:44Z'),
  },
  {
    work: [
      'Shipped the GoodDollar Engagement Rewards integration end-to-end so verified humans can claim the ~5000 G$ bonus every 180 days from the rewards page.',
      '- Server-side EIP-712 app signature at /api/engagement-rewards/sign-claim',
      '- nonContractAppClaim() flow via @goodsdks/engagement-sdk with claim audit log',
      '- GoodDollar whitelist check via getWhitelistedRoot + faucet topWallet proxy',
      '- Anti-gaming hardening (per Lewis review): dynamic user share, viewed-ads + redeemed-points gate before claim',
      '- ENGAGEMENT_REWARDS.md reference doc published at the repo root',
    ].join('\n'),
    impact:
      'Verified GoodDollar users on Celo can now convert their on-protocol engagement into a real ~5000 G$ payout every 180 days, with anti-sybil and anti-gaming gates that block app-limit abuse. Daily G$ UBI claims and gas-less onboarding via the faucet are wired into the same dashboard.',
    proof: [
      `${REPO}/commit/115f1ea — feat: GoodDollar Engagement Rewards integration`,
      `${REPO}/commit/8f2f776 — proxy faucet to GoodDollar server; fix whitelist check`,
      `${REPO}/commit/2b9222d — require viewed ads + redeemed points before engagement claim`,
      `${REPO}/commit/b85a235 — Engagement rewards: anti-gaming hardening + dynamic user share (per Lewis review)`,
      `${REPO}/blob/main/ENGAGEMENT_REWARDS.md`,
    ].join('\n'),
    startedAt: ts('2026-05-08T15:00:00Z'),
    completedAt: ts('2026-06-05T06:21:41Z'),
  },
  {
    work: [
      'Released sovads-sdk v1.3.0 with ratio-aware media rendering, hardened CTAs, and a slimmer popup chrome.',
      '- ratio-aware mountAdMedia fixes creative trimming/letterboxing on Banner/BottomBar/Popup/Sidebar',
      '- VISIT_URL dwell reworked + slim popup chrome',
      '- Hardened attached CTAs for anonymous viewers and bots',
      '- Auto-detect CTAs (drops the GoodDollar gate modal)',
      '- Earlier in the cycle: heartbeat ping (v1.1.1) so publisher dashboards know an integration is live',
    ].join('\n'),
    impact:
      'Publishers integrate ads with a single line of code and creatives render at the right aspect ratio across every surface, eliminating the most common publisher complaint (trimmed/distorted creative). The heartbeat ping gives publishers an immediate "you are live" signal in their dashboard, cutting integration support load.',
    proof: [
      `${REPO}/commit/de475d5 — sdk: v1.3.0 ratio-aware mountAdMedia`,
      `${REPO}/commit/d1503ff — fix(sdk): rework VISIT_URL dwell + slim popup chrome`,
      `${REPO}/commit/f1b7bb4 — fix(sdk): harden attached CTAs for anonymous viewers + bots`,
      `${REPO}/commit/723f712 — feat(sdk): auto-detect CTAs; drop GoodDollar gate modal`,
      `${REPO}/commit/c14cd69 — sdk: 1.1.1 heartbeat ping for integration detection`,
      'npm: https://www.npmjs.com/package/sovads-sdk',
    ].join('\n'),
    startedAt: ts('2026-06-25T18:00:00Z'),
    completedAt: ts('2026-06-29T10:38:55Z'),
  },
  {
    work: [
      'Migrated every API route from MongoDB to Prisma + PostgreSQL (Neon) and unified the data model.',
      '- All campaign / publisher / viewer / impression / claim endpoints converted',
      '- Type-safe Prisma schema with Advertiser, Campaign, Publisher, PublisherSite, Viewer, ViewerCashout, EngagementRewardClaim, Impression, AdEvent',
      '- Removed Mongo driver + cleaned up scripts',
    ].join('\n'),
    impact:
      'Strongly-typed, relational data layer with migrations under version control. Removes the silent-schema-drift bugs that plagued the early Mongo days and makes analytics queries and audit logs straightforward.',
    proof: [
      `${REPO}/commit/cb3600a — feat: migrate all API routes from MongoDB to Prisma`,
      `${REPO}/blob/main/frontend/prisma/schema.prisma`,
    ].join('\n'),
    startedAt: ts('2026-04-05T00:00:00Z'),
    completedAt: ts('2026-04-06T17:25:16Z'),
  },
  {
    work: [
      'Built the hybrid identity + ad verification stack:',
      '- Hybrid identity system with anti-fraud measures (hashed visitor IDs + wallet linking)',
      '- Ad verification & approval system gating which creatives can serve',
      '- Point merge logic so anonymous viewers keep their SovPoints when they connect a wallet',
      '- Allow "ghost" sites to track events and earn half points until verified',
    ].join('\n'),
    impact:
      'Sybil farms get a much narrower attack surface and honest viewers do not lose points the moment they sign in. The approval system gives advertisers confidence that creatives are reviewed before they appear in front of paying budget.',
    proof: [
      `${REPO}/commit/ccac1c3 — feat: implement hybrid identity system with anti-fraud measures`,
      `${REPO}/commit/b7fe61c — feat: implement ad verification & approval system`,
      `${REPO}/commit/686c8fa — feat: implement point merge logic for anonymous-to-wallet transitions`,
      `${REPO}/commit/322ecd1 — fix: allow ghost sites to track events and earn half points`,
    ].join('\n'),
    startedAt: ts('2026-03-02T00:00:00Z'),
    completedAt: ts('2026-04-06T14:34:17Z'),
  },
];

// -------------------------- UPDATES --------------------------
// Each update: short title + longer text (markdown ok).

const updates = [
  {
    title: 'sovads-sdk v1.3.0 — ratio-aware media + hardened CTAs',
    text: [
      'We shipped sovads-sdk v1.3.0 on npm.',
      '',
      '**What is new**',
      '- Ratio-aware `mountAdMedia` — no more trimmed or letterboxed creatives across Banner / BottomBar / Popup / Sidebar',
      '- Reworked VISIT_URL dwell timing + a slimmer popup chrome',
      '- Hardened attached CTAs for anonymous viewers and bots',
      '- Auto-detect CTAs (the GoodDollar gate modal is gone)',
      '- Earlier in the cycle: 1.1.1 heartbeat ping so publisher dashboards know an integration is live',
      '',
      `Install: \`pnpm add sovads-sdk\` — https://www.npmjs.com/package/sovads-sdk`,
      `Commit: ${REPO}/commit/de475d5`,
    ].join('\n'),
  },
  {
    title: 'Advertiser dashboard week: preview, activate, top-up sync',
    text: [
      'A focused week on the advertiser experience.',
      '',
      '**Shipped**',
      '- New Preview tab with deterministic campaign previews per surface',
      '- Inline Preview button on each campaign table row',
      '- "Approve" now activates the campaign + syncs top-ups + clamps used%',
      '- Admin gets an explicit "Activate" button for Inactive campaign rows',
      '- Preview CTA buttons open the target URL directly in admin (dropped the SA badge)',
      '',
      'Net effect: advertisers can see exactly what their ad will look like before they spend a single G$, and the approve / activate / top-up loop stops dropping state.',
      '',
      `Commits: ${REPO}/commit/6aad9e7, ${REPO}/commit/ccef976, ${REPO}/commit/9e12d29, ${REPO}/commit/8f10144`,
    ].join('\n'),
  },
  {
    title: 'GoodDollar Engagement Rewards are live (with anti-gaming gates)',
    text: [
      'The full GoodDollar Engagement Rewards flow is live on https://ads.sovseas.xyz/rewards.',
      '',
      '**How it works**',
      '1. Verified GoodDollar users see their eligibility (Face Verification + whitelist via `getWhitelistedRoot`).',
      '2. Server signs an EIP-712 app approval at `/api/engagement-rewards/sign-claim`.',
      '3. Frontend calls `nonContractAppClaim()` via `@goodsdks/engagement-sdk`.',
      '4. Bonus (~5000 G$) lands on-chain; cooldown is enforced for 180 days.',
      '',
      '**Anti-gaming hardening (per Lewis review)**',
      '- Dynamic user share',
      '- Must have viewed ads + redeemed SovPoints at least once before the first claim',
      '- App-limit handling surfaces a clear "pending approval" message instead of a silent failure',
      '',
      `Reference doc: ${REPO}/blob/main/ENGAGEMENT_REWARDS.md`,
      `Key commits: ${REPO}/commit/115f1ea, ${REPO}/commit/b85a235, ${REPO}/commit/2b9222d`,
    ].join('\n'),
  },
  {
    title: 'SovPoints → G$ redemption + daily UBI claim',
    text: [
      'Viewers can now turn engagement directly into spendable G$.',
      '',
      '- 1 SovPoint per verified impression, 5 per click',
      '- Redeem 1:1 for G$ (min 10 pts) via `/rewards`',
      '- Daily G$ UBI claim card on the same page — uses `checkEntitlement(root)` + `claim()` on the GoodDollar UBI contract',
      '- Gas-less onboarding via the GoodDollar faucet proxy at `/api/topWallet`',
      '',
      `Redemption commit: ${REPO}/commit/1122ca4`,
      `UBI + faucet commits: ${REPO}/commit/949c58a, ${REPO}/commit/8f2f776`,
    ].join('\n'),
  },
];

// -------------------------- POSTING --------------------------

async function post(action, params) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': KEY },
    body: JSON.stringify({ action, params }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, ok: res.ok, body };
}

const results = { impacts: [], updates: [] };

for (let i = 0; i < impacts.length; i++) {
  const label = impacts[i].work.split('\n')[0].slice(0, 80);
  process.stdout.write(`[impact ${i + 1}/${impacts.length}] ${label} ... `);
  const r = await post('createProjectImpact', {
    chainId: CHAIN_ID,
    projectUID: PROJECT_UID,
    ...impacts[i],
  });
  console.log(r.status, r.ok ? 'OK' : 'FAIL');
  console.log('  ->', JSON.stringify(r.body));
  results.impacts.push(r);
}

for (let i = 0; i < updates.length; i++) {
  process.stdout.write(`[update ${i + 1}/${updates.length}] ${updates[i].title} ... `);
  const r = await post('createProjectUpdate', {
    chainId: CHAIN_ID,
    projectUID: PROJECT_UID,
    title: updates[i].title,
    text: updates[i].text,
  });
  console.log(r.status, r.ok ? 'OK' : 'FAIL');
  console.log('  ->', JSON.stringify(r.body));
  results.updates.push(r);
}

const failures =
  results.impacts.filter((r) => !r.ok).length +
  results.updates.filter((r) => !r.ok).length;

console.log('\n=== summary ===');
console.log(`impacts ok: ${results.impacts.filter((r) => r.ok).length}/${impacts.length}`);
console.log(`updates ok: ${results.updates.filter((r) => r.ok).length}/${updates.length}`);
if (failures) process.exit(1);
