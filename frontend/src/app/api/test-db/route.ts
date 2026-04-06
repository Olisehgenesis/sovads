import { NextResponse } from 'next/server'
import { collections } from '@/lib/db'

export async function GET() {
  const start = Date.now()
  try {
    const [advertisers, campaigns, publishers, sites] = await Promise.all([
      (await collections.advertisers()).countDocuments(),
      (await collections.campaigns()).countDocuments(),
      (await collections.publishers()).countDocuments(),
      (await collections.publisherSites()).countDocuments(),
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
