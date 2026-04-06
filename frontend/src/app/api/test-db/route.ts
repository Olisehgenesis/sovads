import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const start = Date.now()
  try {
    const [advertisers, campaigns, publishers, sites] = await Promise.all([
      prisma.advertiser.count(),
      prisma.campaign.count(),
      prisma.publisher.count(),
      prisma.publisherSite.count(),
    ])

    return NextResponse.json({
      ok: true,
      latencyMs: Date.now() - start,
      counts: { advertisers, campaigns, publishers, publisher_sites: sites },
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message, latencyMs: Date.now() - start },
      { status: 500 }
    )
  }
}
