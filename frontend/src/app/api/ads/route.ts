import { NextRequest, NextResponse } from 'next/server'
import { collections } from '@/lib/db'
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

    if (!siteId) {
      return NextResponse.json({ error: 'Site ID is required' }, { status: 400, headers: corsHeaders })
    }

    // Handle unregistered temporary sites (temp_ prefix) FIRST - before MongoDB access
    // This prevents crashes when MongoDB is unavailable
    if (siteId.startsWith('temp_')) {
      // Return dummy ad for unregistered sites to prevent crashes
      const dummyAd = {
        id: 'dummy_ad_unregistered',
        campaignId: 'dummy_campaign',
        name: 'Register Your Site',
        description: 'Register your site to start serving ads and earning revenue',
        bannerUrl: 'https://sovseas.xyz/logo.png', // Placeholder - can be replaced with actual sovseas image
        targetUrl: 'https://ads.sovseas.xyz/publisher',
        cpc: '0',
        tags: ['register', 'sovads'],
        targetLocations: [],
        metadata: {
          message: 'Register your site to start serving ads.',
          isDummy: true,
        },
        startDate: null,
        endDate: null,
        mediaType: 'image' as const,
        isDummy: true,
      }
      
      return NextResponse.json(dummyAd, { headers: corsHeaders })
    }

    // Try to access MongoDB - wrap in try-catch to handle connection errors
    let publisherSitesCollection, publishersCollection, campaignsCollection
    try {
      publisherSitesCollection = await collections.publisherSites()
      publishersCollection = await collections.publishers()
      campaignsCollection = await collections.campaigns()
    } catch (dbError) {
      console.error('MongoDB connection error:', dbError)
      // If MongoDB is unavailable, return dummy ad instead of crashing
      const dummyAd = {
        id: 'dummy_ad_db_error',
        campaignId: 'dummy_campaign',
        name: 'Service Temporarily Unavailable',
        description: 'Ad service is temporarily unavailable. Please try again later.',
        bannerUrl: 'https://sovseas.xyz/logo.png',
        targetUrl: 'https://ads.sovseas.xyz',
        cpc: '0',
        tags: ['error', 'sovads'],
        targetLocations: [],
        metadata: {
          message: 'Database connection error.',
          isDummy: true,
        },
        startDate: null,
        endDate: null,
        mediaType: 'image' as const,
        isDummy: true,
      }
      
      return NextResponse.json(dummyAd, { headers: corsHeaders })
    }

    const publisherSite = await publisherSitesCollection.findOne({ siteId })

    let publisher = null
    if (publisherSite) {
      publisher = await publishersCollection.findOne({ _id: publisherSite.publisherId })
    }

    // If not found in PublisherSite, check Publisher (legacy or direct ID)
    if (!publisher) {
      // Try as direct publisher ID
      publisher = await publishersCollection.findOne({
        $or: [{ _id: siteId }, { _id: siteId.replace('site_', '') }, { domain: siteId }],
      })
    }

    // Check if publisher exists (already handled temp_ above, so this is for other cases)
    if (!publisher && !publisherSite) {
      return NextResponse.json({ error: 'Publisher not found or not verified' }, { status: 404, headers: corsHeaders })
    }

    if (publisher && !publisher.verified && process.env.NODE_ENV !== 'development') {
      // Return dummy ad for unverified sites too
      const dummyAd = {
        id: 'dummy_ad_unverified',
        campaignId: 'dummy_campaign',
        name: 'Verify Your Site',
        description: 'Your site needs to be verified to serve ads',
        bannerUrl: 'https://sovseas.xyz/logo.png',
        targetUrl: 'https://ads.sovseas.xyz/publisher',
        cpc: '0',
        tags: ['verify', 'sovads'],
        targetLocations: [],
        metadata: {
          message: 'Verify your site to start serving ads.',
          isDummy: true,
        },
        startDate: null,
        endDate: null,
        mediaType: 'image' as const,
        isDummy: true,
      }
      
      return NextResponse.json(dummyAd, { headers: corsHeaders })
    }

    // Get active campaigns with budget remaining
    const candidatesCursor = campaignsCollection
      .find({ active: true })
      .sort({ createdAt: -1 })
      .limit(50)

    const candidateCampaigns = await candidatesCursor.toArray()
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
      .slice(0, 10)

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
      id: `ad_${randomCampaign._id}`,
      campaignId: randomCampaign._id,
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
      mediaType: randomCampaign.mediaType ?? 'image',
      placement: placement || undefined,
      size: size || undefined,
      trackingToken: createTrackingToken({
        adId: `ad_${randomCampaign._id}`,
        campaignId: randomCampaign._id,
        siteId,
        exp: Date.now() + 15 * 60 * 1000,
        placement: placement || undefined,
        size: size || undefined,
      }),
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
