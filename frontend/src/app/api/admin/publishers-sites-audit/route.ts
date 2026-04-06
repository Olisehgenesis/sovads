import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { SOVADS_MANAGER_ADDRESS } from '@/lib/chain-config'
import { sovAdsManagerAbi } from '@/contract/abi'
import { createPublicClient, http, parseAbiItem } from 'viem'
import { celo } from 'viem/chains'

const siteAddedEvent = parseAbiItem('event SiteAdded(address indexed publisher, string site)')
const publisherSubscribedEvent = parseAbiItem('event PublisherSubscribed(address indexed publisher, string[] sites)')

function normalizeDomain(input: string): string {
  const value = input.trim().toLowerCase()
  if (!value) return value
  return value.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')
}

function isAddress(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value)
}

type OnChainLookup = {
  publisherByWallet: Map<string, boolean>
  siteWalletsByDomain: Map<string, Set<string>>
  error?: string
}

async function buildOnChainLookup(wallets: string[]): Promise<OnChainLookup> {
  const rpc = process.env.CELO_MAINNET_RPC_URL || 'https://rpc.ankr.com/celo'
  const client = createPublicClient({ chain: celo, transport: http(rpc) })
  const publisherByWallet = new Map<string, boolean>()
  const siteWalletsByDomain = new Map<string, Set<string>>()

  try {
    const fromBlock = process.env.SOVADS_DEPLOY_BLOCK
      ? BigInt(process.env.SOVADS_DEPLOY_BLOCK)
      : BigInt(0)

    const [siteAddedLogs, subscribedLogs] = await Promise.all([
      client.getLogs({
        address: SOVADS_MANAGER_ADDRESS as `0x${string}`,
        event: siteAddedEvent,
        fromBlock,
      }),
      client.getLogs({
        address: SOVADS_MANAGER_ADDRESS as `0x${string}`,
        event: publisherSubscribedEvent,
        fromBlock,
      }),
    ])

    for (const log of siteAddedLogs) {
      const publisher = String(log.args.publisher || '').toLowerCase()
      const site = normalizeDomain(String(log.args.site || ''))
      if (!publisher || !site) continue
      const set = siteWalletsByDomain.get(site) || new Set<string>()
      set.add(publisher)
      siteWalletsByDomain.set(site, set)
    }

    for (const log of subscribedLogs) {
      const publisher = String(log.args.publisher || '').toLowerCase()
      const sites = Array.isArray(log.args.sites) ? log.args.sites : []
      for (const siteRaw of sites) {
        const site = normalizeDomain(String(siteRaw || ''))
        if (!publisher || !site) continue
        const set = siteWalletsByDomain.get(site) || new Set<string>()
        set.add(publisher)
        siteWalletsByDomain.set(site, set)
      }
    }

    const checks = wallets
      .filter((wallet) => isAddress(wallet))
      .map(async (wallet) => {
        try {
          const isPublisher = await client.readContract({
            address: SOVADS_MANAGER_ADDRESS as `0x${string}`,
            abi: sovAdsManagerAbi as any,
            functionName: 'isPublisher',
            args: [wallet],
          })
          publisherByWallet.set(wallet.toLowerCase(), Boolean(isPublisher))
        } catch {
          publisherByWallet.set(wallet.toLowerCase(), false)
        }
      })
    await Promise.all(checks)

    return { publisherByWallet, siteWalletsByDomain }
  } catch (error) {
    return {
      publisherByWallet,
      siteWalletsByDomain,
      error: error instanceof Error ? error.message : 'onchain lookup failed',
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const domainFilter = searchParams.get('domain')?.trim().toLowerCase()
    const includeUnverified = searchParams.get('includeUnverified') === 'true'

    const [publishers, sites] = await Promise.all([
      prisma.publisher.findMany(),
      prisma.publisherSite.findMany(),
    ])

    const wallets = publishers
      .map((publisher) => String(publisher.wallet || '').toLowerCase())
      .filter(Boolean)
    const onChain = await buildOnChainLookup(wallets)

    const publisherById = new Map(
      publishers.map((p) => [p.id, p] as const)
    )

    const domainOwners = new Map<string, Set<string>>()
    for (const site of sites) {
      const normalized = normalizeDomain(site.domain)
      if (!normalized) continue
      const owners = domainOwners.get(normalized) || new Set<string>()
      owners.add(site.publisherId)
      domainOwners.set(normalized, owners)
    }

    const entries = sites
      .map((site) => {
        const publisher = publisherById.get(site.publisherId)
        const normalizedDomain = normalizeDomain(site.domain)
        const wallet = String(publisher?.wallet || '').toLowerCase()
        const onChainWallets = Array.from(onChain.siteWalletsByDomain.get(normalizedDomain) || [])
        const duplicateOwners = Array.from(domainOwners.get(normalizedDomain) || [])

        return {
          siteId: site.siteId,
          siteRecordId: site.id,
          domain: site.domain,
          normalizedDomain,
          verifiedInDb: Boolean(site.verified),
          publisherId: site.publisherId,
          publisherWallet: publisher?.wallet || null,
          publisherVerifiedInDb: Boolean(publisher?.verified),
          officialPublisher: Boolean(publisher?.verified) && onChain.publisherByWallet.get(wallet) === true,
          onChainPublisher: wallet ? onChain.publisherByWallet.get(wallet) ?? null : null,
          onChainSiteRegistered: onChainWallets.length > 0,
          onChainSiteWallets: onChainWallets,
          onChainPublisherMatchesSite:
            wallet && onChainWallets.length > 0 ? onChainWallets.includes(wallet) : null,
          duplicateInDb: duplicateOwners.length > 1,
          duplicatePublisherIds: duplicateOwners,
        }
      })
      .filter((entry) => {
        if (!includeUnverified && !entry.verifiedInDb) return false
        if (!domainFilter) return true
        return (
          entry.domain.toLowerCase().includes(domainFilter) ||
          entry.normalizedDomain.includes(domainFilter)
        )
      })
      .sort((a, b) => a.normalizedDomain.localeCompare(b.normalizedDomain))

    const grouped = new Map<string, typeof entries>()
    for (const entry of entries) {
      const list = grouped.get(entry.publisherId) || []
      list.push(entry)
      grouped.set(entry.publisherId, list)
    }

    const publishersWithSites = Array.from(grouped.entries()).map(([publisherId, publisherSites]) => {
      const publisher = publisherById.get(publisherId)
      const wallet = String(publisher?.wallet || '').toLowerCase()
      return {
        publisherId,
        wallet: publisher?.wallet || null,
        domain: publisher?.domain || null,
        verifiedInDb: Boolean(publisher?.verified),
        onChainPublisher: wallet ? onChain.publisherByWallet.get(wallet) ?? null : null,
        officialPublisher: Boolean(publisher?.verified) && onChain.publisherByWallet.get(wallet) === true,
        sites: publisherSites,
      }
    })

    const duplicates = Array.from(domainOwners.entries())
      .filter(([, owners]) => owners.size > 1)
      .map(([domain, owners]) => ({
        domain,
        publisherIds: Array.from(owners),
      }))

    return NextResponse.json({
      summary: {
        publisherCount: publishersWithSites.length,
        siteCount: entries.length,
        duplicateDomainCount: duplicates.length,
        onChainError: onChain.error || null,
      },
      duplicates,
      publishers: publishersWithSites,
    })
  } catch (error) {
    console.error('Publishers site audit failed:', error)
    return NextResponse.json(
      {
        error: 'Failed to audit publishers/sites',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
