import { Collection } from 'mongodb'
import { getCollection } from './mongo'
import type {
  Advertiser,
  Publisher,
  PublisherSite,
  Campaign,
  Event,
  AnalyticsHash,
  Asset,
  Payout,
  Topup,
  Exchange,
  Withdrawal,
  SdkRequest,
  SdkInteraction,
  ApiRouteCall,
  CallbackLog,
  ViewerPoints,
  ViewerReward,
  PricingConfig,
} from './models'

export const collections = {
  advertisers: () => getCollection<Advertiser>('advertisers'),
  publishers: () => getCollection<Publisher>('publishers'),
  publisherSites: () => getCollection<PublisherSite>('publisher_sites'),
  campaigns: () => getCollection<Campaign>('campaigns'),
  events: () => getCollection<Event>('events'),
  analyticsHashes: () => getCollection<AnalyticsHash>('analytics_hashes'),
  assets: () => getCollection<Asset>('assets'),
  payouts: () => getCollection<Payout>('payouts'),
  topups: () => getCollection<Topup>('topups'),
  exchanges: () => getCollection<Exchange>('exchanges'),
  withdrawals: () => getCollection<Withdrawal>('withdrawals'),
  sdkRequests: () => getCollection<SdkRequest>('sdk_requests'),
  sdkInteractions: () => getCollection<SdkInteraction>('sdk_interactions'),
  apiRouteCalls: () => getCollection<ApiRouteCall>('api_route_calls'),
  callbackLogs: () => getCollection<CallbackLog>('callback_logs'),
  viewerPoints: () => getCollection<ViewerPoints>('viewer_points'),
  viewerRewards: () => getCollection<ViewerReward>('viewer_rewards'),
  pricingConfig: () => getCollection<PricingConfig>('pricing_config'),
}

export type Collections = typeof collections

export type { Advertiser, Publisher, PublisherSite, Campaign, Event, AnalyticsHash, Asset, Payout, Topup, Exchange, Withdrawal, SdkRequest, SdkInteraction, ApiRouteCall, CallbackLog, ViewerPoints, ViewerReward, PricingConfig }
