import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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

    const campaigns = await prisma.campaign.findMany({
      include: { advertiser: { select: { id: true, wallet: true } } },
    })
    const matched = campaigns.filter(c => domainFromUrl(String(c.targetUrl || '')) === targetDomain)

    const rows = matched.map((campaign) => ({
      campaignId: campaign.id,
      campaignName: campaign.name,
      active: campaign.active,
      targetUrl: campaign.targetUrl,
      advertiserId: campaign.advertiserId,
      advertiserWallet: campaign.advertiser?.wallet || null,
    }))

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
