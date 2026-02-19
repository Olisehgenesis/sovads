import { CELO_TOKENS } from '@/lib/tokens'

const COINGECKO_ENDPOINT =
  'https://api.coingecko.com/api/v3/simple/price?ids=usd-coin,tether,celo,gooddollar,celo-dollar&vs_currencies=usd'

const COINGECKO_ID_BY_SYMBOL: Record<string, string> = {
  USDC: 'usd-coin',
  USDT: 'tether',
  CELO: 'celo',
  'G$': 'gooddollar',
  cUSD: 'celo-dollar',
}

export type TokenPriceRow = {
  symbol: string
  address: string
  usd: number
}

export async function fetchTokenPricesUsd(
  overrides: Record<string, number> = {}
): Promise<TokenPriceRow[]> {
  let remotePrices: Record<string, { usd?: number }> = {}
  try {
    const resp = await fetch(COINGECKO_ENDPOINT, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      next: { revalidate: 60 },
    })
    if (resp.ok) {
      remotePrices = (await resp.json()) as Record<string, { usd?: number }>
    }
  } catch {
    // keep fallback prices below
  }

  return Object.values(CELO_TOKENS).map((token) => {
    const override = overrides[token.symbol]
    const id = COINGECKO_ID_BY_SYMBOL[token.symbol]
    const remote = id ? remotePrices[id]?.usd : undefined
    const fallback =
      token.symbol === 'USDC' || token.symbol === 'USDT' || token.symbol === 'cUSD' || token.symbol === 'G$'
        ? 1
        : 0
    const usd = typeof override === 'number' && override > 0 ? override : (remote ?? fallback)

    return {
      symbol: token.symbol,
      address: token.address,
      usd,
    }
  })
}
