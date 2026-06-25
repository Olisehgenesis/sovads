export interface PublisherStats {
  impressions: number
  clicks: number
  ctr: number
  totalRevenue: number
}

export interface DailyStatEntry {
  date: string
  impressions: number
  clicks: number
  revenue: number
}

export interface PublisherSite {
  id: string
  domain: string
  siteId: string
  apiKey?: string
  apiSecret?: string
  verified: boolean
  createdAt: string
}

export interface ExchangeHistoryEntry {
  fromToken: string
  fromAmount: number
  gsReceived: number
  txHash?: string
  createdAt: string
}

export interface CampaignVaultSummary {
  token: string
  totalFunded: bigint | string | number
  locked: bigint | string | number
  claimed: bigint | string | number
}

export type PublisherSectionId =
  | 'dashboard'
  | 'analytics'
  | 'websites'
  | 'integration'
  | 'earnings'
  | 'rewards'
  | 'settings'
