# Engagement Rewards Integration

GoodDollar protocol rewards (~5000 G$) claimable once per 180-day period by GD-verified users.

---

## Conditions to Claim

All of the following must be true for a user to successfully claim:

| # | Condition | Where checked | UI shown when failing |
|---|-----------|---------------|----------------------|
| 1 | **Wallet connected** | wagmi `isConnected` | "Connect Wallet" button |
| 2 | **Viewed at least one ad** | `points.totalPoints > 0` (SovPoints earned from ad impressions) | "👁 View ads first to earn SovPoints before claiming" |
| 3 | **Redeemed SovPoints for G$ at least once** | `totalRedeemed > 0` (from on-chain cashout history) | "↔ Redeem SovPoints for G$ at least once before claiming" |
| 4 | **GoodDollar identity verified** | `getWhitelistedRoot(address) != 0x0` on Identity contract (direct chain read, no wallet needed) | "Verify with GoodDollar" button → redirects to `goodid.gooddollar.org` |
| 5 | **App approved by GoodLabs** | `sdk.canClaim(APP_ADDRESS, user)` → checks on-chain registration | "⏸ Reward currently unavailable — app approval pending or period limit reached" |
| 6 | **Not in 180-day cooldown** | Our DB (`EngagementRewardClaim` table, `status=success`) + `sdk.canClaim()` | "⏳ Cooldown: N days remaining" |
| 7 | **Not 4th-app period limit** | `sdk.canClaim()` — protocol limits rewards if user already claimed from 3 other apps this period | Same "⏸ unavailable" message as #5 |
| 8 | **Valid block window** | `validUntilBlock = currentBlock + 600` — signature expires in ~10 min | Contract reverts if submitted too late |

### How conditions map to code

```ts
// src/hooks/useEngagementRewards.ts → refreshEligibility()
if (!whitelisted)          → ineligibilityReason = 'not_whitelisted'  // condition 4
else if (!eligible) {
  if (data.lastClaim)      → ineligibilityReason = 'cooldown'         // condition 6
  else                     → ineligibilityReason = 'app_limit'        // condition 5 or 7
}
else                       → ineligibilityReason = null

// src/app/rewards/page.tsx
const hasViewedAds = points.totalPoints > 0       // condition 2
const hasRedeemed  = totalRedeemed > 0            // condition 3
```

### UI decision tree

```
isConnected?
  NO  → button "Connect Wallet"
  YES →
    effectiveWhitelisted === true?
      NO  → show "Verify with GoodDollar" button          (condition 4)
      YES →
        ineligibilityReason === 'not_whitelisted'? → "⚠ Need GD verification"
        ineligibilityReason === 'cooldown'?        → "⏳ Cooldown: N days"   (condition 6)
        ineligibilityReason === 'app_limit'?       → "⏸ Unavailable"         (condition 5/7)
        !hasViewedAds?                             → "👁 View ads first"      (condition 2)
        !hasRedeemed?                              → "↔ Redeem points first"  (condition 3)
        null + all prereqs met?                    → "✓ Verified & ready" + Claim button ✅
```

`effectiveWhitelisted` prefers a direct on-chain read done in `rewards/page.tsx` over the hook's value, to handle the case where the SDK hasn't initialised yet but the user IS verified.

---

## Contracts (Celo Mainnet)

| Name | Address |
|------|---------|
| EngagementRewards | `0x25db74CF4E7BA120526fd87e159CF656d94bAE43` |
| App / Signer | `0x8aE67ce409dA16e71Cda5f71465e563Fe2060b92` |
| GoodDollar Identity | `0xC361A6E67822a0EDc17D899227dd9FC50BD62F42` |

Env vars:
```
NEXT_PUBLIC_ENGAGEMENT_REWARDS_CONTRACT=0x25db74CF4E7BA120526fd87e159CF656d94bAE43
NEXT_PUBLIC_ENGAGEMENT_REWARDS_APP_ADDRESS=0x8aE67ce409dA16e71Cda5f71465e563Fe2060b92
ENGAGEMENT_REWARDS_APP_PRIVATE_KEY=0x...   # never expose client-side
```

---

## Architecture

```
User browser                 Next.js backend              Celo chain
─────────────                ────────────────             ──────────
useEngagementRewards hook    /api/engagement-rewards/     EngagementRewards contract
  └─ sdk.canClaim()            sign-claim/route.ts          nonContractAppClaim()
  └─ sdk.signClaim()  ──────►  signs EIP-712 AppClaim  ──► receipt
  └─ sdk.nonContractAppClaim()   claim/route.ts
                                 GET  — cooldown check
                                 PATCH — record tx result
```

---

## Files

| File | Role |
|------|------|
| [`src/hooks/useEngagementRewards.ts`](src/hooks/useEngagementRewards.ts) | React hook — eligibility, claim, GD verification flow |
| [`src/app/api/engagement-rewards/sign-claim/route.ts`](src/app/api/engagement-rewards/sign-claim/route.ts) | Backend — EIP-712 app signature |
| [`src/app/api/engagement-rewards/claim/route.ts`](src/app/api/engagement-rewards/claim/route.ts) | Backend — claim audit log (GET cooldown, PATCH result) |
| [`src/app/rewards/page.tsx`](src/app/rewards/page.tsx) | UI — Engagement Reward card |
| [`prisma/schema.prisma`](prisma/schema.prisma#L311) | DB model `EngagementRewardClaim` |

---

## Claim Flow (step by step)

### 1. Eligibility check — hook init
`src/hooks/useEngagementRewards.ts`

```ts
// Uses a static viem client (no wallet needed) for whitelist check
const root = await celoPublicClient.readContract({
  address: IDENTITY_ADDRESS,         // 0xC361A6...
  abi: identityAbi,
  functionName: 'getWhitelistedRoot',
  args: [address],
})
const whitelisted = root !== zeroAddress

// SDK checks on-chain: is app approved, has user already claimed, etc.
const eligible = await sdk.canClaim(APP_ADDRESS, address).catch(() => false)
```

Possible `ineligibilityReason` values:
| Value | Meaning |
|-------|---------|
| `not_whitelisted` | User has no GoodDollar identity |
| `cooldown` | Prior successful claim within 180 days (from our DB) |
| `app_limit` | App pending GoodLabs approval **or** 4th-app period limit |

### 2. User triggers claim — `claimBonus(inviterAddress)`
`src/hooks/useEngagementRewards.ts` → `claimBonus()`

```ts
// a) Re-check before spending gas
const eligible = await sdk.canClaim(APP_ADDRESS, address).catch(() => false)
if (!eligible) throw new Error('Not eligible to claim at this time')

// b) Compute valid window (600 blocks ≈ 10 min on Celo)
const validUntilBlock = await sdk.getCurrentBlockNumber() + 600n

// c) User wallet signs the claim
const userSignature = await sdk.signClaim(APP_ADDRESS, inviterAddress, validUntilBlock)

// d) Backend signs as the app
const { signature: appSignature } = await fetch('/api/engagement-rewards/sign-claim', {
  method: 'POST',
  body: JSON.stringify({ user: address, validUntilBlock: validUntilBlock.toString(), inviter })
}).then(r => r.json())

// e) Submit on-chain
const receipt = await sdk.nonContractAppClaim(
  APP_ADDRESS, inviterAddress, validUntilBlock, userSignature, appSignature
)
```

### 3. Backend app signature
`src/app/api/engagement-rewards/sign-claim/route.ts`

EIP-712 typed data structure:
```ts
domain: {
  name: 'EngagementRewards',
  version: '1.0',
  chainId: 42220,                              // Celo mainnet
  verifyingContract: REWARDS_CONTRACT,
}
types: {
  AppClaim: [
    { name: 'app',            type: 'address' },
    { name: 'user',           type: 'address' },
    { name: 'validUntilBlock', type: 'uint256' },
  ]
}
```

Rate limited: max **5 sign requests per wallet per hour** (checked against `EngagementRewardClaim` in Postgres).

### 4. Audit log
`src/app/api/engagement-rewards/claim/route.ts`

- `POST` — called by `sign-claim` to create a `pending` record  
- `GET ?wallet=0x...` — returns last successful claim date → used to compute cooldown  
- `PATCH` — called after on-chain submission with `{ status: 'success' | 'failed', txHash }`

Prisma model (`prisma/schema.prisma`):
```prisma
model EngagementRewardClaim {
  id           String   @id @default(uuid())
  wallet       String
  inviter      String?
  txHash       String?
  rewardAmount Float?
  status       String   @default("pending") // pending | success | failed
  error        String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  @@map("engagement_reward_claims")
}
```

---

## Reward Receiver & Distribution

Registered in the GoodDollar contract:
- **Receiver**: `0x8aE67ce409dA16e71Cda5f71465e563Fe2060b92` (app wallet)
- **User+Inviter share**: 50% of reward
- **User share** (of that 50%): 25%

Inviter address is passed at claim time from `?ref=<address>` URL param (sessionStorage cached).  
If no ref present, defaults to the app wallet `0x8aE6...0b92` to avoid dead-address loss.

---

## GoodDollar Identity Verification

Users without a GD identity see a "Verify with GoodDollar" button.  
`verifyOnGoodDollar()` in the hook:

1. Signs two wallet messages (FV login + FV identifier) via wagmi `signMessage`
2. Compresses them with `lz-string`
3. Redirects to `https://goodid.gooddollar.org?lz=<compressed>`

This matches the GoodWeb3-Mono `ClaimSDK.getFVLink` flow.

---

## Current Status & Known Issues

| Item | Status |
|------|--------|
| App registered on prod contract | ✅ |
| App approved by GoodLabs | ⏳ Pending — contact `hello@gooddollar.org` |
| Claim flow code | ✅ |
| Cooldown DB tracking | ✅ |
| GD identity verification redirect | ✅ |

**Until GoodLabs approves the app**, `sdk.canClaim()` returns `false` with reason `app_limit`.  
The UI shows `"⏸ Reward currently unavailable — app approval pending or period limit reached"` and disables the claim button.  
No code change is needed once approval goes through — the button will enable automatically.

---

## Adding a New Claim Environment (dev)

To test the full claim flow without waiting for GoodLabs:

1. Change both env vars to the dev contract (anyone can self-approve):
   ```
   ENGAGEMENT_REWARDS_CONTRACT=0xb44fC3A592aDaA257AECe1Ae8956019EA53d0465
   NEXT_PUBLIC_ENGAGEMENT_REWARDS_CONTRACT=0xb44fC3A592aDaA257AECe1Ae8956019EA53d0465
   ```
2. Go to https://engagement-rewards-dev.vercel.app → Apply → self-approve
3. Test full claim flow
4. Revert to prod contract before deploying
