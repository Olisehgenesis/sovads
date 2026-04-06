import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const campaignId = searchParams.get('campaignId')
    const publisherId = searchParams.get('publisherId')
    const siteId = searchParams.get('siteId')
    const daysParam = searchParams.get('days')
    let days = Number.parseInt(daysParam ?? '7', 10)
    let useTimeFilter = true

    if (!daysParam || Number.isNaN(days) || days <= 0 || daysParam.toLowerCase() === 'all') {
      useTimeFilter = false
      days = 0
    }

    const startDate = new Date()
    if (useTimeFilter) {
      startDate.setDate(startDate.getDate() - days)
    }

    const where: Record<string, unknown> = {}
    if (useTimeFilter) where.timestamp = { gte: startDate }
    if (campaignId) where.campaignId = campaignId
    if (publisherId) where.publisherId = publisherId
    if (siteId) where.OR = [{ siteId }, { publisherSiteId: siteId }]

    const events = await prisma.event.findMany({
      where,
      orderBy: { timestamp: 'desc' },
    })

    const campaignIds = Array.from(new Set(events.map((e) => e.campaignId)))
    const publisherIds = Array.from(new Set(events.map((e) => e.publisherId)))

    const [campaignDocs, publisherDocs] = await Promise.all([
      campaignIds.length
        ? prisma.campaign.findMany({
            where: { id: { in: campaignIds } },
            select: { id: true, name: true, cpc: true },
          })
        : [],
      publisherIds.length
        ? prisma.publisher.findMany({
            where: { id: { in: publisherIds } },
            select: { id: true, domain: true },
          })
        : [],
    ])

    const campaignMap = new Map<string, { name?: string | null; cpc?: number | null }>()
    campaignDocs.forEach((doc) => {
      campaignMap.set(doc.id, { name: doc.name, cpc: doc.cpc })
    })

    const publisherMap = new Map<string, { domain?: string }>()
    publisherDocs.forEach((doc) => {
      publisherMap.set(doc.id, { domain: doc.domain })
    })

    // Calculate metrics
    const normalizeEventType = (type: unknown) =>
      typeof type === 'string' ? type.toUpperCase() : ''

    const impressions = events.filter((e) => normalizeEventType(e.type) === 'IMPRESSION').length
    const clicks = events.filter((e) => normalizeEventType(e.type) === 'CLICK').length
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0

    // Calculate revenue (for publishers)
    const totalRevenue = events
      .filter((e) => normalizeEventType(e.type) === 'CLICK')
      .reduce((sum, event) => {
        const campaign = campaignMap.get(event.campaignId)
        return sum + (campaign?.cpc ?? 0)
      }, 0)

    // build daily breakdown (ISO date -> counts)
    const dailyMap: Map<string, { date: string; impressions: number; clicks: number; revenue: number }> = new Map()
    events.forEach((e) => {
      const d = new Date(e.timestamp).toISOString().split('T')[0]
      if (!dailyMap.has(d)) {
        dailyMap.set(d, { date: d, impressions: 0, clicks: 0, revenue: 0 })
      }
      const rec = dailyMap.get(d)!
      const eventType = normalizeEventType(e.type)
      if (eventType === 'IMPRESSION') {
        rec.impressions++
      } else if (eventType === 'CLICK') {
        rec.clicks++
        rec.revenue += campaignMap.get(e.campaignId)?.cpc ?? 0
      }
    })
    const dailyStats = Array.from(dailyMap.values())

    const analytics = {
      period: `${days} days`,
      impressions,
      clicks,
      ctr: parseFloat(ctr.toFixed(2)),
      totalRevenue: parseFloat(totalRevenue.toFixed(6)),
      dailyStats,
      events: events.map((event) => ({
        id: event.id,
        type: event.type,
        timestamp: event.timestamp,
        campaignName: campaignMap.get(event.campaignId)?.name ?? 'Unknown Campaign',
        publisherDomain: publisherMap.get(event.publisherId)?.domain ?? 'Unknown Publisher',
      })),
    }

    return NextResponse.json(analytics)
  } catch (error) {
    console.error('Error fetching analytics:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Endpoint for aggregating analytics (called by cron job)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { date } = body

    const targetDate = date ? new Date(date) : new Date()
    targetDate.setHours(0, 0, 0, 0)
    
    const nextDay = new Date(targetDate)
    nextDay.setDate(nextDay.getDate() + 1)

    // Get all events for the day
    const events = await prisma.event.findMany({
      where: {
        timestamp: { gte: targetDate, lt: nextDay },
      },
    })

    const campaignIds = Array.from(new Set(events.map((e) => e.campaignId)))
    const campaignDocs = campaignIds.length
      ? await prisma.campaign.findMany({
          where: { id: { in: campaignIds } },
          select: { id: true, cpc: true },
        })
      : []

    const campaignMap = new Map<string, { cpc?: number | null }>()
    campaignDocs.forEach((doc) => {
      campaignMap.set(doc.id, { cpc: doc.cpc })
    })

    // Aggregate by campaign and publisher
    const campaignStats = new Map()
    const publisherStats = new Map()

    events.forEach((event) => {
      const evCampaignId = event.campaignId
      const evPublisherId = event.publisherId

      // Campaign stats
      if (!campaignStats.has(evCampaignId)) {
        campaignStats.set(evCampaignId, {
          campaignId: evCampaignId,
          impressions: 0,
          clicks: 0,
          revenue: 0
        })
      }

      const campaignStat = campaignStats.get(evCampaignId)
      if (event.type === 'IMPRESSION') {
        campaignStat.impressions++
      } else if (event.type === 'CLICK') {
        campaignStat.clicks++
        campaignStat.revenue += campaignMap.get(event.campaignId)?.cpc ?? 0
      }

      // Publisher stats
      if (!publisherStats.has(evPublisherId)) {
        publisherStats.set(evPublisherId, {
          publisherId: evPublisherId,
          impressions: 0,
          clicks: 0,
          revenue: 0
        })
      }

      const publisherStat = publisherStats.get(evPublisherId)
      if (event.type === 'IMPRESSION') {
        publisherStat.impressions++
      } else if (event.type === 'CLICK') {
        publisherStat.clicks++
        publisherStat.revenue += campaignMap.get(event.campaignId)?.cpc ?? 0
      }
    })

    const aggregatedData = {
      date: targetDate.toISOString().split('T')[0],
      campaigns: Array.from(campaignStats.values()),
      publishers: Array.from(publisherStats.values()),
      totalEvents: events.length
    }

    const hash = `0x${Buffer.from(JSON.stringify(aggregatedData)).toString('hex').slice(0, 64)}`

    return NextResponse.json({
      success: true,
      aggregatedData,
      hash
    })
  } catch (error) {
    console.error('Error aggregating analytics:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

