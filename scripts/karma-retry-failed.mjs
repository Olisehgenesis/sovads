// Retry the impacts + updates that failed with HTTP 500 on the first run,
// spacing each call out to give the Karma smart account time to mine the prior tx.

const API = 'https://gapapi.karmahq.xyz/v2/agent/execute';
const KEY = process.env.KARMA_API_KEY || 'karma_ti2w8K3bUI9B9UVmRJWNJURZWX9aVxJ7';
const PROJECT_UID =
  '0x1cf0f443fd6a6e7b618577664db4f7df5b472e0c29cade1351f05de61011d9f4';
const CHAIN_ID = 42220;
const REPO = 'https://github.com/Olisehgenesis/sovads';
const ts = (iso) => Math.floor(Date.parse(iso) / 1000);

const calls = [
  {
    action: 'createProjectImpact',
    label: 'Impact: GoodDollar Engagement Rewards live',
    params: {
      chainId: CHAIN_ID,
      projectUID: PROJECT_UID,
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
        `${REPO}/commit/b85a235 — anti-gaming hardening + dynamic user share (per Lewis review)`,
        `${REPO}/blob/main/ENGAGEMENT_REWARDS.md`,
      ].join('\n'),
      startedAt: ts('2026-05-08T15:00:00Z'),
      completedAt: ts('2026-06-05T06:21:41Z'),
    },
  },
  {
    action: 'createProjectImpact',
    label: 'Impact: sovads-sdk v1.3.0',
    params: {
      chainId: CHAIN_ID,
      projectUID: PROJECT_UID,
      work: [
        'Released sovads-sdk v1.3.0 with ratio-aware media rendering, hardened CTAs, and a slimmer popup chrome.',
        '- ratio-aware mountAdMedia fixes creative trimming/letterboxing on Banner/BottomBar/Popup/Sidebar',
        '- VISIT_URL dwell reworked + slim popup chrome',
        '- Hardened attached CTAs for anonymous viewers and bots',
        '- Auto-detect CTAs (drops the GoodDollar gate modal)',
        '- Earlier in the cycle: heartbeat ping (v1.1.1) so publisher dashboards know an integration is live',
      ].join('\n'),
      impact:
        'Publishers integrate ads with a single line of code and creatives render at the right aspect ratio across every surface, eliminating the most common publisher complaint. The heartbeat ping gives publishers an immediate "you are live" signal in their dashboard, cutting integration support load.',
      proof: [
        `${REPO}/commit/de475d5 — sdk: v1.3.0 ratio-aware mountAdMedia`,
        `${REPO}/commit/d1503ff — rework VISIT_URL dwell + slim popup chrome`,
        `${REPO}/commit/f1b7bb4 — harden attached CTAs for anonymous viewers + bots`,
        `${REPO}/commit/723f712 — auto-detect CTAs; drop GoodDollar gate modal`,
        `${REPO}/commit/c14cd69 — sdk 1.1.1 heartbeat ping for integration detection`,
        'npm: https://www.npmjs.com/package/sovads-sdk',
      ].join('\n'),
      startedAt: ts('2026-06-25T18:00:00Z'),
      completedAt: ts('2026-06-29T10:38:55Z'),
    },
  },
  {
    action: 'createProjectImpact',
    label: 'Impact: Hybrid identity + ad verification stack',
    params: {
      chainId: CHAIN_ID,
      projectUID: PROJECT_UID,
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
        `${REPO}/commit/ccac1c3 — hybrid identity system with anti-fraud measures`,
        `${REPO}/commit/b7fe61c — ad verification & approval system`,
        `${REPO}/commit/686c8fa — point merge logic for anonymous-to-wallet transitions`,
        `${REPO}/commit/322ecd1 — allow ghost sites to track events and earn half points`,
      ].join('\n'),
      startedAt: ts('2026-03-02T00:00:00Z'),
      completedAt: ts('2026-04-06T14:34:17Z'),
    },
  },
  {
    action: 'createProjectUpdate',
    label: 'Update: sovads-sdk v1.3.0 release',
    params: {
      chainId: CHAIN_ID,
      projectUID: PROJECT_UID,
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
        'Install: `pnpm add sovads-sdk` — https://www.npmjs.com/package/sovads-sdk',
        `Commit: ${REPO}/commit/de475d5`,
      ].join('\n'),
    },
  },
];

async function post(action, params) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': KEY },
    body: JSON.stringify({ action, params }),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, ok: res.ok, body };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SPACING_MS = 20_000; // 20s between calls to let Karma's smart account mine prior tx
const MAX_RETRIES = 3;

let ok = 0, fail = 0;
for (let i = 0; i < calls.length; i++) {
  const c = calls[i];
  if (i > 0) {
    console.log(`  (waiting ${SPACING_MS / 1000}s before next call)`);
    await sleep(SPACING_MS);
  }
  let attempt = 0, result;
  while (attempt < MAX_RETRIES) {
    attempt++;
    process.stdout.write(`[${i + 1}/${calls.length}] ${c.label} (try ${attempt}) ... `);
    result = await post(c.action, c.params);
    console.log(result.status, result.ok ? 'OK' : 'FAIL');
    if (result.ok) break;
    console.log('  ->', JSON.stringify(result.body));
    if (attempt < MAX_RETRIES) {
      console.log(`  (retry in ${SPACING_MS / 1000}s)`);
      await sleep(SPACING_MS);
    }
  }
  if (result.ok) {
    ok++;
    console.log('  ->', JSON.stringify(result.body));
  } else {
    fail++;
  }
}

console.log(`\n=== retry summary: ${ok} ok / ${fail} fail ===`);
if (fail) process.exit(1);
