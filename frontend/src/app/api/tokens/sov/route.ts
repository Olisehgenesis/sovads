import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const isAddress = (value: unknown): value is string =>
  typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value)

export async function GET() {
  try {
    // 1) Fallback: campaigns carrying SOV name
    const campaign = await prisma.campaign.findFirst({
      where: {
        tokenAddress: { not: null },
        name: { contains: 'SOV', mode: 'insensitive' },
      },
      select: { tokenAddress: true },
    })

    if (isAddress(campaign?.tokenAddress)) {
      return NextResponse.json({
        symbol: 'SOV',
        address: campaign.tokenAddress,
        name: 'SovAds Token',
        decimals: 18,
        source: 'campaigns',
      })
    }

    // 2) Fallback: exchange/topup records that used SOV
    const [exchange, topup] = await Promise.all([
      prisma.exchange.findFirst({
        where: { fromToken: { equals: 'SOV', mode: 'insensitive' }, tokenAddress: { not: null } },
        select: { tokenAddress: true },
      }),
      prisma.topup.findFirst({
        where: { token: { equals: 'SOV', mode: 'insensitive' }, tokenAddress: { not: null } },
        select: { tokenAddress: true },
      }),
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
