export interface Advertiser {
  _id: string
  wallet: string
  name?: string
  email?: string
  company?: string
  subscriptionPlan?: string
  subscriptionActive: boolean
  subscriptionDate?: Date
  totalSpent: number
  createdAt: Date
  updatedAt: Date
}

export interface Publisher {
  _id: string
  wallet: string
  domain: string
  verified: boolean
  totalEarned: number
  totalTopup?: number
  totalWithdrawn?: number
  createdAt: Date
  updatedAt: Date
}

export interface Topup {
  _id: string
  publisherId: string
  wallet: string
  amount: number
  token: string
  tokenAddress?: string
  gsReceived?: number
  txHash?: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: Date
  updatedAt: Date
}

/** Token → G$ exchange record (cUSD, USDC, USDT, etc. → G$) */
export interface Exchange {
  _id: string
  publisherId: string
  wallet: string
  fromToken: string
  fromAmount: number
  gsReceived: number
  tokenAddress?: string
  txHash?: string
  status: 'pending' | 'completed' | 'failed'
  createdAt: Date
  updatedAt: Date
}

export interface Withdrawal {
  _id: string
  publisherId: string
  wallet: string
  amount: number
  txHash?: string
  status: 'pending' | 'completed' | 'failed'
  createdAt: Date
  updatedAt: Date
}

export interface PublisherSite {
  _id: string
  publisherId: string
  domain: string
  host?: string
  pathPrefix?: string
  matchType?: 'PREFIX'
  siteId: string
  apiKey: string
  apiSecret: string
  verified: boolean
  createdAt: Date
  updatedAt: Date
}

export interface Campaign {
  _id: string
  advertiserId: string
  name: string
  description?: string
  bannerUrl: string
  targetUrl: string
  budget: number
  spent: number
  cpc: number
  active: boolean
  tokenAddress?: string
  onChainId?: number
  metadataURI?: string
  mediaType: 'image' | 'video'
  tags: string[]
  targetLocations: string[]
  metadata?: Record<string, unknown>
  startDate?: Date
  endDate?: Date
  createdAt: Date
  updatedAt: Date
}

export interface Event {
  _id: string
  type: 'IMPRESSION' | 'CLICK'
  campaignId: string
  publisherId: string
  siteId?: string
  publisherSiteId?: string
  adId: string
  ipAddress?: string
  userAgent?: string
  timestamp: Date
  fingerprint?: string
  verified: boolean
}

export interface AnalyticsHash {
  _id: string
  date: Date
  hash: string
  createdAt: Date
}

export interface Asset {
  _id: string
  filename?: string
  contentType: string
  dataBase64: string
  createdAt: Date
}

export interface Payout {
  _id: string
  publisherId: string
  publisherWallet: string
  amount: number
  proof: string
  date: string
  status: 'pending' | 'completed' | 'failed'
  txHash?: string
  error?: string
  createdAt: Date
  updatedAt: Date
}

export interface SdkRequest {
  _id: string
  type: string
  endpoint: string
  method: string
  siteId?: string
  domain?: string
  pageUrl?: string
  userAgent?: string
  ipAddress?: string
  fingerprint?: string
  requestBody?: unknown
  responseStatus?: number
  responseBody?: unknown
  error?: string
  duration?: number
  timestamp: Date
}

export interface SdkInteraction {
  _id: string
  requestId?: string
  type: string
  adId?: string
  campaignId?: string
  siteId?: string
  pageUrl?: string
  elementType?: string
  metadata?: Record<string, unknown> | null
  timestamp: Date
}

export interface ApiRouteCall {
  _id: string
  route: string
  method: string
  statusCode: number
  ipAddress?: string
  userAgent?: string
  requestBody?: unknown
  responseBody?: unknown
  error?: string
  duration?: number
  timestamp: Date
}

export interface CallbackLog {
  _id: string
  type: string
  endpoint: string
  payload: unknown
  ipAddress?: string
  userAgent?: string
  fingerprint?: string
  statusCode?: number
  error?: string
  timestamp: Date
}

export interface ViewerPoints {
  _id: string
  wallet?: string | null // User's wallet address (null if not connected)
  fingerprint: string // Browser fingerprint for anonymous users
  totalPoints: number // Total SOV points earned
  claimedPoints: number // Points already claimed
  pendingPoints: number // Points available to claim
  lastInteraction: Date // Last time user interacted with an ad
  createdAt: Date
  updatedAt: Date
}

export interface ViewerReward {
  _id: string
  viewerId: string // Reference to ViewerPoints _id
  wallet?: string // Wallet if connected
  fingerprint?: string // Fingerprint if anonymous
  type: 'IMPRESSION' | 'CLICK' | 'ENGAGEMENT'
  campaignId: string
  adId: string
  siteId: string
  points: number // SOV points awarded
  claimed: boolean
  claimedAt?: Date
  claimTxHash?: string
  timestamp: Date
}

export interface PricingConfig {
  _id: string
  impressionUsd: number
  tokenOverrides?: Record<string, number>
  updatedAt: Date
}
