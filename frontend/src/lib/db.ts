// Re-export Prisma client - all routes should import { prisma } from '@/lib/prisma'
// This file is kept for backward compatibility during migration
export { prisma as db } from './prisma'
export { prisma } from './prisma'

// Legacy MongoDB collection types are in models.ts
export type { Advertiser, Publisher, PublisherSite, Campaign, Event, AnalyticsHash, Asset, Payout, Topup, Exchange, Withdrawal, SdkRequest, SdkInteraction, ApiRouteCall, CallbackLog, ViewerPoints, ViewerReward, PricingConfig } from './models'

