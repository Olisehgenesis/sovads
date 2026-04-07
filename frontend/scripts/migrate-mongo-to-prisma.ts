#!/usr/bin/env tsx
/**
 * migrate-mongo-to-prisma.ts
 *
 * One-shot migration: reads every collection from MongoDB and upserts
 * the records into PostgreSQL (Neon) via Prisma.
 *
 * ─── USAGE ────────────────────────────────────────────────────────────────
 *  Dry-run (counts only, writes nothing):
 *    DRY_RUN=1 npx tsx scripts/migrate-mongo-to-prisma.ts
 *
 *  Full migration:
 *    npx tsx scripts/migrate-mongo-to-prisma.ts
 *
 *  Migrate only specific collections (comma-separated):
 *    COLLECTIONS=advertisers,publishers npx tsx scripts/migrate-mongo-to-prisma.ts
 *
 * ─── ENV VARS REQUIRED ────────────────────────────────────────────────────
 *  MONGODB_URI        - MongoDB Atlas connection string
 *  MONGODB_DB         - MongoDB database name (default: sovads)
 *  DATABASE_URL       - Neon / PostgreSQL connection string (Prisma pooled)
 *  DATABASE_URL_UNPOOLED - Neon direct URL (for Prisma migrations)
 *
 * ─── NOTES ────────────────────────────────────────────────────────────────
 *  - MongoDB _id strings are reused as Prisma id strings (UUID mapping kept)
 *  - Foreign key integrity is enforced: parent records are migrated first
 *  - Orphaned child records (missing parent) are skipped with a warning
 *  - Records already in Postgres are SKIPPED (upsert by id → safe to re-run)
 *  - BATCH_SIZE env var controls insert batch size (default: 200)
 */

import { config as dotenvConfig } from 'dotenv'
import * as path from 'path'
dotenvConfig({ path: path.resolve(__dirname, '../.env') })
dotenvConfig({ path: path.resolve(__dirname, '../.env.local') })

import { MongoClient, Db } from 'mongodb'
import { PrismaClient } from '@prisma/client'

// ─── CONFIG ────────────────────────────────────────────────────────────────

const MONGODB_URI = process.env.MONGODB_URI
const MONGODB_DB = process.env.MONGODB_DB || 'sovads'
const DRY_RUN = process.env.DRY_RUN === '1'
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '200', 10)
const ONLY_COLLECTIONS = process.env.COLLECTIONS
  ? process.env.COLLECTIONS.split(',').map(s => s.trim())
  : null

if (!MONGODB_URI) {
  console.error('❌  MONGODB_URI environment variable is not set')
  process.exit(1)
}

// ─── HELPERS ──────────────────────────────────────────────────────────────

const prisma = new PrismaClient()

function log(msg: string) {
  console.log(new Date().toISOString().slice(11, 19), msg)
}

function warn(msg: string) {
  console.warn('⚠️ ', msg)
}

async function getCollection(
  db: Db,
  name: string
): Promise<Record<string, unknown>[]> {
  const docs = await db.collection(name).find({}).toArray()
  return docs as unknown as Record<string, unknown>[]
}

/** Upsert records in batches; returns [inserted, skipped] counts */
async function batchUpsert<T>(
  label: string,
  records: T[],
  upsertFn: (record: T) => Promise<void>
): Promise<[number, number]> {
  let inserted = 0
  let skipped = 0

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE)

    await Promise.allSettled(
      batch.map(async record => {
        try {
          if (!DRY_RUN) await upsertFn(record)
          inserted++
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          // P2002 = unique constraint (record already exists)
          if (msg.includes('P2002') || msg.includes('Unique constraint')) {
            skipped++
          } else {
            warn(`[${label}] skipped record due to error: ${msg}`)
            skipped++
          }
        }
      })
    )

    if (records.length > BATCH_SIZE) {
      log(`  ${label}: ${Math.min(i + BATCH_SIZE, records.length)}/${records.length}`)
    }
  }

  return [inserted, skipped]
}

function toDate(val: unknown): Date {
  if (!val) return new Date()
  if (val instanceof Date) return val
  return new Date(val as string | number)
}

function shouldMigrate(collection: string): boolean {
  if (!ONLY_COLLECTIONS) return true
  return ONLY_COLLECTIONS.includes(collection)
}

// ─── COLLECTION MIGRATORS ─────────────────────────────────────────────────

async function migrateAdvertisers(db: Db) {
  if (!shouldMigrate('advertisers')) return
  const docs = await getCollection(db, 'advertisers')
  log(`advertisers: ${docs.length} documents`)

  const [ins, skip] = await batchUpsert('advertisers', docs, async doc => {
    await prisma.advertiser.upsert({
      where: { id: String(doc._id) },
      create: {
        id: String(doc._id),
        wallet: String(doc.wallet),
        name: doc.name ? String(doc.name) : null,
        email: doc.email ? String(doc.email) : null,
        company: doc.company ? String(doc.company) : null,
        subscriptionPlan: doc.subscriptionPlan ? String(doc.subscriptionPlan) : null,
        subscriptionActive: Boolean(doc.subscriptionActive ?? false),
        subscriptionDate: doc.subscriptionDate ? toDate(doc.subscriptionDate) : null,
        totalSpent: Number(doc.totalSpent ?? 0),
        createdAt: toDate(doc.createdAt),
        updatedAt: toDate(doc.updatedAt),
      },
      update: {},
    })
  })
  log(`  ✅ advertisers: ${ins} inserted, ${skip} skipped`)
}

async function migratePublishers(db: Db) {
  if (!shouldMigrate('publishers')) return
  const docs = await getCollection(db, 'publishers')
  log(`publishers: ${docs.length} documents`)

  const [ins, skip] = await batchUpsert('publishers', docs, async doc => {
    await prisma.publisher.upsert({
      where: { id: String(doc._id) },
      create: {
        id: String(doc._id),
        wallet: String(doc.wallet),
        domain: String(doc.domain ?? ''),
        verified: Boolean(doc.verified ?? false),
        totalEarned: Number(doc.totalEarned ?? 0),
        totalTopup: doc.totalTopup != null ? Number(doc.totalTopup) : null,
        totalWithdrawn: doc.totalWithdrawn != null ? Number(doc.totalWithdrawn) : null,
        createdAt: toDate(doc.createdAt),
        updatedAt: toDate(doc.updatedAt),
      },
      update: {},
    })
  })
  log(`  ✅ publishers: ${ins} inserted, ${skip} skipped`)
}

async function migratePublisherSites(db: Db) {
  if (!shouldMigrate('publisher_sites')) return
  const docs = await getCollection(db, 'publisher_sites')
  log(`publisher_sites: ${docs.length} documents`)

  // Build set of known publisher ids for orphan-check
  const knownPublishers = new Set(
    (await prisma.publisher.findMany({ select: { id: true } })).map(p => p.id)
  )

  const [ins, skip] = await batchUpsert('publisher_sites', docs, async doc => {
    const publisherId = String(doc.publisherId)
    if (!knownPublishers.has(publisherId)) {
      warn(`publisher_sites: skipping ${doc._id} – unknown publisherId ${publisherId}`)
      throw new Error('orphan')
    }
    await prisma.publisherSite.upsert({
      where: { id: String(doc._id) },
      create: {
        id: String(doc._id),
        publisherId,
        domain: String(doc.domain ?? ''),
        host: doc.host ? String(doc.host) : null,
        pathPrefix: doc.pathPrefix ? String(doc.pathPrefix) : null,
        matchType: doc.matchType ? String(doc.matchType) : null,
        siteId: String(doc.siteId ?? doc._id),
        apiKey: String(doc.apiKey ?? ''),
        apiSecret: String(doc.apiSecret ?? ''),
        verified: Boolean(doc.verified ?? false),
        createdAt: toDate(doc.createdAt),
        updatedAt: toDate(doc.updatedAt),
      },
      update: {},
    })
  })
  log(`  ✅ publisher_sites: ${ins} inserted, ${skip} skipped`)
}

async function migrateCampaigns(db: Db) {
  if (!shouldMigrate('campaigns')) return
  const docs = await getCollection(db, 'campaigns')
  log(`campaigns: ${docs.length} documents`)

  const knownAdvertisers = new Set(
    (await prisma.advertiser.findMany({ select: { id: true } })).map(a => a.id)
  )

  const [ins, skip] = await batchUpsert('campaigns', docs, async doc => {
    const advertiserId = String(doc.advertiserId)
    if (!knownAdvertisers.has(advertiserId)) {
      warn(`campaigns: skipping ${doc._id} – unknown advertiserId ${advertiserId}`)
      throw new Error('orphan')
    }
    await prisma.campaign.upsert({
      where: { id: String(doc._id) },
      create: {
        id: String(doc._id),
        advertiserId,
        name: String(doc.name ?? ''),
        description: doc.description ? String(doc.description) : null,
        bannerUrl: String(doc.bannerUrl ?? ''),
        targetUrl: String(doc.targetUrl ?? ''),
        budget: Number(doc.budget ?? 0),
        spent: Number(doc.spent ?? 0),
        cpc: Number(doc.cpc ?? 0),
        active: Boolean(doc.active ?? true),
        tokenAddress: doc.tokenAddress ? String(doc.tokenAddress) : null,
        onChainId: doc.onChainId != null ? Number(doc.onChainId) : null,
        metadataURI: doc.metadataURI ? String(doc.metadataURI) : null,
        mediaType: String(doc.mediaType ?? 'image'),
        tags: Array.isArray(doc.tags) ? doc.tags.map(String) : [],
        targetLocations: Array.isArray(doc.targetLocations) ? doc.targetLocations.map(String) : [],
        metadata: doc.metadata ? (doc.metadata as object) : undefined,
        verificationStatus: doc.verificationStatus ? String(doc.verificationStatus) : null,
        startDate: doc.startDate ? toDate(doc.startDate) : null,
        endDate: doc.endDate ? toDate(doc.endDate) : null,
        createdAt: toDate(doc.createdAt),
        updatedAt: toDate(doc.updatedAt),
      },
      update: {},
    })
  })
  log(`  ✅ campaigns: ${ins} inserted, ${skip} skipped`)
}

async function migrateEvents(db: Db) {
  if (!shouldMigrate('events')) return
  const docs = await getCollection(db, 'events')
  log(`events: ${docs.length} documents`)

  const knownCampaigns = new Set(
    (await prisma.campaign.findMany({ select: { id: true } })).map(c => c.id)
  )

  const [ins, skip] = await batchUpsert('events', docs, async doc => {
    const campaignId = String(doc.campaignId)
    if (!knownCampaigns.has(campaignId)) {
      throw new Error(`orphan-campaign:${campaignId}`)
    }
    await prisma.event.upsert({
      where: { id: String(doc._id) },
      create: {
        id: String(doc._id),
        type: String(doc.type ?? 'IMPRESSION'),
        campaignId,
        publisherId: String(doc.publisherId ?? ''),
        siteId: doc.siteId ? String(doc.siteId) : null,
        publisherSiteId: doc.publisherSiteId ? String(doc.publisherSiteId) : null,
        adId: String(doc.adId ?? ''),
        ipAddress: doc.ipAddress ? String(doc.ipAddress) : null,
        userAgent: doc.userAgent ? String(doc.userAgent) : null,
        timestamp: toDate(doc.timestamp),
        fingerprint: doc.fingerprint ? String(doc.fingerprint) : null,
        viewerWallet: doc.viewerWallet ? String(doc.viewerWallet) : null,
        verified: Boolean(doc.verified ?? false),
      },
      update: {},
    })
  })
  log(`  ✅ events: ${ins} inserted, ${skip} skipped`)
}

async function migratePayouts(db: Db) {
  if (!shouldMigrate('payouts')) return
  const docs = await getCollection(db, 'payouts')
  log(`payouts: ${docs.length} documents`)

  const knownPublishers = new Set(
    (await prisma.publisher.findMany({ select: { id: true } })).map(p => p.id)
  )

  const [ins, skip] = await batchUpsert('payouts', docs, async doc => {
    const publisherId = String(doc.publisherId)
    if (!knownPublishers.has(publisherId)) throw new Error('orphan')
    await prisma.payout.upsert({
      where: { id: String(doc._id) },
      create: {
        id: String(doc._id),
        publisherId,
        publisherWallet: String(doc.publisherWallet ?? ''),
        amount: Number(doc.amount ?? 0),
        proof: String(doc.proof ?? ''),
        date: String(doc.date ?? ''),
        status: String(doc.status ?? 'pending'),
        txHash: doc.txHash ? String(doc.txHash) : null,
        error: doc.error ? String(doc.error) : null,
        createdAt: toDate(doc.createdAt),
        updatedAt: toDate(doc.updatedAt),
      },
      update: {},
    })
  })
  log(`  ✅ payouts: ${ins} inserted, ${skip} skipped`)
}

async function migrateTopups(db: Db) {
  if (!shouldMigrate('topups')) return
  const docs = await getCollection(db, 'topups')
  log(`topups: ${docs.length} documents`)

  const knownPublishers = new Set(
    (await prisma.publisher.findMany({ select: { id: true } })).map(p => p.id)
  )

  const [ins, skip] = await batchUpsert('topups', docs, async doc => {
    const publisherId = String(doc.publisherId)
    if (!knownPublishers.has(publisherId)) throw new Error('orphan')
    await prisma.topup.upsert({
      where: { id: String(doc._id) },
      create: {
        id: String(doc._id),
        publisherId,
        wallet: String(doc.wallet ?? ''),
        amount: Number(doc.amount ?? 0),
        token: String(doc.token ?? ''),
        tokenAddress: doc.tokenAddress ? String(doc.tokenAddress) : null,
        gsReceived: doc.gsReceived != null ? Number(doc.gsReceived) : null,
        txHash: doc.txHash ? String(doc.txHash) : null,
        status: String(doc.status ?? 'pending'),
        createdAt: toDate(doc.createdAt),
        updatedAt: toDate(doc.updatedAt),
      },
      update: {},
    })
  })
  log(`  ✅ topups: ${ins} inserted, ${skip} skipped`)
}

async function migrateExchanges(db: Db) {
  if (!shouldMigrate('exchanges')) return
  const docs = await getCollection(db, 'exchanges')
  log(`exchanges: ${docs.length} documents`)

  const knownPublishers = new Set(
    (await prisma.publisher.findMany({ select: { id: true } })).map(p => p.id)
  )

  const [ins, skip] = await batchUpsert('exchanges', docs, async doc => {
    const publisherId = String(doc.publisherId)
    if (!knownPublishers.has(publisherId)) throw new Error('orphan')
    await prisma.exchange.upsert({
      where: { id: String(doc._id) },
      create: {
        id: String(doc._id),
        publisherId,
        wallet: String(doc.wallet ?? ''),
        fromToken: String(doc.fromToken ?? ''),
        fromAmount: Number(doc.fromAmount ?? 0),
        gsReceived: Number(doc.gsReceived ?? 0),
        tokenAddress: doc.tokenAddress ? String(doc.tokenAddress) : null,
        txHash: doc.txHash ? String(doc.txHash) : null,
        status: String(doc.status ?? 'pending'),
        createdAt: toDate(doc.createdAt),
        updatedAt: toDate(doc.updatedAt),
      },
      update: {},
    })
  })
  log(`  ✅ exchanges: ${ins} inserted, ${skip} skipped`)
}

async function migrateWithdrawals(db: Db) {
  if (!shouldMigrate('withdrawals')) return
  const docs = await getCollection(db, 'withdrawals')
  log(`withdrawals: ${docs.length} documents`)

  const knownPublishers = new Set(
    (await prisma.publisher.findMany({ select: { id: true } })).map(p => p.id)
  )

  const [ins, skip] = await batchUpsert('withdrawals', docs, async doc => {
    const publisherId = String(doc.publisherId)
    if (!knownPublishers.has(publisherId)) throw new Error('orphan')
    await prisma.withdrawal.upsert({
      where: { id: String(doc._id) },
      create: {
        id: String(doc._id),
        publisherId,
        wallet: String(doc.wallet ?? ''),
        amount: Number(doc.amount ?? 0),
        txHash: doc.txHash ? String(doc.txHash) : null,
        status: String(doc.status ?? 'pending'),
        createdAt: toDate(doc.createdAt),
        updatedAt: toDate(doc.updatedAt),
      },
      update: {},
    })
  })
  log(`  ✅ withdrawals: ${ins} inserted, ${skip} skipped`)
}

async function migrateViewerPoints(db: Db) {
  if (!shouldMigrate('viewer_points')) return
  const docs = await getCollection(db, 'viewer_points')
  log(`viewer_points: ${docs.length} documents`)

  const [ins, skip] = await batchUpsert('viewer_points', docs, async doc => {
    await prisma.viewerPoints.upsert({
      where: { id: String(doc._id) },
      create: {
        id: String(doc._id),
        wallet: doc.wallet ? String(doc.wallet) : null,
        fingerprint: String(doc.fingerprint ?? 'unknown'),
        totalPoints: Number(doc.totalPoints ?? 0),
        claimedPoints: Number(doc.claimedPoints ?? 0),
        pendingPoints: Number(doc.pendingPoints ?? 0),
        lastInteraction: toDate(doc.lastInteraction),
        linkedDevices: Array.isArray(doc.linkedDevices) ? doc.linkedDevices.map(String) : [],
        lastWalletChange: doc.lastWalletChange ? toDate(doc.lastWalletChange) : null,
        createdAt: toDate(doc.createdAt),
        updatedAt: toDate(doc.updatedAt),
      },
      update: {},
    })
  })
  log(`  ✅ viewer_points: ${ins} inserted, ${skip} skipped`)
}

async function migrateViewerRewards(db: Db) {
  if (!shouldMigrate('viewer_rewards')) return
  const docs = await getCollection(db, 'viewer_rewards')
  log(`viewer_rewards: ${docs.length} documents`)

  const knownViewers = new Set(
    (await prisma.viewerPoints.findMany({ select: { id: true } })).map(v => v.id)
  )

  const [ins, skip] = await batchUpsert('viewer_rewards', docs, async doc => {
    const viewerId = String(doc.viewerId)
    if (!knownViewers.has(viewerId)) throw new Error('orphan')
    await prisma.viewerReward.upsert({
      where: { id: String(doc._id) },
      create: {
        id: String(doc._id),
        viewerId,
        wallet: doc.wallet ? String(doc.wallet) : null,
        fingerprint: doc.fingerprint ? String(doc.fingerprint) : null,
        type: String(doc.type ?? 'IMPRESSION'),
        campaignId: String(doc.campaignId ?? ''),
        adId: String(doc.adId ?? ''),
        siteId: String(doc.siteId ?? ''),
        points: Number(doc.points ?? 0),
        claimed: Boolean(doc.claimed ?? false),
        claimedAt: doc.claimedAt ? toDate(doc.claimedAt) : null,
        claimTxHash: doc.claimTxHash ? String(doc.claimTxHash) : null,
        timestamp: toDate(doc.timestamp),
      },
      update: {},
    })
  })
  log(`  ✅ viewer_rewards: ${ins} inserted, ${skip} skipped`)
}

async function migrateAnalyticsHashes(db: Db) {
  if (!shouldMigrate('analytics_hashes')) return
  const docs = await getCollection(db, 'analytics_hashes')
  log(`analytics_hashes: ${docs.length} documents`)

  const [ins, skip] = await batchUpsert('analytics_hashes', docs, async doc => {
    await prisma.analyticsHash.upsert({
      where: { id: String(doc._id) },
      create: {
        id: String(doc._id),
        date: toDate(doc.date),
        hash: String(doc.hash ?? ''),
        createdAt: toDate(doc.createdAt),
      },
      update: {},
    })
  })
  log(`  ✅ analytics_hashes: ${ins} inserted, ${skip} skipped`)
}

async function migrateAssets(db: Db) {
  if (!shouldMigrate('assets')) return
  const docs = await getCollection(db, 'assets')
  log(`assets: ${docs.length} documents`)

  const [ins, skip] = await batchUpsert('assets', docs, async doc => {
    await prisma.asset.upsert({
      where: { id: String(doc._id) },
      create: {
        id: String(doc._id),
        filename: doc.filename ? String(doc.filename) : null,
        contentType: String(doc.contentType ?? 'application/octet-stream'),
        dataBase64: String(doc.dataBase64 ?? ''),
        createdAt: toDate(doc.createdAt),
      },
      update: {},
    })
  })
  log(`  ✅ assets: ${ins} inserted, ${skip} skipped`)
}

async function migratePricingConfig(db: Db) {
  if (!shouldMigrate('pricing_config')) return
  // In MongoDB the single doc uses _id = 'global'
  const docs = await getCollection(db, 'pricing_config')
  log(`pricing_config: ${docs.length} documents`)

  const [ins, skip] = await batchUpsert('pricing_config', docs, async doc => {
    await prisma.pricingConfig.upsert({
      where: { id: String(doc._id) },
      create: {
        id: String(doc._id),
        impressionUsd: Number(doc.impressionUsd ?? 0.001),
        tokenOverrides: doc.tokenOverrides ? (doc.tokenOverrides as object) : undefined,
        updatedAt: toDate(doc.updatedAt),
      },
      update: {},
    })
  })
  log(`  ✅ pricing_config: ${ins} inserted, ${skip} skipped`)
}

async function migrateSdkRequests(db: Db) {
  if (!shouldMigrate('sdk_requests')) return
  const docs = await getCollection(db, 'sdk_requests')
  log(`sdk_requests: ${docs.length} documents`)

  const [ins, skip] = await batchUpsert('sdk_requests', docs, async doc => {
    await prisma.sdkRequest.upsert({
      where: { id: String(doc._id) },
      create: {
        id: String(doc._id),
        type: String(doc.type ?? ''),
        endpoint: String(doc.endpoint ?? ''),
        method: String(doc.method ?? 'GET'),
        siteId: doc.siteId ? String(doc.siteId) : null,
        domain: doc.domain ? String(doc.domain) : null,
        pageUrl: doc.pageUrl ? String(doc.pageUrl) : null,
        userAgent: doc.userAgent ? String(doc.userAgent) : null,
        ipAddress: doc.ipAddress ? String(doc.ipAddress) : null,
        fingerprint: doc.fingerprint ? String(doc.fingerprint) : null,
        requestBody: doc.requestBody ? (doc.requestBody as object) : undefined,
        responseStatus: doc.responseStatus != null ? Number(doc.responseStatus) : null,
        responseBody: doc.responseBody ? (doc.responseBody as object) : undefined,
        error: doc.error ? String(doc.error) : null,
        duration: doc.duration != null ? Number(doc.duration) : null,
        timestamp: toDate(doc.timestamp),
      },
      update: {},
    })
  })
  log(`  ✅ sdk_requests: ${ins} inserted, ${skip} skipped`)
}

async function migrateSdkInteractions(db: Db) {
  if (!shouldMigrate('sdk_interactions')) return
  const docs = await getCollection(db, 'sdk_interactions')
  log(`sdk_interactions: ${docs.length} documents`)

  const [ins, skip] = await batchUpsert('sdk_interactions', docs, async doc => {
    await prisma.sdkInteraction.upsert({
      where: { id: String(doc._id) },
      create: {
        id: String(doc._id),
        requestId: doc.requestId ? String(doc.requestId) : null,
        type: String(doc.type ?? ''),
        adId: doc.adId ? String(doc.adId) : null,
        campaignId: doc.campaignId ? String(doc.campaignId) : null,
        siteId: doc.siteId ? String(doc.siteId) : null,
        pageUrl: doc.pageUrl ? String(doc.pageUrl) : null,
        elementType: doc.elementType ? String(doc.elementType) : null,
        metadata: doc.metadata ? (doc.metadata as object) : undefined,
        timestamp: toDate(doc.timestamp),
      },
      update: {},
    })
  })
  log(`  ✅ sdk_interactions: ${ins} inserted, ${skip} skipped`)
}

async function migrateApiRouteCalls(db: Db) {
  if (!shouldMigrate('api_route_calls')) return
  const docs = await getCollection(db, 'api_route_calls')
  log(`api_route_calls: ${docs.length} documents`)

  const [ins, skip] = await batchUpsert('api_route_calls', docs, async doc => {
    await prisma.apiRouteCall.upsert({
      where: { id: String(doc._id) },
      create: {
        id: String(doc._id),
        route: String(doc.route ?? ''),
        method: String(doc.method ?? 'GET'),
        statusCode: Number(doc.statusCode ?? 200),
        ipAddress: doc.ipAddress ? String(doc.ipAddress) : null,
        userAgent: doc.userAgent ? String(doc.userAgent) : null,
        requestBody: doc.requestBody ? (doc.requestBody as object) : undefined,
        responseBody: doc.responseBody ? (doc.responseBody as object) : undefined,
        error: doc.error ? String(doc.error) : null,
        duration: doc.duration != null ? Number(doc.duration) : null,
        timestamp: toDate(doc.timestamp),
      },
      update: {},
    })
  })
  log(`  ✅ api_route_calls: ${ins} inserted, ${skip} skipped`)
}

async function migrateCallbackLogs(db: Db) {
  if (!shouldMigrate('callback_logs')) return
  const docs = await getCollection(db, 'callback_logs')
  log(`callback_logs: ${docs.length} documents`)

  const [ins, skip] = await batchUpsert('callback_logs', docs, async doc => {
    await prisma.callbackLog.upsert({
      where: { id: String(doc._id) },
      create: {
        id: String(doc._id),
        type: String(doc.type ?? ''),
        endpoint: String(doc.endpoint ?? ''),
        payload: (doc.payload ?? {}) as object,
        ipAddress: doc.ipAddress ? String(doc.ipAddress) : null,
        userAgent: doc.userAgent ? String(doc.userAgent) : null,
        fingerprint: doc.fingerprint ? String(doc.fingerprint) : null,
        statusCode: doc.statusCode != null ? Number(doc.statusCode) : null,
        error: doc.error ? String(doc.error) : null,
        timestamp: toDate(doc.timestamp),
      },
      update: {},
    })
  })
  log(`  ✅ callback_logs: ${ins} inserted, ${skip} skipped`)
}

// ─── MAIN ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('─'.repeat(60))
  console.log('  MongoDB → Prisma (Neon) Migration')
  console.log('─'.repeat(60))

  if (DRY_RUN) {
    console.log('  🔍  DRY RUN — no data will be written to Postgres\n')
  }

  if (ONLY_COLLECTIONS) {
    console.log(`  📌  Migrating only: ${ONLY_COLLECTIONS.join(', ')}\n`)
  }

  // Connect to MongoDB
  log('Connecting to MongoDB…')
  const mongoClient = new MongoClient(MONGODB_URI!, { tls: true })
  await mongoClient.connect()
  const db = mongoClient.db(MONGODB_DB)
  log(`Connected to MongoDB database: ${MONGODB_DB}`)

  // List all collection names for reference
  const collectionInfos = await db.listCollections().toArray()
  log(`MongoDB collections available: ${collectionInfos.map(c => c.name).join(', ')}\n`)

  const start = Date.now()

  try {
    // ── Parent tables first (no foreign-key dependencies) ──────────────────
    await migrateAdvertisers(db)
    await migratePublishers(db)
    await migrateAnalyticsHashes(db)
    await migrateAssets(db)
    await migratePricingConfig(db)
    await migrateViewerPoints(db)

    // ── Log/debug tables (no FK to business data) ─────────────────────────
    await migrateSdkRequests(db)
    await migrateSdkInteractions(db)
    await migrateApiRouteCalls(db)
    await migrateCallbackLogs(db)

    // ── Child tables (depend on parents above) ────────────────────────────
    await migratePublisherSites(db)
    await migrateCampaigns(db)
    await migratePayouts(db)
    await migrateTopups(db)
    await migrateExchanges(db)
    await migrateWithdrawals(db)

    // ── Deep children ─────────────────────────────────────────────────────
    await migrateEvents(db)
    await migrateViewerRewards(db)

  } finally {
    await mongoClient.close()
    await prisma.$disconnect()
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log('\n' + '─'.repeat(60))
  console.log(`  ✅  Migration complete in ${elapsed}s`)
  if (DRY_RUN) console.log('  (dry-run: no data was written)')
  console.log('─'.repeat(60))
}

main().catch(err => {
  console.error('❌  Migration failed:', err)
  process.exit(1)
})
