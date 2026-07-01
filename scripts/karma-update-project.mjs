// One-shot: enrich the SovAds Karma GAP project with all supported fields.
// Run with: node scripts/karma-update-project.mjs
// API key is read from KARMA_API_KEY, falling back to the inline default.

const API = 'https://gapapi.karmahq.xyz/v2/agent/execute';
const KEY = process.env.KARMA_API_KEY || 'karma_ti2w8K3bUI9B9UVmRJWNJURZWX9aVxJ7';

// Project created earlier this session.
const PROJECT_UID =
  '0x1cf0f443fd6a6e7b618577664db4f7df5b472e0c29cade1351f05de61011d9f4';
const CHAIN_ID = 42220; // Celo Mainnet

const description = [
  'SovAds is a fully on-chain advertising protocol on Celo. Advertisers fund campaigns in G$ (GoodDollar); publishers embed a one-line SDK (sovads-sdk) and earn a real-time G$ stream proportional to verified impressions via Superfluid Distribution Pools; viewers earn SovPoints (redeemable 1:1 for G$) for watching and clicking ads.',
  '',
  'Every campaign budget splits transparently on-chain through a UUPS-upgradeable Solidity contract:',
  '• 10% instant admin fee',
  '• 10% admin Superfluid stream over the campaign duration',
  '• 60% publisher rewards pool (proportional to impressions/units)',
  '• 20% staker rewards pool (proportional to G$ staked × time modifier)',
  '',
  'Sybil resistance is enforced by GoodDollar Identity. Verified humans also claim a ~5000 G$ engagement bonus every 180 days via EngagementRewards (signed EIP-712 app approval + nonContractAppClaim). Daily G$ UBI claims are wired into the viewer dashboard, and gas-less onboarding is proxied through the GoodDollar faucet.',
  '',
  'Smart contracts (Celo Mainnet):',
  '• SovAdsStreaming 0xFb76103FC70702413cEa55805089106D0626823f — campaigns + streaming + staking',
  '• SovAdsManager   0xcE580DfF039cA6b3516A496Bf55814Ce1d66F66a — legacy management',
  '• GoodDollar (G$) 0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A',
  '• GD Identity     0xC361A6E67822a0EDc17D899227dd9FC50BD62F42',
  '• GD UBI          0x43d72Ff17701B2DA814620735C39C620Ce0ea4A1',
  '• EngagementRewards 0x25db74CF4E7BA120526fd87e159CF656d94bAE43',
  '',
  'Live at https://ads.sovseas.xyz. Open-source: https://github.com/Olisehgenesis/sovads.',
].join('\n');

const params = {
  chainId: CHAIN_ID,
  projectUID: PROJECT_UID,

  title: 'SovAds',

  description,

  imageURL: 'https://ads.sovseas.xyz/logo.png',

  links: [
    { type: 'website', url: 'https://ads.sovseas.xyz' },
    { type: 'docs', url: 'https://ads.sovseas.xyz/docs' },
    { type: 'github', url: 'https://github.com/Olisehgenesis/sovads' },
    { type: 'npm', url: 'https://www.npmjs.com/package/sovads-sdk' },
    { type: 'contract', url: 'https://celoscan.io/address/0xFb76103FC70702413cEa55805089106D0626823f' },
    { type: 'contract', url: 'https://celoscan.io/address/0xcE580DfF039cA6b3516A496Bf55814Ce1d66F66a' },
  ],

  tags: [
    'advertising',
    'adtech',
    'celo',
    'gooddollar',
    'superfluid',
    'streaming-payments',
    'distribution-pools',
    'depin',
    'public-goods',
    'sybil-resistance',
    'ubi',
    'regen',
    'open-source',
    'web3',
    'attention-economy',
  ],

  problem:
    'Digital advertising is dominated by opaque intermediaries. Publishers wait 30-60+ days for payouts and never see the full numbers. Advertisers are charged for bot impressions they cannot verify — ad fraud costs the industry tens of billions per year. Viewers, whose attention is the actual product, are paid nothing. There is no public, auditable settlement layer for the $700B+ ad market, and no native way to share value with the humans who actually watch.',

  solution:
    'A fully on-chain ad protocol where (1) every campaign budget is escrowed in a UUPS-upgradeable Solidity contract on Celo, (2) publisher payouts stream in real time via Superfluid Distribution Pools proportional to verified impressions, (3) GoodDollar identity gates viewer rewards and engagement claims for sybil resistance, (4) all impression/click events are tracked with hashed visitor IDs and reconciled against on-chain spend, and (5) stakers secure the network by locking G$ and earning 20% of every campaign. Publishers integrate with a one-line `sovads-sdk` (Banner / BottomBar / Popup / Sidebar). Viewers earn SovPoints redeemable 1:1 for G$, plus a ~5000 G$ engagement bonus every 180 days.',

  missionSummary:
    'Make advertising transparent, fair, and human — pay publishers per real impression, pay viewers for their attention, and prove every dollar on-chain.',

  locationOfImpact:
    'Global — protocol is permissionless on Celo Mainnet. Early adoption is strongest in regions with active GoodDollar UBI claimers (West Africa, Latin America, Southeast Asia).',

  businessModel:
    'Protocol fee on every funded campaign: 10% instant admin fee + 10% admin Superfluid stream over the campaign duration. The remaining 80% is split between publishers (60%) and G$ stakers (20%) via Superfluid Distribution Pools. No subscription, no take rate on viewer rewards, no per-impression markup. All splits enforced in the SovAdsStreaming contract.',

  stageIn:
    'Live on Celo Mainnet. Contracts deployed, frontend live at https://ads.sovseas.xyz, sovads-sdk published on npm, onboarded early advertisers and publishers, viewer rewards and engagement-bonus claims fully operational.',

  raisedMoney:
    'Bootstrapped. Seeking ecosystem grants (Celo, GoodDollar, Superfluid, public-goods funders) and pilot advertisers.',

  pathToTake:
    'Near-term: grow publisher network via the sovads-sdk, ship task-aware ad surfaces (POLL / FEEDBACK / SURVEY), add Merkle-root provenance for analytics events, and roll out auction-based pricing. Mid-term: decentralize moderation and sybil scoring, open staking to a broader pool, integrate additional identity providers, and expand to other GoodDollar-supported chains. Long-term: become the default open settlement layer for human-verified attention across web3.',
};

const payload = { action: 'updateProjectDetails', params };

const res = await fetch(API, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-api-key': KEY,
  },
  body: JSON.stringify(payload),
});

const text = await res.text();
let body;
try {
  body = JSON.parse(text);
} catch {
  body = text;
}

console.log('HTTP', res.status, res.statusText);
console.log(JSON.stringify(body, null, 2));

if (!res.ok) process.exit(1);
