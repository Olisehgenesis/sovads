import { NextResponse } from 'next/server'
import { collections } from '@/lib/db'
import { getCollection } from '@/lib/mongo'

const isAddress = (value: unknown): value is string =>
  typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value)

export async function GET() {
  try {
    // 1) Preferred source: dedicated tokens collection
    const tokensCollection = await getCollection<{
      symbol?: string
      address?: string
      name?: string
      decimals?: number
      active?: boolean
    }>('tokens')

    const tokenDoc = await tokensCollection.findOne({
      symbol: { $regex: /^SOV$/i },
      address: { $type: 'string' },
    })

    if (isAddress(tokenDoc?.address)) {
      return NextResponse.json({
        symbol: 'SOV',
        address: tokenDoc.address,
        name: tokenDoc.name || 'SovAds Token',
        decimals: typeof tokenDoc.decimals === 'number' ? tokenDoc.decimals : 18,
        source: 'tokens',
      })
    }

    // 2) Fallback: campaigns carrying SOV metadata + tokenAddress
    const campaignsCollection = await collections.campaigns()
    const campaign = await campaignsCollection.findOne(
      {
        tokenAddress: { $type: 'string' },
        $or: [
          { 'metadata.symbol': { $regex: /^SOV$/i } },
          { 'metadata.tokenSymbol': { $regex: /^SOV$/i } },
          { name: { $regex: /\bSOV\b/i } },
        ],
      },
      { projection: { tokenAddress: 1 } }
    )

    if (isAddress(campaign?.tokenAddress)) {
      return NextResponse.json({
        symbol: 'SOV',
        address: campaign.tokenAddress,
        name: 'SovAds Token',
        decimals: 18,
        source: 'campaigns',
      })
    }

    // 3) Fallback: exchange/topup records that used SOV
    const [exchangesCollection, topupsCollection] = await Promise.all([
      collections.exchanges(),
      collections.topups(),
    ])

    const [exchange, topup] = await Promise.all([
      exchangesCollection.findOne(
        { fromToken: { $regex: /^SOV$/i }, tokenAddress: { $type: 'string' } },
        { projection: { tokenAddress: 1 } }
      ),
      topupsCollection.findOne(
        { token: { $regex: /^SOV$/i }, tokenAddress: { $type: 'string' } },
        { projection: { tokenAddress: 1 } }
      ),
    ])

    const fallbackAddress = exchange?.tokenAddress || topup?.tokenAddress
    if (isAddress(fallbackAddress)) {
      return NextResponse.json({
        symbol: 'SOV',
        address: fallbackAddress,
        name: 'SovAds Token',
        decimals: 18,
        source: exchange?.tokenAddress ? 'exchanges' : 'topups',
      })
    }

    return NextResponse.json({ symbol: 'SOV', address: null }, { status: 404 })
  } catch (error) {
    console.error('Error resolving SOV token from DB:', error)
    return NextResponse.json({ error: 'Failed to resolve SOV token' }, { status: 500 })
  }
}
