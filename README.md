# SovAds — Decentralized Ad Protocol on Celo

A transparent, on-chain advertising protocol. Publishers earn G$ per real impression. Viewers earn SovPoints redeemable for G$. Advertisers get verifiable reach — no bots, no black boxes.

Live: **https://ads.sovseas.xyz**

---

## Monorepo Structure

```
sovads/
├── frontend/          # Next.js 16 app (UI + API routes + DB)
├── contracts/         # Solidity smart contracts (Hardhat)
├── sdk/               # Publisher JS/TS SDK (npm: sovads-sdk)
├── ENGAGEMENT_REWARDS.md  # GoodDollar engagement rewards integration
└── BEACON_TRACKING_IMPLEMENTATION.md
```

---

## How It Works

```
Advertiser creates campaign → funds with G$ (Celo)
        │
        ▼
SovAdsStreaming contract (UUPS upgradeable)
  ├─ 10% instant admin fee
  ├─ 10% admin stream (Superfluid)
  ├─ 60% publisher rewards pool (Superfluid Distribution Pool)
  └─ 20% staker rewards pool (Superfluid Distribution Pool)
        │
        ▼
Publishers embed SDK → serve ads → earn proportional G$ stream
        │
        ▼
Viewers watch ads → earn SovPoints (off-chain) → redeem 1:1 for G$
        │
        ▼
GoodDollar-verified viewers → claim bonus ~5000 G$ every 180 days
```

---

## Smart Contracts (Celo Mainnet)

| Contract | Address | Purpose |
|----------|---------|---------|
| `SovAdsStreaming` | `0xFb76103FC70702413cEa55805089106D0626823f` | Main campaign + streaming + staking |
| `SovAdsManager` | `0xcE580DfF039cA6b3516A496Bf55814Ce1d66F66a` | Legacy campaign/publisher management |
| GoodDollar (G$) | `0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A` | SuperToken (Superfluid) |
| GoodDollar Identity | `0xC361A6E67822a0EDc17D899227dd9FC50BD62F42` | Sybil-resistance / whitelist |
| GoodDollar UBI | `0x43d72Ff17701B2DA814620735C39C620Ce0ea4A1` | Daily UBI claim |
| EngagementRewards | `0x25db74CF4E7BA120526fd87e159CF656d94bAE43` | ~5000 G$ bonus per user per 180 days |

### SovAdsStreaming — Fee Model

```
Campaign budget (G$)
  ├─ 10%  → admin wallet (instant)
  ├─ 10%  → admin stream (Superfluid over campaign duration)
  ├─ 60%  → publisher pool (proportional to impressions/units)
  └─ 20%  → staker pool   (proportional to G$ staked × time modifier)
```

Built with **Superfluid** money streaming + distribution pools, **OpenZeppelin UUPS** upgradeable proxy, and **ReentrancyGuard**.

---

## Frontend (`frontend/`)

**Stack**: Next.js 16 · TypeScript · Tailwind CSS v4 · wagmi v2 · viem v2 · Reown AppKit · Prisma · PostgreSQL (Neon)

### Pages

| Route | Description |
|-------|-------------|
| `/` | Landing / viewer ad feed |
| `/rewards` | Viewer rewards — SovPoints, G$ redemption, engagement claim |
| `/advertiser` | Advertiser dashboard — create/manage campaigns |
| `/publisher` | Publisher dashboard — register sites, view earnings |
| `/staking` | Stake G$ for streaming rewards |
| `/leaderboard` | Top earners |
| `/analytics` | Protocol-wide analytics |
| `/admin` | Admin panel (wallet-gated) |
| `/docs` | Integration docs |

### Key API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/ads` | GET | Serve ad for a site (`?siteId=`) |
| `/api/track` | POST | Track impression / click |
| `/api/viewers` | GET/POST | Viewer SovPoints balance |
| `/api/engagement-rewards/sign-claim` | POST | EIP-712 app signature for engagement claim |
| `/api/engagement-rewards/claim` | GET/PATCH | Cooldown check + claim audit log |
| `/api/topWallet` | POST | Proxy to GoodDollar gas faucet |
| `/api/campaigns` | GET/POST | Campaign CRUD |
| `/api/publishers` | GET/POST | Publisher registration |
| `/api/claims` | GET/POST | Publisher payout claims |
| `/api/analytics` | GET | Campaign / publisher analytics |
| `/api/stats` | GET | Protocol totals |

### Key Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useEngagementRewards` | `src/hooks/useEngagementRewards.ts` | GD eligibility, claim flow, FV redirect |
| `useStreamingAds` | `src/hooks/useStreamingAds.ts` | Superfluid stream status |
| `useAds` | `src/hooks/useAds.ts` | Ad fetch + impression tracking |
| `useRefParam` | `src/hooks/useRefParam.ts` | `?ref=` invite link param (sessionStorage cached) |

### Database (Prisma / PostgreSQL)

Key models in `frontend/prisma/schema.prisma`:

| Model | Purpose |
|-------|---------|
| `Advertiser` | Advertiser profile + campaigns |
| `Campaign` | Ad campaign metadata |
| `Publisher` + `PublisherSite` | Publisher registration + sites |
| `Viewer` | Viewer SovPoints balance |
| `ViewerCashout` | SovPoints → G$ redemption requests |
| `EngagementRewardClaim` | 180-day bonus claim audit log |
| `Impression` / `AdEvent` | Tracked ad events |

---

## SDK (`sdk/`)

Published as **`sovads-sdk`** on npm.

```bash
pnpm add sovads-sdk
```

```typescript
import { SovAds, Banner, Popup, BottomBar, Sidebar } from 'sovads-sdk'

const sovads = new SovAds({
  apiUrl: 'https://ads.sovseas.xyz',  // optional
  siteId: 'site_xxx',                  // from publisher dashboard
  debug: false,
})

// Banner ad in a div
const banner = new Banner(sovads, 'banner-container')
await banner.render()

// Floating bottom bar (auto-closes)
const bar = new BottomBar(sovads)
await bar.show()

// Popup after delay
const popup = new Popup(sovads)
await popup.show()
```

CSS classes for custom styling: `.sovads-banner` · `.sovads-sidebar` · `.sovads-popup-overlay` · `.sovads-bottom-bar`

---

## Viewer Rewards Flow

1. **View ads** → earn 1 SovPoint per verified impression (tracked off-chain via API)
2. **Click ads** → earn 5 SovPoints per click
3. **Redeem** → swap SovPoints 1:1 for G$ on Celo (min 10 pts)
4. **Daily G$ UBI** → GoodDollar-verified users can claim daily UBI via `checkEntitlement` on the UBI contract
5. **Engagement Reward** → ~5000 G$ bonus claimable once per 180 days (requires GD identity + viewed ads + redeemed once)

See [ENGAGEMENT_REWARDS.md](ENGAGEMENT_REWARDS.md) for full integration details.

---

## GoodDollar Integration

| Feature | Contract / Endpoint |
|---------|-------------------|
| Sybil-resistance check | `getWhitelistedRoot(address)` on Identity contract |
| Daily UBI | `checkEntitlement(root)` + `claim()` on UBI contract |
| Gas faucet | `POST /api/topWallet` → proxies `goodserver.gooddollar.org/verify/topWallet` |
| Face verification | Redirect to `https://goodid.gooddollar.org?lz=<lz-string compressed payload>` |
| Engagement bonus | `nonContractAppClaim()` on EngagementRewards contract via `@goodsdks/engagement-sdk` |

---

## Local Development

### Prerequisites
- Node.js 20+
- pnpm
- PostgreSQL (or Neon account)

### Setup

```bash
# 1. Clone
git clone https://github.com/Olisehgenesis/sovads.git
cd sovads

# 2. Frontend
cd frontend
pnpm install
cp env.example .env   # fill in values
pnpm prisma migrate dev
pnpm dev              # http://localhost:3000

# 3. Contracts (separate terminal)
cd contracts
pnpm install
cp env.example .env
npx hardhat compile
npx hardhat test
```

### Required env vars (frontend)

```env
# Database
DATABASE_URL="postgresql://..."
DATABASE_URL_UNPOOLED="postgresql://..."

# Blockchain
NEXT_PUBLIC_CELO_MAINNET_RPC_URL="https://rpc.ankr.com/celo"
NEXT_PUBLIC_SOVADS_STREAMING_ADDRESS="0xFb76103FC70702413cEa55805089106D0626823f"
NEXT_PUBLIC_GOODDOLLAR_ADDRESS="0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A"
NEXT_PUBLIC_GOODDOLLAR_IDENTITY_ADDRESS="0xC361A6E67822a0EDc17D899227dd9FC50BD62F42"
NEXT_PUBLIC_GOODDOLLAR_UBI_ADDRESS="0x43d72Ff17701B2DA814620735C39C620Ce0ea4A1"

# Engagement Rewards
NEXT_PUBLIC_ENGAGEMENT_REWARDS_CONTRACT="0x25db74CF4E7BA120526fd87e159CF656d94bAE43"
NEXT_PUBLIC_ENGAGEMENT_REWARDS_APP_ADDRESS="0x8aE67ce409dA16e71Cda5f71465e563Fe2060b92"
ENGAGEMENT_REWARDS_APP_PRIVATE_KEY="0x..."   # never expose client-side

# Wallet Connect
NEXT_PUBLIC_PROJECT_ID="..."

# Operator
SOVADS_OPERATOR_PRIVATE_KEY="0x..."
```

---

## Contracts — Deploy & Test

```bash
cd contracts

# Run tests
npx hardhat test

# Deploy streaming contract (Celo mainnet)
npx hardhat run scripts/deploy-streaming.ts --network celo

# Verify
npx hardhat run scripts/verify.ts --network celo
```

---

## Admin Wallets

| Wallet | Role |
|--------|------|
| `0x53eaF4CD171842d8144e45211308e5D90B4b0088` | Primary admin |
| `0x8aE67ce409dA16e71Cda5f71465e563Fe2060b92` | Engagement rewards app signer |
| `0xf7dbD2867f55832E4A05E16Cd69cB57A70923cDD` | Rewards receiver |

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16, TypeScript, Tailwind CSS v4 |
| Wallet | wagmi v2, viem v2, Reown AppKit |
| Chain | Celo mainnet (chainId 42220) |
| Streaming | Superfluid Finance (G$ SuperToken) |
| Identity | GoodDollar Identity + FV |
| Database | PostgreSQL via Neon (Prisma ORM) |
| Contracts | Solidity 0.8.28, Hardhat, OpenZeppelin UUPS |
| SDK | Vanilla TS, published to npm |
| Hosting | Vercel |

---

## License

MIT
