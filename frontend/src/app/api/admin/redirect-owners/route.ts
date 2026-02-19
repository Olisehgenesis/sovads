import { NextRequest, NextResponse } from 'next/server'
import { collections } from '@/lib/db'

function normalizeDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
}

function domainFromUrl(value: string): string {
  const trimmed = value.trim()
  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    const url = new URL(withScheme)
    return normalizeDomain(url.hostname)
  } catch {
    return normalizeDomain(trimmed)
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const redirect = searchParams.get('redirect')?.trim()

    if (!redirect) {
      return NextResponse.json({ error: 'redirect query param is required' }, { status: 400 })
    }

    const targetDomain = normalizeDomain(redirect)
    const [campaignsCollection, advertisersCollection] = await Promise.all([
      collections.campaigns(),
      collections.advertisers(),
    ])

    const campaigns = await campaignsCollection.find({}).toArray()
    const matched = campaigns.filter((campaign) => domainFromUrl(String(campaign.targetUrl || '')) === targetDomain)
    const advertiserIds = Array.from(new Set(matched.map((campaign) => campaign.advertiserId)))
    const advertisers = advertiserIds.length
      ? await advertisersCollection.find({ _id: { $in: advertiserIds } }).toArray()
      : []
    const advertiserById = new Map(advertisers.map((advertiser) => [advertiser._id, advertiser] as const))

    const rows = matched.map((campaign) => {
      const owner = advertiserById.get(campaign.advertiserId)
      return {
        campaignId: campaign._id,
        campaignName: campaign.name,
        active: campaign.active,
        targetUrl: campaign.targetUrl,
        advertiserId: campaign.advertiserId,
        advertiserWallet: owner?.wallet || null,
      }
    })

    return NextResponse.json({
      redirect: targetDomain,
      totalCampaigns: rows.length,
      owners: Array.from(new Set(rows.map((row) => row.advertiserWallet).filter(Boolean))),
      campaigns: rows,
    })
  } catch (error) {
    console.error('Redirect owners audit failed:', error)
    return NextResponse.json(
      {
        error: 'Failed to audit redirect owners',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
