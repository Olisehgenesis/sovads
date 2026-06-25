/**
 * Shared advertiser types. Mirror the JSON shape returned by the existing REST
 * API — no domain logic lives here.
 */

export interface Campaign {
  id: string
  name: string
  description: string
  bannerUrl: string
  targetUrl: string
  budget: number
  /** @deprecated Use `clickSpent` for the click-cost-only number, or
   *  `totalSpent` for the combined click + CTA spend. Kept for backward
   *  compat — currently equals `clickSpent`. */
  spent: number
  /** Sum of CPC charged across all CLICK events. Mirrors `Campaign.spent`. */
  clickSpent?: number
  /** Sum of G$ paid out across all CampaignTask completions for this campaign. */
  ctaSpent?: number
  /** clickSpent + ctaSpent — the real total outflow against `budget`. */
  totalSpent?: number
  cpc: number
  active: boolean
  paused?: boolean
  tokenAddress?: string
  onChainId?: number | null
  mediaType?: 'image' | 'video'
  tags?: string[]
  targetLocations?: string[]
  startDate?: string | null
  endDate?: string | null
  status?: 'draft' | 'review' | 'approved' | 'rejected' | 'paused'
  verificationStatus?: 'pending' | 'approved' | 'rejected'
  /** Free-form metadata blob carried from `/api/campaigns/list`.
   *  Known keys: `popupDurationSecs` (advertiser-set popup auto-close timeout). */
  metadata?: Record<string, unknown> | null
}

/** Back-compat alias for code paths that still reference the old v2 name. */
export type CampaignV2 = Campaign

export interface CampaignAnalytics {
  impressions: number
  clicks: number
  ctr: number
  totalRevenue: number
}

export interface DailyEntry {
  date: string
  impressions: number
  clicks: number
  revenue: number
}

export interface GlobalAdvertiserStats {
  totalImpressions: number
  totalClicks: number
  avgCtr: number
  totalSpent: number
  activeCampaigns: number
}

// CTA / Task ───────────────────────────────────────────────────────────────

export const CTA_KINDS = [
  'VISIT_URL',
  'SOCIAL_FOLLOW',
  'QUIZ',
  'STAKE_GS',
  'CONTRACT_CALL',
  'SIGN_MESSAGE',
] as const
export type CtaKind = typeof CTA_KINDS[number]

export const CTA_VERIFIERS = [
  'ORACLE',
  'SELF_SIGNED',
  'STAKE_PROOF',
  'ONCHAIN_EVENT',
  'WEBHOOK',
  'AI_PLAN',
] as const
export type CtaVerifier = typeof CTA_VERIFIERS[number]

export const DEFAULT_VERIFIER: Record<CtaKind, CtaVerifier> = {
  VISIT_URL: 'ORACLE',
  SOCIAL_FOLLOW: 'ORACLE',
  QUIZ: 'ORACLE',
  STAKE_GS: 'STAKE_PROOF',
  CONTRACT_CALL: 'ONCHAIN_EVENT',
  SIGN_MESSAGE: 'SELF_SIGNED',
}

export interface CampaignTask {
  id: string
  kind: CtaKind | string
  label: string
  description?: string | null
  verifier: CtaVerifier | string
  rewardPoints?: number | null
  rewardGs?: number | null
  budgetGs?: number | null
  maxPerWallet?: number | null
  cooldownSecs?: number | null
  startDate?: string | null
  endDate?: string | null
  config?: Record<string, unknown> | null
  verificationPlan?: unknown
}

// Ad placements / sizes ───────────────────────────────────────────────────

export type AdPlacement = 'banner' | 'sidebar' | 'popup'

export interface AdSizeOption {
  id: string
  label: string
  size: string
  placement: AdPlacement
  blurb: string
}

export const AD_SIZE_CATALOG: AdSizeOption[] = [
  { id: 'banner-728x90', label: 'Leaderboard', size: '728x90', placement: 'banner', blurb: 'Classic top-of-page banner.' },
  { id: 'banner-970x250', label: 'Billboard', size: '970x250', placement: 'banner', blurb: 'Large above-the-fold banner.' },
  { id: 'banner-320x50', label: 'Mobile banner', size: '320x50', placement: 'banner', blurb: 'Mobile-friendly sticky strip.' },
  { id: 'sidebar-300x250', label: 'Medium rectangle', size: '300x250', placement: 'sidebar', blurb: 'In-content / sidebar standard.' },
  { id: 'sidebar-300x600', label: 'Half page', size: '300x600', placement: 'sidebar', blurb: 'Tall sidebar unit.' },
  { id: 'popup-360x120', label: 'Pop-in', size: '360x120', placement: 'popup', blurb: 'Dismissible overlay.' },
]
