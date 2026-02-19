import { NextResponse } from 'next/server'
import { collections } from '@/lib/db'
import { fetchTokenPricesUsd } from '@/lib/token-pricing'

const DEFAULT_IMPRESSION_USD = 0.0002

export async function GET() {
  try {
    const pricingCollection = await collections.pricingConfig()
    const config = await pricingCollection.findOne({ _id: 'global' })
    const impressionUsd = config?.impressionUsd ?? DEFAULT_IMPRESSION_USD
    const overrides = config?.tokenOverrides ?? {}

    const tokens = await fetchTokenPricesUsd(overrides)
    const rows = tokens.map((token) => ({
      ...token,
      impressionUsd,
      impressionInToken: token.usd > 0 ? impressionUsd / token.usd : null,
    }))

    return NextResponse.json({
      impressionUsd,
      tokens: rows,
      source: 'coingecko+overrides',
      updatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Token prices error:', error)
    return NextResponse.json({ error: 'Failed to load token prices' }, { status: 500 })
  }
}
