#!/usr/bin/env tsx
/**
 * recover-from-chain.ts
 *
 * Recovers campaigns, advertisers, publishers, publisher_sites, and payouts
 * from BOTH SovAdsManager AND SovAdsStreaming contracts on Celo mainnet.
 *
 * ─── WHAT IS RECOVERED ────────────────────────────────────────────────────
 *  ✅ campaigns       - read directly from contract state (no event scan needed)
 *  ✅ advertisers     - one entry per unique campaign creator wallet
 *  ✅ publishers      - from PublisherSubscribed + SiteAdded events
 *  ✅ publisher_sites - domains per publisher (new API keys generated)
 *  ✅ payouts/claims  - from SovAdsManager claims[] array
 *
 * ─── WHAT IS LOST ─────────────────────────────────────────────────────────
 *  ❌ events (impressions/clicks)     – off-chain tracking only
 *  ❌ topups / exchanges / withdrawals – off-chain
 *  ❌ assets (banner images base64)   – off-chain MongoDB
 *  ❌ publisher API keys/secrets      – regenerated randomly here
 *  ❌ user profiles (name/email)      – off-chain
 *  ❌ viewer_points / viewer_rewards  – off-chain
 *
 * ─── USAGE ────────────────────────────────────────────────────────────────
 *  Values are loaded from .env automatically.
 *
 *  Dry-run (prints counts, writes nothing):
 *    DRY_RUN=1 npx tsx scripts/recover-from-chain.ts
 *
 *  Full recovery:
 *    npx tsx scripts/recover-from-chain.ts
 *
 *  Narrow event scan range (faster, provide your contract deployment block):
 *    FROM_BLOCK=30000000 npx tsx scripts/recover-from-chain.ts
 */

import { config as dotenvConfig } from 'dotenv'
import path from 'path'
dotenvConfig({ path: path.resolve(__dirname, '../.env') })

import { ethers } from 'ethers'
import { MongoClient, Db } from 'mongodb'
import crypto from 'crypto'

// ─── CONFIG ────────────────────────────────────────────────────────────────

const CELO_RPC = process.env.CELO_MAINNET_RPC_URL || 'https://celo.drpc.org'

const MANAGER_ADDRESS =
  process.env.SOVADS_MANAGER_ADDRESS || '0xcE580DfF039cA6b3516A496Bf55814Ce1d66F66a'

const STREAMING_ADDRESS =
  process.env.NEXT_PUBLIC_SOVADS_STREAMING_ADDRESS || '0xFb76103FC70702413cEa55805089106D0626823f'

const MONGODB_URI = process.env.MONGODB_URI
const MONGODB_DB = process.env.MONGODB_DB || 'sovads'
const DRY_RUN = process.env.DRY_RUN === '1'

// If not set, scan last 2 million blocks (~2 months on Celo ~1s/block).
// Set FROM_BLOCK=0 for full history, or your deployment block for speed.
const FROM_BLOCK_ENV = process.env.FROM_BLOCK ? Number(process.env.FROM_BLOCK) : null
const CHUNK_SIZE = 5000

// ─── ABIs ─────────────────────────────────────────────────────────────────

const MANAGER_ABI = [
  'function campaignCount() view returns (uint256)',
  'function claimCount() view returns (uint256)',
  `function campaigns(uint256) view returns (
    uint256 id, address creator, uint256 startTime, uint256 endTime,
    string metadata, bool active, bool paused,
    tuple(address token, uint256 totalFunded, uint256 locked, uint256 claimed) vault
  )`,
  `function claims(uint256) view returns (
    uint256 id, uint256 campaignId, address claimant, uint256 amount,
    bool processed, bool rejected, uint256 createdAt, uint256 processedAt
  )`,
  'event CampaignCreated(uint256 indexed id, address indexed creator, address indexed token, uint256 amount)',
  'event PublisherSubscribed(address indexed publisher, string[] sites)',
  'event SiteAdded(address indexed publisher, string site)',
]

const STREAMING_ABI = [
  'function campaignCount() view returns (uint256)',
  `function getCampaign(uint256 id) view returns (
    tuple(
      uint256 id, address creator, uint256 totalBudget, uint256 adminFee,
      uint256 dailyStreamBudget, uint256 publisherBudget, uint256 stakerBudget,
      uint256 startTime, uint256 endTime, string metadata, bool active,
      bool publisherFlowActive, bool adminStreamActive, bool stakerFlowActive,
      address publisherPool
    )
  )`,
  'event CampaignCreated(uint256 indexed id, address indexed creator, uint256 totalBudget, uint256 adminFee, uint256 publisherBudget, uint256 stakerBudget)',
  'event PublisherUnitsUpdated(uint256 indexed id, address indexed publisher, uint128 units)',
]

// ─── HELPERS ──────────────────────────────────────────────────────────────

const generateId = () => crypto.randomUUID()
const generateApiKey = () => crypto.randomBytes(16).toString('hex')
const generateApiSecret = () => crypto.randomBytes(32).toString('hex')
const generateSiteId = (pubId: string, i: number) => `site_${pubId}_${i}`

function parseMetadata(raw: string): Record<string, unknown> {
  try { return JSON.parse(raw) } catch { return {} }
}

async function getLogs(
  contract: ethers.Contract,
  filter: ethers.DeferredTopicFilter,
  fromBlock: number,
  toBlock: number,
): Promise<ethers.Log[]> {
  const results: ethers.Log[] = []
  let from = fromBlock
  const total = Math.max(1, toBlock - fromBlock)

  while (from <= toBlock) {
    const to = Math.min(from + CHUNK_SIZE - 1, toBlock)
    try {
      const logs = await contract.queryFilter(filter, from, to)
      results.push(...(logs as ethers.Log[]))
    } catch (err: unknown) {
      // Try smaller chunk on range/limit errors
      try {
        const smallTo = Math.min(from + 999, to)
        const logs = await contract.queryFilter(filter, from, smallTo)
        results.push(...(logs as ethers.Log[]))
        from = smallTo + 1
        continue
      } catch { /* skip this chunk */ }
    }
    const pct = Math.round(((to - fromBlock) / total) * 100)
    process.stdout.write(`    ${pct}% (block ${to.toLocaleString()})…\r`)
    from = to + 1
  }
  process.stdout.write('\n')
  return results
}

// ─── MAIN ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  SovAds Chain → MongoDB Recovery Script')
  console.log(`  SovAdsManager  : ${MANAGER_ADDRESS}`)
  console.log(`  SovAdsStreaming: ${STREAMING_ADDRESS}`)
  console.log(`  RPC            : ${CELO_RPC}`)
  console.log(`  Database       : ${MONGODB_DB}`)
  console.log(`  Dry Run        : ${DRY_RUN}`)
  console.log('═══════════════════════════════════════════════════════════\n')

  if (!MONGODB_URI) throw new Error('MONGODB_URI is not set')

  const provider = new ethers.JsonRpcProvider(CELO_RPC)
  const network = await provider.getNetwork()
  console.log(`✔ Chain: ${network.name} (chainId: ${network.chainId})`)

  const latestBlock = await provider.getBlockNumber()
  console.log(`✔ Latest block: ${latestBlock.toLocaleString()}`)

  const fromBlock = FROM_BLOCK_ENV ?? Math.max(0, latestBlock - 2_000_000)
  console.log(`✔ Event scan range: ${fromBlock.toLocaleString()} → ${latestBlock.toLocaleString()}`)
  if (!FROM_BLOCK_ENV) {
    console.log('  ℹ  Tip: Set FROM_BLOCK=<deployment_block> to scan faster.\n')
  } else {
    console.log()
  }

  const managerContract = new ethers.Contract(MANAGER_ADDRESS, MANAGER_ABI, provider)
  const streamingContract = new ethers.Contract(STREAMING_ADDRESS, STREAMING_ABI, provider)

  const mongo = new MongoClient(MONGODB_URI)
  await mongo.connect()
  const db: Db = mongo.db(MONGODB_DB)
  console.log(`✔ Connected to MongoDB: ${MONGODB_DB}\n`)

  try {
    const now = new Date()
    const walletToAdvertiserId = new Map<string, string>()
    const advertisersToUpsert: Record<string, unknown>[] = []
    const campaignsToUpsert: Record<string, unknown>[] = []
    const publisherMap = new Map<string, { publisherId: string; sites: Set<string> }>()

    const ensureAdvertiser = (wallet: string) => {
      if (!walletToAdvertiserId.has(wallet)) {
        const id = generateId()
        walletToAdvertiserId.set(wallet, id)
        advertisersToUpsert.push({ _id: id, wallet, subscriptionActive: true, totalSpent: 0, createdAt: now, updatedAt: now })
      }
      return walletToAdvertiserId.get(wallet)!
    }

    // ══════════════════════════════════════════════════════════════════
    // SECTION A: SovAdsManager (legacy contract)
    // ══════════════════════════════════════════════════════════════════
    let managerCount = 0
    let claimCount = 0
    try { managerCount = Number(await managerContract.campaignCount()) } catch { /* not available */ }
    try { claimCount = Number(await managerContract.claimCount()) } catch { /* not available */ }
    console.log(`── SovAdsManager ──────────────────────────────────────────`)
    console.log(`   campaigns: ${managerCount}  |  claims: ${claimCount}`)

    for (let i = 1; i <= managerCount; i++) {
      let raw: Awaited<ReturnType<typeof managerContract.campaigns>>
      try { raw = await managerContract.campaigns(i) } catch (e) {
        console.warn(`  ⚠ manager.campaigns(${i}): ${(e as Error).message}`); continue
      }
      const creatorWallet = (raw.creator as string).toLowerCase()
      const vault = raw.vault as { token: string; totalFunded: bigint; locked: bigint; claimed: bigint }
      const meta = parseMetadata(raw.metadata as string)
      const onChainId = Number(raw.id)
      const startTime = Number(raw.startTime)
      const endTime = Number(raw.endTime)

      campaignsToUpsert.push({
        _id: generateId(), source: 'manager',
        advertiserId: ensureAdvertiser(creatorWallet), onChainId,
        name: (meta.name as string) ?? `Manager Campaign #${onChainId}`,
        description: (meta.description as string) ?? '',
        bannerUrl: (meta.bannerUrl as string) ?? '',
        targetUrl: (meta.targetUrl as string) ?? '',
        budget: Number(ethers.formatUnits(vault.totalFunded, 18)),
        spent: Number(ethers.formatUnits(vault.claimed, 18)),
        cpc: (meta.cpc as number) ?? 0,
        active: (raw.active as boolean) && !(raw.paused as boolean),
        tokenAddress: (vault.token as string).toLowerCase(),
        mediaType: (meta.mediaType as string) ?? 'image',
        tags: Array.isArray(meta.tags) ? meta.tags : [],
        targetLocations: Array.isArray(meta.targetLocations) ? meta.targetLocations : [],
        metadata: { ...meta, vaultLocked: vault.locked.toString() },
        verificationStatus: 'approved',
        startDate: startTime > 0 ? new Date(startTime * 1000) : undefined,
        endDate: endTime > 0 ? new Date(endTime * 1000) : undefined,
        createdAt: startTime > 0 ? new Date(startTime * 1000) : now, updatedAt: now,
      })
      process.stdout.write(`   reading manager campaign ${i}/${managerCount}\r`)
    }
    if (managerCount > 0) {
      console.log()
      console.log('⬇  SovAdsManager: PublisherSubscribed events…')
      const subLogs = await getLogs(managerContract, managerContract.filters.PublisherSubscribed(), fromBlock, latestBlock)
      console.log('⬇  SovAdsManager: SiteAdded events…')
      const siteLogs = await getLogs(managerContract, managerContract.filters.SiteAdded(), fromBlock, latestBlock)

      for (const log of subLogs) {
        const p = managerContract.interface.parseLog({ topics: log.topics as string[], data: log.data })
        if (!p) continue
        const wallet = (p.args.publisher as string).toLowerCase()
        if (!publisherMap.has(wallet)) publisherMap.set(wallet, { publisherId: generateId(), sites: new Set() })
        for (const s of (p.args.sites as string[])) {
          if (s) publisherMap.get(wallet)!.sites.add(s.toLowerCase().trim())
        }
      }
      for (const log of siteLogs) {
        const p = managerContract.interface.parseLog({ topics: log.topics as string[], data: log.data })
        if (!p) continue
        const wallet = (p.args.publisher as string).toLowerCase()
        if (!publisherMap.has(wallet)) publisherMap.set(wallet, { publisherId: generateId(), sites: new Set() })
        publisherMap.get(wallet)!.sites.add((p.args.site as string).toLowerCase().trim())
      }
    }

    // Claims / payouts
    const payoutsToUpsert: Record<string, unknown>[] = []
    for (let i = 1; i <= claimCount; i++) {
      let raw: Awaited<ReturnType<typeof managerContract.claims>>
      try { raw = await managerContract.claims(i) } catch (e) {
        console.warn(`  ⚠ claims(${i}): ${(e as Error).message}`); continue
      }
      const claimantWallet = (raw.claimant as string).toLowerCase()
      const processed = raw.processed as boolean
      const rejected = raw.rejected as boolean
      const status = !processed ? 'pending' : rejected ? 'failed' : 'completed'
      const createdAtTs = Number(raw.createdAt)
      const processedAtTs = Number(raw.processedAt)
      payoutsToUpsert.push({
        _id: generateId(),
        publisherId: publisherMap.get(claimantWallet)?.publisherId ?? '',
        publisherWallet: claimantWallet,
        amount: Number(ethers.formatUnits(raw.amount as bigint, 18)),
        proof: `chain:manager:claim:${Number(raw.id)}:campaign:${Number(raw.campaignId)}`,
        date: createdAtTs > 0 ? new Date(createdAtTs * 1000).toISOString().split('T')[0] : now.toISOString().split('T')[0],
        status, txHash: '',
        createdAt: createdAtTs > 0 ? new Date(createdAtTs * 1000) : now,
        updatedAt: processedAtTs > 0 ? new Date(processedAtTs * 1000) : now,
      })
      process.stdout.write(`   reading claim ${i}/${claimCount}\r`)
    }
    if (claimCount > 0) console.log()

    // ══════════════════════════════════════════════════════════════════
    // SECTION B: SovAdsStreaming (current contract)
    // ══════════════════════════════════════════════════════════════════
    const streamingCount = Number(await streamingContract.campaignCount())
    console.log(`\n── SovAdsStreaming ─────────────────────────────────────────`)
    console.log(`   campaigns: ${streamingCount}`)

    for (let i = 1; i <= streamingCount; i++) {
      let raw: Awaited<ReturnType<typeof streamingContract.getCampaign>>
      try { raw = await streamingContract.getCampaign(i) } catch (e) {
        console.warn(`  ⚠ streaming.getCampaign(${i}): ${(e as Error).message}`); continue
      }
      const creatorWallet = (raw.creator as string).toLowerCase()
      const meta = parseMetadata(raw.metadata as string)
      const onChainId = Number(raw.id)
      const totalBudget = raw.totalBudget as bigint
      const startTime = Number(raw.startTime)
      const endTime = Number(raw.endTime)

      campaignsToUpsert.push({
        _id: generateId(), source: 'streaming',
        advertiserId: ensureAdvertiser(creatorWallet), onChainId,
        name: (meta.name as string) ?? `Streaming Campaign #${onChainId}`,
        description: (meta.description as string) ?? '',
        bannerUrl: (meta.bannerUrl as string) ?? '',
        targetUrl: (meta.targetUrl as string) ?? '',
        budget: Number(ethers.formatUnits(totalBudget, 18)),
        spent: 0, cpc: (meta.cpc as number) ?? 0,
        active: raw.active as boolean,
        tokenAddress: (process.env.NEXT_PUBLIC_GOODDOLLAR_ADDRESS ?? '').toLowerCase(),
        mediaType: (meta.mediaType as string) ?? 'image',
        tags: Array.isArray(meta.tags) ? meta.tags : [],
        targetLocations: Array.isArray(meta.targetLocations) ? meta.targetLocations : [],
        metadata: { ...meta, publisherBudget: (raw.publisherBudget as bigint).toString(), stakerBudget: (raw.stakerBudget as bigint).toString() },
        verificationStatus: 'approved',
        startDate: startTime > 0 ? new Date(startTime * 1000) : undefined,
        endDate: endTime > 0 ? new Date(endTime * 1000) : undefined,
        createdAt: startTime > 0 ? new Date(startTime * 1000) : now, updatedAt: now,
      })
      process.stdout.write(`   reading streaming campaign ${i}/${streamingCount}\r`)
    }
    if (streamingCount > 0) {
      console.log()
      console.log('⬇  SovAdsStreaming: PublisherUnitsUpdated events…')
      const unitLogs = await getLogs(streamingContract, streamingContract.filters.PublisherUnitsUpdated(), fromBlock, latestBlock)
      console.log(`   Found ${unitLogs.length} publisher activity events`)
      for (const log of unitLogs) {
        const p = streamingContract.interface.parseLog({ topics: log.topics as string[], data: log.data })
        if (!p) continue
        const wallet = (p.args.publisher as string).toLowerCase()
        if (!publisherMap.has(wallet)) publisherMap.set(wallet, { publisherId: generateId(), sites: new Set() })
      }
    }

    // ── Build publishers + publisher_sites ─────────────────────────────
    const publishersToUpsert: Record<string, unknown>[] = []
    const sitesToUpsert: Record<string, unknown>[] = []

    for (const [wallet, { publisherId, sites }] of publisherMap) {
      const domainsArr = Array.from(sites)
      publishersToUpsert.push({
        _id: publisherId, wallet,
        domain: domainsArr[0] ?? '',
        verified: true, totalEarned: 0, totalTopup: 0, totalWithdrawn: 0,
        createdAt: now, updatedAt: now,
      })
      if (domainsArr.length === 0) {
        // No known domains – create placeholder so the publisher row exists
        sitesToUpsert.push({
          _id: generateId(), publisherId,
          domain: `wallet-${wallet.slice(2, 10)}`, host: `wallet-${wallet.slice(2, 10)}`,
          pathPrefix: '/', matchType: 'PREFIX',
          siteId: generateSiteId(publisherId, 0),
          apiKey: generateApiKey(), apiSecret: generateApiSecret(),
          verified: false, createdAt: now, updatedAt: now,
        })
      } else {
        domainsArr.forEach((domain, idx) => {
          sitesToUpsert.push({
            _id: generateId(), publisherId, domain, host: domain,
            pathPrefix: '/', matchType: 'PREFIX',
            siteId: generateSiteId(publisherId, idx),
            apiKey: generateApiKey(), apiSecret: generateApiSecret(),
            verified: true, createdAt: now, updatedAt: now,
          })
        })
      }
    }

    // ── Summary ────────────────────────────────────────────────────────
    console.log('\n───────────────────────────────────────────────────────────')
    console.log('  Recovery Summary')
    console.log('───────────────────────────────────────────────────────────')
    console.log(`  advertisers    : ${advertisersToUpsert.length}`)
    console.log(`  campaigns      : ${campaignsToUpsert.length}  (manager:${managerCount} / streaming:${streamingCount})`)
    console.log(`  publishers     : ${publishersToUpsert.length}`)
    console.log(`  publisher_sites: ${sitesToUpsert.length}`)
    console.log(`  payouts        : ${payoutsToUpsert.length}`)
    console.log('───────────────────────────────────────────────────────────\n')

    if (DRY_RUN) {
      console.log('🔍 DRY RUN – nothing written. Remove DRY_RUN=1 to persist.\n')
      if (campaignsToUpsert.length > 0) {
        console.log('Sample campaign:')
        console.log(JSON.stringify(campaignsToUpsert[0], null, 2))
      }
      return
    }

    // ── Write to MongoDB ───────────────────────────────────────────────
    console.log('💾 Writing to MongoDB…')

    const upsertAll = async (colName: string, docs: Record<string, unknown>[]) => {
      if (docs.length === 0) { console.log(`  — ${colName}: nothing to insert`); return }
      const col = db.collection(colName)
      let count = 0
      for (const doc of docs) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await col.replaceOne({ _id: doc._id as any }, doc as any, { upsert: true })
        count++
      }
      console.log(`  ✔ ${colName}: ${count} upserted`)
    }

    await upsertAll('advertisers', advertisersToUpsert)
    await upsertAll('campaigns', campaignsToUpsert)
    await upsertAll('publishers', publishersToUpsert)
    await upsertAll('publisher_sites', sitesToUpsert)
    await upsertAll('payouts', payoutsToUpsert)

    console.log('\n📑 Creating indexes…')
    await db.collection('campaigns').createIndex({ advertiserId: 1 })
    await db.collection('campaigns').createIndex({ onChainId: 1, source: 1 }, { unique: true, sparse: true })
    await db.collection('publishers').createIndex({ wallet: 1 }, { unique: true })
    await db.collection('publisher_sites').createIndex({ publisherId: 1 })
    await db.collection('publisher_sites').createIndex({ host: 1, pathPrefix: 1 })
    await db.collection('publisher_sites').createIndex({ siteId: 1 }, { unique: true })
    await db.collection('advertisers').createIndex({ wallet: 1 }, { unique: true })
    await db.collection('payouts').createIndex({ publisherId: 1 })
    console.log('  ✔ Done')

    console.log('\n✅ Recovery complete!')
    console.log('⚠️  Publisher API keys were regenerated – share new keys with publishers.')
    console.log('⚠️  Events, analytics, images, topup history cannot be recovered from chain.\n')
  } finally {
    await mongo.close()
  }
}

main().catch((err) => {
  console.error('\n❌ Recovery failed:', err)
  process.exit(1)
})
