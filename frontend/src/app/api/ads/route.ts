import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createTrackingToken } from '@/lib/tracking-token'

// CORS headers helper
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function normalizeHttpUrl(value: string): string {
  const trimmed = (value || '').trim()
  if (!trimmed) return trimmed
  if (trimmed.includes('://')) return trimmed
  if (trimmed.startsWith('localhost') || trimmed.startsWith('127.0.0.1')) {
    return `http://${trimmed}`
  }
  return `https://${trimmed}`
}

function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string')
}

function inferMediaTypeFromUrl(url: string): 'image' | 'video' {
  const value = (url || '').toLowerCase()
  const videoExts = ['.mp4', '.webm', '.ogg', '.ogv', '.mov', '.m3u8']
  return videoExts.some((ext) => value.includes(ext)) ? 'video' : 'image'
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  })
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const siteId = searchParams.get('siteId')
    const location = searchParams.get('location')?.toLowerCase()
    const consumerId = searchParams.get('consumerId')?.trim()
    const placement = searchParams.get('placement')?.trim().toLowerCase()
    const size = searchParams.get('size')?.trim()
    const wallet = searchParams.get('wallet')?.trim().toLowerCase()

    if (!siteId) {
      return NextResponse.json({ error: 'Site ID is required' }, { status: 400, headers: corsHeaders })
    }

    // Handle unregistered temporary sites (temp_ prefix) or localhost development
    let isUnverifiedSite = false
    const referer = request.headers.get('referer')
    const isLocalhost = referer && (referer.includes('localhost') || referer.includes('127.0.0.1'))

    if (siteId.startsWith('temp_') || isLocalhost) {
      isUnverifiedSite = true
    }

    // Try to access DB
    let publisherSite = null
    let publisher = null
    try {
      if (!isUnverifiedSite) {
        publisherSite = await prisma.publisherSite.findFirst({ where: { siteId } })
        if (publisherSite) {
          publisher = await prisma.publisher.findFirst({ where: { id: publisherSite.publisherId } })
        }
      }

      if (!publisher) {
        publisher = await prisma.publisher.findFirst({
          where: {
            OR: [{ id: siteId }, { id: siteId.replace('site_', '') }, { domain: siteId }],
          },
        })
      }
    } catch (dbError) {
      console.error('Database connection error:', dbError)
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503, headers: corsHeaders })
    }

    if (publisher && !publisher.verified) {
      isUnverifiedSite = true
    } else if (!publisher && !isUnverifiedSite) {
      // If not a temp site and no publisher found, it's effectively unverified/unknown
      isUnverifiedSite = true
    }

    // Get active campaigns with budget remaining and approved verification status
    const candidateCampaigns = await prisma.campaign.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    const campaigns = candidateCampaigns
      .filter((campaign) => campaign.budget > campaign.spent)
      .filter((campaign: any) => {
        if (!placement) return true
        const placements = getStringArray(campaign?.metadata?.placements)
        if (placements.length === 0) return true
        return placements.includes(placement)
      })
      .filter((campaign: any) => {
        if (!size) return true
        const sizes = getStringArray(campaign?.metadata?.sizes)
        if (sizes.length === 0) return true
        return sizes.includes(size)
      })
      .filter((campaign) => {
        if (!location) return true
        if (!campaign.targetLocations || campaign.targetLocations.length === 0) return true
        return campaign.targetLocations.some(
          (loc) => typeof loc === 'string' && loc.toLowerCase() === location
        )
      })
      .filter((campaign: any) => {
        if (!consumerId) return true
        const directConsumer = typeof campaign.consumerId === 'string' ? campaign.consumerId : null
        const metaConsumer = campaign.metadata && typeof campaign.metadata === 'object'
          ? (campaign.metadata as Record<string, unknown>).consumerId
          : null
        const targetedConsumer = typeof metaConsumer === 'string' ? metaConsumer : directConsumer
        if (!targetedConsumer) return true
        return targetedConsumer === consumerId
      })
      .slice(0, 30)

    if (campaigns.length === 0) {
      // Return dummy ad when no campaigns available instead of error
      const dummyAd = {
        id: 'dummy_ad_no_campaigns',
        campaignId: 'dummy_campaign',
        name: 'No Ads Available',
        description: 'No active campaigns at the moment',
        bannerUrl: 'https://sovseas.xyz/logo.png',
        targetUrl: 'https://ads.sovseas.xyz',
        cpc: '0',
        tags: ['no-campaigns', 'sovads'],
        targetLocations: [],
        metadata: {
          message: 'No active campaigns available.',
          isDummy: true,
        },
        startDate: null,
        endDate: null,
        mediaType: 'image' as const,
        isDummy: true,
      }

      return NextResponse.json(dummyAd, { headers: corsHeaders })
    }

    // Select random campaign
    const randomCampaign = campaigns[Math.floor(Math.random() * campaigns.length)]

    // Create ad response
    const ad = {
      id: `ad_${randomCampaign.id}`,
      campaignId: randomCampaign.id,
      name: randomCampaign.name,
      description: randomCampaign.description ?? '',
      bannerUrl: normalizeHttpUrl(randomCampaign.bannerUrl),
      targetUrl: normalizeHttpUrl(randomCampaign.targetUrl),
      cpc: randomCampaign.cpc.toString(),
      tags: randomCampaign.tags ?? [],
      targetLocations: randomCampaign.targetLocations ?? [],
      metadata: randomCampaign.metadata ?? null,
      startDate: randomCampaign.startDate ?? null,
      endDate: randomCampaign.endDate ?? null,
      mediaType: randomCampaign.mediaType ?? inferMediaTypeFromUrl(randomCampaign.bannerUrl),
      placement: placement || undefined,
      size: size || undefined,
      trackingToken: createTrackingToken({
        adId: `ad_${randomCampaign.id}`,
        campaignId: randomCampaign.id,
        siteId,
        exp: Date.now() + 15 * 60 * 1000,
        placement: placement || undefined,
        size: size || undefined,
        walletAddress: wallet || undefined,
        isUnverified: isUnverifiedSite,
      }),
      isUnverified: isUnverifiedSite,
    }

    return NextResponse.json(ad, { headers: corsHeaders })
  } catch (error) {
    console.error('Error fetching ad:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
    }, { status: 500, headers: corsHeaders })
  }
}
