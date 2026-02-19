import { NextRequest, NextResponse } from 'next/server'
import { collections } from '@/lib/db'
import { fetchTokenPricesUsd } from '@/lib/token-pricing'

const DEFAULT_IMPRESSION_USD = 0.0002

export async function GET() {
  try {
    const pricingCollection = await collections.pricingConfig()
    const config = await pricingCollection.findOne({ _id: 'global' })
    const impressionUsd = config?.impressionUsd ?? DEFAULT_IMPRESSION_USD
    const tokenOverrides = config?.tokenOverrides ?? {}
    const tokens = await fetchTokenPricesUsd(tokenOverrides)
    return NextResponse.json({ impressionUsd, tokenOverrides, tokens })
  } catch (error) {
    console.error('Pricing config GET error:', error)
    return NextResponse.json({ error: 'Failed to load pricing config' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const impressionUsdRaw = Number(body?.impressionUsd)
    const tokenOverridesRaw = body?.tokenOverrides

    if (!Number.isFinite(impressionUsdRaw) || impressionUsdRaw <= 0) {
      return NextResponse.json({ error: 'impressionUsd must be a positive number' }, { status: 400 })
    }

    const tokenOverrides: Record<string, number> = {}
    if (tokenOverridesRaw && typeof tokenOverridesRaw === 'object') {
      for (const [symbol, value] of Object.entries(tokenOverridesRaw as Record<string, unknown>)) {
        const numeric = Number(value)
        if (Number.isFinite(numeric) && numeric > 0) {
          tokenOverrides[symbol] = numeric
        }
      }
    }

    const pricingCollection = await collections.pricingConfig()
    await pricingCollection.updateOne(
      { _id: 'global' },
      {
        $set: {
          impressionUsd: impressionUsdRaw,
          tokenOverrides,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Pricing config PUT error:', error)
    return NextResponse.json({ error: 'Failed to update pricing config' }, { status: 500 })
  }
}
