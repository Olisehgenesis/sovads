# SovAds — GoodBuilders S3 Final Arc
**May 2026**

---

## Slide 1 — The Problem

**DIGITAL ADVERTISING IS BROKEN.**

**For Advertisers:**
- Pay billions to platforms — no verifiable proof of real reach
- Bots inflate metrics. Blackbox algorithms absorb budgets.
- Zero attribution to wallet or on-chain identity

**For Publishers:**
- Revenue held by middlemen. Opaque revenue share.
- Payment delays. No trust in the numbers.
- Audience monetisation requires surrendering data

**For Users:**
- Ads served. Attention harvested. Users get nothing.
- No consent. No ownership. No reward.

> **$600B/yr global ad spend. ~40% waste. Users paid $0.**

---

## Slide 2 — What is SovAds

**DECENTRALISED ADS. MONETISE YOUR AUDIENCE. GET REWARDED.**

**ADVERTISERS — Pay for Real Reach**
- On-chain verified impressions
- No bots. No black boxes.
- Full attribution to wallet

**PUBLISHERS — Monetise Your Audience**
- Revenue share per impression
- Automatic on-chain payouts
- No trust damage to audience

**USERS — Earn G$ Tokens**
- View ads → earn SovPoints
- Redeem real GoodDollar G$
- Self-custody. No friction.

---

## Slide 3 — How It Works

**THE FLYWHEEL — AD VIEW TO G$ IN WALLET**

```
ADVERTISER
  │  Deposits cUSD / G$ into SovAdsManager
  │  Sets campaign budget + CPM
  ▼
PUBLISHER SITE
  │  Embeds SDK v2 widget
  │  SDK fires Beacon API on render
  ▼
IMPRESSION VERIFIED
  │  IntersectionObserver: ≥50% viewport
  │  Fingerprinting: bot / duplicate detection
  │  Identity SDK: GoodDollar verified wallet
  ▼
ON-CHAIN SETTLEMENT
  │  SovAdsManager.payoutG$() called
  │  Publisher receives revenue share
  │  User earns SovPoints (identity-gated)
  ▼
USER REDEEMS
     SovPoints → G$ via EngagementRewards contract
     G$ lands in self-custody wallet
```

Every step is verifiable on Celo mainnet.

---

## Slide 4 — Business Model

**HOW SOVADS CAPTURES VALUE**

| Party | Pays | Receives |
|-------|------|----------|
| Advertiser | CPM in cUSD / G$ | Verified, on-chain impressions |
| Publisher | — | % of CPM per verified view |
| User | Attention | SovPoints → redeemable G$ |
| SovAds Protocol | — | Platform fee on CPM settlement |

**Fee Structure:**
- Protocol takes a % cut on each on-chain CPM settlement
- Publisher revenue share is configurable per campaign
- User reward pool funded from protocol fee allocation

**Why this works:**
- Advertisers pay only for verified impressions — better ROI than Web2
- Publishers earn without surrendering audience data
- Users are incentivised to engage, not ignore

---

## Slide 5 — Season 3 Scorecard

**BUILD MILESTONES**

| Milestone | Score | Notes |
|-----------|-------|-------|
| M1 · Engagement Rewards Integration | 100% | All 3 deliverables complete |
| M2 · Campaign Activation & UX | 100% | All 3 deliverables complete |
| M3 · Optimization & Scaling | 93% | D1/D2: 100% · D3: 80% · D4: 90% |

**GROWTH MILESTONES**

| Milestone | Score | Notes |
|-----------|-------|-------|
| M1 · Foundation & First Verified Users | 80% | A1–A3, A5: ✓ · A4 (USD flow): 0% |
| M2 · Campaign Activation & Repeat Usage | 55% | A1, A3, A7: ✓ · A2 A4 A5 A6: 0% |
| M3 · Optimization & Sustained Growth | 42% | A1: ✓ · A2: 60% · A3: 50% · A4–A6: 0% |

**Overall Season Score: ~78%**

---

## Slide 6 — What We Built

**Everything shipped, proven, and live on-chain this season.**

1. **Full G$ Redemption Loop** — SovPoints → G$ lifecycle live. 104K+ G$ redeemed on-chain. Self-custody. `payoutG$` on SovAdsManager. The loop closed.
2. **12 Live Campaigns** — 1 → 3 → 6 → 12. Consistent 2× doubling every epoch. Organic advertiser demand, zero paid acquisition.
3. **8 Publisher Sites** — Structured onboarding. Revenue share rails. Activation time cut 40%.
4. **SDK V2 + Render Verify** — Beacon API, IntersectionObserver (≥50% viewport), fingerprinting, dev mode. Impressions only counted when real.
5. **Engagement Rewards Contract** — SovAds registered on GoodDollar EngagementRewards. Identity SDK integrated. Verified users earn prioritised rewards.
6. **Token Oracle + On-Chain Audit** — Live G$, GS, cUSD, USDC pricing oracle. Cross-checked against Celo mainnet events.
7. **Public Leaderboard (+20%)** — Redemption leaderboard at `/leaderboard`. 20% growth in ranked wallets. Every rank is a verifiable on-chain tx.
8. **Backoffice + Analytics Dashboard** — Real-time G$ distribution, claims, verified interactions per campaign, publisher financial rails, admin panel.

---

## Slide 7 — Traction

**THE NUMBERS THAT MATTER**

| Metric | S3 Result |
|--------|-----------|
| G$ Redeemed On-Chain | **104K+** |
| GS Volume | **750K+** |
| Live Campaigns | **12** (2× every epoch) |
| Publisher Sites | **8** |
| Unique Verified Views | **300+** |
| Leaderboard Wallets (growth) | **+20%** |
| Advertiser Retention | Organic — no paid acq |
| Publisher Activation Time | **−40%** |

**Campaign growth: 1 → 3 → 6 → 12. Each epoch, doubled. No incentives. Pure demand.**

> Every number above is verifiable on Celo mainnet. No self-reported metrics.

---

## Slide 8 — Honest Gaps

**Not every target was hit. Here's the honest breakdown.**

- **0% · $USD Flow Targets Missed** — M1: $5k–10k · M2: $15k–25k · M3: $40k–60k+ all at 0%. GS volume hit 750K+ but USD conversion not tracked. Infrastructure took priority.
  → Need explicit USD tracking layer.

- **0% · Weekly Active G$ Earners** — Targets: 60–120 (M2), 150–250 (M3). Redemption launched late. Repeat weekly engagement not yet measured or gamified.
  → Retention mechanic exists. Epoch 6: weekly active earner tracking + referral loops.

- **~50% · Publisher Count Below Target** — Target: 8–12. Reality: 8. Manual onboarding was the bottleneck, not demand.
  → Structured flow cuts activation time — scale in Epoch 6.

- **0% · 15–25 SovSeas Projects as Publishers** — Feature 80% built but not activated across projects.
  → Rails exist. Distribution/activation problem, not a build problem.

- **20% · 8–15 Active SovSeas Projects (M2)** — Internal adoption lagged. No dedicated activation push.
  → Low-hanging fruit for Epoch 6.

- **Not Met · 250–400 Unique Verified Wallets (M3)** — Unique views hit 300+ but identity verification friction reduces view → verified earn conversion.
  → Top UX priority: reduce steps from first view to first G$ claim.

---

## Slide 9 — Epoch 6 Roadmap

**WHAT'S NEXT — AND WHEN**

| Priority | Target | Epoch 6 Timeline |
|----------|--------|-----------------|
| USD tracking layer | Track & report $USD flow end-to-end | Week 1–2 |
| Weekly earner loop | Measure + gamify weekly active earners | Week 2–3 |
| Publisher scale | 12+ sites via structured self-serve onboarding | Week 3–4 |
| SovSeas activation | Activate 15+ internal projects as publishers | Week 2–4 |
| Referral mechanic | Referrals tied to leaderboard + G$ bonus | Week 3–5 |
| Verified wallet UX | Reduce steps: first view → first G$ claim | Week 1–3 |
| Advertiser broadening | Onboard non-web3 advertisers with ROAS tracking | Week 4–6 |

**North Star for Epoch 6:**
> 250+ weekly active G$ earners. $10k+ USD flow tracked. 20 campaigns live.

---

## Slide 10 — The Ask & The Team

**WHAT WE'RE ASKING FOR**

- **Season 4 / Epoch 6 Grant Continuation** — Infrastructure is production-ready. The gap is distribution, retention mechanics, and USD tracking. Not another build season — a growth season.
- **GoodDollar Ecosystem Distribution** — SovAds is a native G$ sink. Every ad view drives verified G$ demand. Support surfacing SovAds to GoodDollar's existing user base.
- **SovSeas Project Activation** — A coordinated push to onboard SovSeas projects as publishers would close the largest single gap in one epoch.

---

**THE TEAM**

Built by the SovAds core team as part of the GoodBuilders Season 3 programme.
Deployed on Celo mainnet. Open source. Verifiable on-chain.

- Smart contracts: Celo mainnet (`SovAdsManager`, `SovAdsStreaming`)
- Frontend: Next.js 14, Prisma, WalletConnect AppKit
- SDK: Embeddable JS widget with render verification
- Oracle: Live token pricing, cross-validated against on-chain events

> **The loop from ad view to G$ in wallet is proven and live.
> We're asking for the support to scale it.**
