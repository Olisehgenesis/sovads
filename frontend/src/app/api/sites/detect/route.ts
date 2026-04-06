import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// CORS headers helper
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

type DetectRequest = {
  domain?: string
  pageUrl?: string
  pathname?: string
}

function normalizeHost(value: string): string {
  let normalized = value.toLowerCase().trim()
  normalized = normalized.replace(/^https?:\/\//, '')
  normalized = normalized.split('/')[0] ?? normalized

  if (normalized.startsWith('www.')) {
    normalized = normalized.substring(4)
  }

  if (normalized.includes(':') && !normalized.includes('mongodb')) {
    normalized = normalized.split(':')[0] ?? normalized
  }

  return normalized
}

function normalizePathPrefix(value?: string): string {
  if (!value || !value.trim()) return '/'
  let normalized = value.trim()
  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`
  }
  normalized = normalized.replace(/\/{2,}/g, '/')
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1)
  }
  return normalized || '/'
}

function pathPrefixMatches(pathPrefix: string, path: string): boolean {
  if (pathPrefix === '/') return true
  return path === pathPrefix || path.startsWith(`${pathPrefix}/`)
}

function parseIncomingHostPath(body: DetectRequest): { host: string; path: string } {
  const fromPageUrl = body.pageUrl ? new URL(body.pageUrl) : null
  const rawHost = body.domain ?? fromPageUrl?.host ?? ''
  const host = normalizeHost(rawHost)
  const rawPath = body.pathname ?? fromPageUrl?.pathname ?? '/'
  const path = normalizePathPrefix(rawPath)
  return { host, path }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as DetectRequest
    const { host, path } = parseIncomingHostPath(body)

    if (!host) {
      return NextResponse.json({
        error: 'Domain is required'
      }, { status: 400, headers: corsHeaders })
    }

    let publisherSite = null
    let publisherSites: any[] = []
    try {
      publisherSites = await prisma.publisherSite.findMany()
      await prisma.publisherSite.findFirst({}) // connectivity check
    } catch (dbError) {
      console.error('Database connection error in site detection:', dbError)
      const errorDetails = dbError instanceof Error ? dbError.message : String(dbError)

      const encodedDomain = Buffer.from(host).toString('base64')
      const tempSiteId = `temp_${encodedDomain.substring(0, 8)}_${Date.now()}`

      return NextResponse.json({
        siteId: tempSiteId,
        domain: host,
        host,
        pathPrefix: path,
        verified: false,
        message: 'Database unavailable - using temporary site ID',
        error: process.env.NODE_ENV === 'development' ? errorDetails : undefined,
      }, { headers: corsHeaders })
    }

    const allSites = publisherSites
    const matchingPublisherSites = allSites
      .map((site) => ({
        site,
        host: normalizeHost(String((site as { host?: string }).host ?? site.domain ?? '')),
        pathPrefix: normalizePathPrefix(String((site as { pathPrefix?: string }).pathPrefix ?? '/')),
      }))
      .filter((row) => row.host === host && pathPrefixMatches(row.pathPrefix, path))
      .sort((a, b) => b.pathPrefix.length - a.pathPrefix.length)

    const selected = matchingPublisherSites[0]
    if (selected) {
      const publisher = await prisma.publisher.findFirst({ where: { id: selected.site.publisherId } })
      return NextResponse.json({
        siteId: selected.site.siteId,
        domain: selected.site.domain,
        host: selected.host,
        pathPrefix: selected.pathPrefix,
        verified: publisher?.verified || false
      }, { headers: corsHeaders })
    }

    const site = await prisma.publisher.findFirst({ where: { domain: host, verified: true } })

    if (site) {
      return NextResponse.json({
        siteId: site.id,
        domain: site.domain,
        host,
        pathPrefix: '/',
        verified: site.verified
      }, { headers: corsHeaders })
    }

    const unverifiedSite = await prisma.publisher.findFirst({ where: { domain: host, verified: false } })

    if (unverifiedSite) {
      return NextResponse.json({
        siteId: unverifiedSite.id,
        domain: unverifiedSite.domain,
        host,
        pathPrefix: '/',
        verified: unverifiedSite.verified,
        message: 'Site exists but not verified'
      }, { headers: corsHeaders })
    }

    const encodedDomain = Buffer.from(host).toString('base64')
    const tempSiteId = `temp_${encodedDomain.substring(0, 8)}_${Date.now()}`

    return NextResponse.json({
      siteId: tempSiteId,
      domain: host,
      host,
      pathPrefix: path,
      verified: false,
      message: 'New site detected - please register to start earning'
    }, { headers: corsHeaders })

  } catch (error) {
    console.error('Error detecting site:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({
      error: 'Failed to detect site',
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
    }, { status: 500, headers: corsHeaders })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const domain = searchParams.get('domain')

    if (!domain) {
      return NextResponse.json({
        error: 'Domain parameter is required'
      }, { status: 400, headers: corsHeaders })
    }

    const publisherSiteForGet = await prisma.publisher.findFirst({
      where: { domain: normalizeHost(domain) },
      select: { id: true, domain: true, verified: true, totalEarned: true, createdAt: true },
    })

    if (!publisherSiteForGet) {
      return NextResponse.json({
        error: 'Site not found'
      }, { status: 404, headers: corsHeaders })
    }

    return NextResponse.json({
      site: {
        id: publisherSiteForGet.id,
        domain: publisherSiteForGet.domain,
        verified: publisherSiteForGet.verified,
        totalEarned: publisherSiteForGet.totalEarned,
        createdAt: publisherSiteForGet.createdAt,
      }
    }, { headers: corsHeaders })
  } catch (error) {
    console.error('Error fetching site:', error)
    return NextResponse.json({
      error: 'Failed to fetch site'
    }, { status: 500, headers: corsHeaders })
  }
}
