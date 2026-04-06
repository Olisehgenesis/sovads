import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Get debug statistics and data
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const hours = Number.parseInt(searchParams.get('hours') ?? '24', 10)
    const effectiveHours = Number.isNaN(hours) ? 24 : Math.max(hours, 1)
    const since = new Date(Date.now() - effectiveHours * 60 * 60 * 1000)

    // Get counts
    const [sdkRequests, sdkInteractions, apiCalls, callbacks] = await Promise.all([
      prisma.sdkRequest.count({ where: { timestamp: { gte: since } } }),
      prisma.sdkInteraction.count({ where: { timestamp: { gte: since } } }),
      prisma.apiRouteCall.count({ where: { timestamp: { gte: since } } }),
      prisma.callbackLog.count({ where: { timestamp: { gte: since } } }),
    ])

    // Get SDK request types breakdown
    const sdkRequestTypesRaw = await prisma.sdkRequest.groupBy({
      by: ['type'],
      where: { timestamp: { gte: since } },
      _count: { _all: true },
    })
    const sdkRequestTypes = sdkRequestTypesRaw.map((g) => ({ type: g.type ?? 'unknown', count: g._count._all }))

    // Get SDK interaction types breakdown
    const interactionTypesRaw = await prisma.sdkInteraction.groupBy({
      by: ['type'],
      where: { timestamp: { gte: since } },
      _count: { _all: true },
    })
    const interactionTypes = interactionTypesRaw.map((g) => ({ type: g.type ?? 'unknown', count: g._count._all }))

    // Get API route breakdown
    const apiRoutesRaw = await prisma.apiRouteCall.groupBy({
      by: ['route'],
      where: { timestamp: { gte: since } },
      _count: { _all: true },
      _avg: { duration: true },
    })
    const apiRoutes = apiRoutesRaw.map((g) => ({
      route: g.route ?? 'unknown',
      count: g._count._all,
      avgDuration: g._avg.duration ?? 0,
    }))

    // Get callback types
    const callbackTypesRaw = await prisma.callbackLog.groupBy({
      by: ['type'],
      where: { timestamp: { gte: since } },
      _count: { _all: true },
    })
    const callbackTypes = callbackTypesRaw.map((g) => ({ type: g.type ?? 'unknown', count: g._count._all }))

    // Get hourly breakdown for charts
    const hourlyData: Array<{
      hour: string
      requests: number
      interactions: number
      api: number
      callbacks: number
    }> = []
    for (let i = effectiveHours - 1; i >= 0; i -= 1) {
      const hourStart = new Date(Date.now() - i * 60 * 60 * 1000)
      const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000)

      const [requestCount, interactionCount, apiCount, callbackCount] = await Promise.all([
        prisma.sdkRequest.count({ where: { timestamp: { gte: hourStart, lt: hourEnd } } }),
        prisma.sdkInteraction.count({ where: { timestamp: { gte: hourStart, lt: hourEnd } } }),
        prisma.apiRouteCall.count({ where: { timestamp: { gte: hourStart, lt: hourEnd } } }),
        prisma.callbackLog.count({ where: { timestamp: { gte: hourStart, lt: hourEnd } } }),
      ])

      hourlyData.push({
        hour: hourStart.toISOString(),
        requests: requestCount,
        interactions: interactionCount,
        api: apiCount,
        callbacks: callbackCount,
      })
    }

    // Get error rates
    const [sdkRequestErrors, apiErrors, callbackErrors] = await Promise.all([
      prisma.sdkRequest.count({ where: { timestamp: { gte: since }, error: { not: null } } }),
      prisma.apiRouteCall.count({ where: { timestamp: { gte: since }, statusCode: { gte: 400 } } }),
      prisma.callbackLog.count({ where: { timestamp: { gte: since }, error: { not: null } } }),
    ])

    // Get top domains
    const topDomainsRaw = await prisma.sdkRequest.groupBy({
      by: ['domain'],
      where: { timestamp: { gte: since }, domain: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { domain: 'desc' } },
      take: 10,
    })
    const topDomains = topDomainsRaw.map((g) => ({ domain: g.domain, count: g._count._all }))

    // Get average response times
    const avgResponseTimeResult = await prisma.sdkRequest.aggregate({
      where: { timestamp: { gte: since }, duration: { not: null } },
      _avg: { duration: true },
    })
    const avgResponseTime = avgResponseTimeResult._avg.duration ?? 0

    return NextResponse.json({
      summary: {
        sdkRequests,
        sdkInteractions,
        apiCalls,
        callbacks,
        errors: {
          sdkRequests: sdkRequestErrors,
          apiCalls: apiErrors,
          callbacks: callbackErrors,
        },
        avgResponseTime,
      },
      breakdowns: {
        sdkRequestTypes,
        interactionTypes,
        apiRoutes,
        callbackTypes,
      },
      hourlyData,
      topDomains,
    })
  } catch (error) {
    console.error('Error fetching debug stats:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Get debug statistics and data
 */
