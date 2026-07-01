import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { tursoClient } from '@/lib/turso/client'

/**
 * Events are read from Turso (firehose) — Postgres `Event` is write-frozen
 * after the Turso migration, so reading it would return stale lifetime
 * snapshots. Money + campaign/publisher metadata still come from Postgres.
 */
interface TursoEventRow {
  id: string
  type: string
  campaign_id: string
  publisher_id: string | null
  site_id: string | null
  timestamp: number
}

async function fetchTursoEvents(opts: {
  startMs?: number | null
  campaignId?: string | null
  publisherId?: string | null
  siteId?: string | null
  limit?: number
}): Promise<TursoEventRow[]> {
  const filters: string[] = []
  const args: (string | number)[] = []
  if (opts.startMs != null) {
    filters.push('timestamp >= ?')
    args.push(opts.startMs)
  }
  if (opts.campaignId) {
    filters.push('campaign_id = ?')
    args.push(opts.campaignId)
  }
  if (opts.publisherId) {
    filters.push('publisher_id = ?')
    args.push(opts.publisherId)
  }
  if (opts.siteId) {
    filters.push('site_id = ?')
    args.push(opts.siteId)
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
  const limit = opts.limit && opts.limit > 0 ? opts.limit : 50000
  const res = await tursoClient().execute({
    sql: `SELECT id, type, campaign_id, publisher_id, site_id, timestamp
          FROM events ${where}
          ORDER BY timestamp DESC
          LIMIT ${limit}`,
    args,
  })
  return res.rows as unknown as TursoEventRow[]
}

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

    const events = await fetchTursoEvents({
      startMs: useTimeFilter ? startDate.getTime() : null,
      campaignId: campaignId ?? null,
      publisherId: publisherId ?? null,
      siteId: siteId ?? null,
    })

    const campaignIds = Array.from(new Set(events.map((e) => e.campaign_id)))
    const publisherIds = Array.from(
      new Set(events.map((e) => e.publisher_id).filter((p): p is string => !!p))
    )

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
        const campaign = campaignMap.get(event.campaign_id)
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
        rec.revenue += campaignMap.get(e.campaign_id)?.cpc ?? 0
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
        campaignName: campaignMap.get(event.campaign_id)?.name ?? 'Unknown Campaign',
        publisherDomain: event.publisher_id
          ? publisherMap.get(event.publisher_id)?.domain ?? 'Unknown Publisher'
          : 'Unknown Publisher',
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

    // Get all events for the day from Turso (firehose). Postgres `Event` is
    // write-frozen, so we must read the source of truth here.
    const dayRes = await tursoClient().execute({
      sql: `SELECT id, type, campaign_id, publisher_id, site_id, timestamp
            FROM events
            WHERE timestamp >= ? AND timestamp < ?`,
      args: [targetDate.getTime(), nextDay.getTime()],
    })
    const events = dayRes.rows as unknown as TursoEventRow[]

    const campaignIds = Array.from(new Set(events.map((e) => e.campaign_id)))
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
      const evCampaignId = event.campaign_id
      const evPublisherId = event.publisher_id ?? 'unknown'

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
        campaignStat.revenue += campaignMap.get(event.campaign_id)?.cpc ?? 0
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
        publisherStat.revenue += campaignMap.get(event.campaign_id)?.cpc ?? 0
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

