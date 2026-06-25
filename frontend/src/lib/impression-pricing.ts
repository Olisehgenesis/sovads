/**
 * Per-impression cost in the campaign's payment token.
 *
 * Formula:
 *   impressionUsd  = PricingConfig.impressionUsd  (default $0.0002)
 *   tokenUsd       = fetchTokenPricesUsd()[tokenAddress].usd
 *   costInToken    = impressionUsd / tokenUsd
 *
 * Cached for 60s in-memory so the hot impression-write path doesn't hit
 * CoinGecko + the DB on every event. Cache is keyed by lowercased token
 * address.
 */
import { prisma } from '@/lib/prisma'
import { fetchTokenPricesUsd } from '@/lib/token-pricing'

const DEFAULT_IMPRESSION_USD = 0.0002
const TTL_MS = 60_000

let cache: { at: number; map: Map<string, number>; impressionUsd: number } | null = null

async function refresh() {
  const config = await prisma.pricingConfig.findFirst()
  const impressionUsd = config?.impressionUsd ?? DEFAULT_IMPRESSION_USD
  const overrides = (config?.tokenOverrides as Record<string, number> | null) ?? {}
  const tokens = await fetchTokenPricesUsd(overrides)
  const map = new Map<string, number>()
  for (const t of tokens) {
    const cost = t.usd > 0 ? impressionUsd / t.usd : 0
    map.set(t.address.toLowerCase(), cost)
  }
  cache = { at: Date.now(), map, impressionUsd }
}

/** Token-denominated cost of one IMPRESSION for the given campaign token. */
export async function getImpressionCostInToken(
  tokenAddress: string | null | undefined,
): Promise<number> {
  if (!tokenAddress) return 0
  if (!cache || Date.now() - cache.at > TTL_MS) {
    try {
      await refresh()
    } catch {
      if (!cache) return 0
    }
  }
  return cache!.map.get(tokenAddress.toLowerCase()) ?? 0
}

/** Global USD impression price (cached). Useful for analytics / display. */
export async function getImpressionUsd(): Promise<number> {
  if (!cache || Date.now() - cache.at > TTL_MS) {
    try {
      await refresh()
    } catch {
      return DEFAULT_IMPRESSION_USD
    }
  }
  return cache!.impressionUsd
}

/** Force the next call to refetch. Call after PricingConfig edits. */
export function invalidateImpressionPricingCache() {
  cache = null
}
