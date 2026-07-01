// One-shot: create the SovAds project on Karma GAP via the v2 agent endpoint.
// Run with: node scripts/karma-create-project.mjs
// The API key is read from KARMA_API_KEY (preferred) or falls back to the inline default.

const API = 'https://gapapi.karmahq.xyz/v2/agent/execute';
const KEY = process.env.KARMA_API_KEY || 'karma_ti2w8K3bUI9B9UVmRJWNJURZWX9aVxJ7';

const payload = {
  action: 'createProject',
  params: {
    // Celo Mainnet — matches where SovAdsStreaming / SovAdsManager are deployed
    chainId: 42220,

    title: 'SovAds',

    description:
      'SovAds is a decentralized advertising protocol on Celo. Advertisers fund campaigns in G$ (GoodDollar); publishers embed an SDK and earn a real-time G$ stream per verified impression via Superfluid; viewers earn SovPoints (redeemable 1:1 for G$) for watching and clicking ads. Every campaign budget splits transparently on-chain: 10% instant admin fee, 10% admin stream, 60% publisher pool, 20% staker pool — all routed through Superfluid Distribution Pools and a UUPS-upgradeable contract. GoodDollar-verified users also claim a ~5000 G$ engagement bonus every 180 days. Live at https://ads.sovseas.xyz.',

    imageURL: 'https://ads.sovseas.xyz/logo.png',

    tags: [
      'advertising',
      'adtech',
      'celo',
      'gooddollar',
      'superfluid',
      'streaming-payments',
      'depin',
      'public-goods',
      'sybil-resistance',
      'open-source',
    ],

    links: [
      { type: 'website', url: 'https://ads.sovseas.xyz' },
      { type: 'github', url: 'https://github.com/Olisehgenesis/sovads' },
      { type: 'docs', url: 'https://ads.sovseas.xyz/docs' },
    ],

    problem:
      'Digital advertising is dominated by opaque intermediaries: publishers wait 30-60+ days for payouts and never see the full numbers, advertisers are charged for bot impressions they cannot verify, and viewers — whose attention is the actual product — are paid nothing. Sybil farms and ad fraud cost the industry tens of billions per year, and there is no public, auditable settlement layer.',

    solution:
      'A fully on-chain ad protocol where (1) every campaign budget is escrowed in a UUPS-upgradeable Solidity contract on Celo, (2) publisher payouts stream in real time via Superfluid distribution pools proportional to verified impressions, (3) GoodDollar identity gates viewer rewards for sybil resistance, and (4) all impression/click events are tracked with hashed visitor IDs and reconciled against on-chain spend. Publishers integrate with a one-line `sovads-sdk` (Banner / BottomBar / Popup / Sidebar), viewers earn SovPoints redeemable 1:1 for G$, and stakers earn 20% of every campaign by securing the pool.',

    missionSummary:
      'Make advertising transparent, fair, and human — pay publishers per real impression, pay viewers for their attention, and prove every dollar on-chain.',

    locationOfImpact: 'Global',

    businessModel:
      'Protocol fee model on every campaign budget: 10% instant admin fee + 10% admin Superfluid stream over the campaign duration. The remaining 80% is split between publishers (60%) and G$ stakers (20%) via Superfluid distribution pools. No subscription, no take rate on viewer rewards.',

    stageIn: 'Live on Celo Mainnet',

    pathToTake:
      'Grow the publisher network and viewer base on the live Celo deployment, ship type-aware ad serving (POLL/FEEDBACK/SURVEY task surfaces), roll out auction-based pricing, add Merkle-root provenance for analytics events, and decentralize moderation/sybil scoring.',
  },
};

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
