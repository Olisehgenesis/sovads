import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateApiKeyServer, generateSecretServer } from '@/lib/crypto-server'
import { verifyMessage } from 'viem'
import { buildPublisherAuthMessage, isPublisherAuthTimestampValid } from '@/lib/publisher-auth'

const unauthorized = (message: string) =>
  NextResponse.json({ error: message }, { status: 401 })

const normalizeHost = (value: string): string => {
  let normalized = value.trim().toLowerCase()
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

const normalizePathPrefix = (value?: string): string => {
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

const parseSiteInput = (domainOrUrl: string, explicitPathPrefix?: string): { host: string; pathPrefix: string } => {
  const parsedUrl = new URL(domainOrUrl.includes('://') ? domainOrUrl : `https://${domainOrUrl}`)
  const host = normalizeHost(parsedUrl.host)
  const extractedPath = normalizePathPrefix(parsedUrl.pathname)
  const pathPrefix = normalizePathPrefix(explicitPathPrefix ?? extractedPath)
  return { host, pathPrefix }
}

const pathPrefixMatches = (pathPrefix: string, path: string): boolean => {
  if (pathPrefix === '/') return true
  return path === pathPrefix || path.startsWith(`${pathPrefix}/`)
}

const isPathOverlap = (left: string, right: string): boolean =>
  pathPrefixMatches(left, right) || pathPrefixMatches(right, left)

const toSiteView = (site: any) => ({
  id: site.id,
  domain: site.domain,
  host: normalizeHost(String(site.host ?? site.domain ?? '')),
  pathPrefix: normalizePathPrefix(String(site.pathPrefix ?? '/')),
  matchType: site.matchType ?? 'PREFIX',
  siteId: site.siteId,
  apiKey: site.apiKey,
  verified: site.verified,
  createdAt: site.createdAt,
})

async function verifyPublisherRequest(request: NextRequest, wallet: string): Promise<NextResponse | null> {
  const headerWallet = request.headers.get('x-wallet-address')?.toLowerCase()
  const signature = request.headers.get('x-wallet-signature')
  const timestampRaw = request.headers.get('x-wallet-timestamp')
  const normalizedWallet = wallet.toLowerCase()

  if (!headerWallet || !signature || !timestampRaw) {
    return unauthorized('Missing wallet auth headers')
  }

  if (headerWallet !== normalizedWallet) {
    return unauthorized('Wallet header mismatch')
  }

  const timestamp = Number(timestampRaw)
  if (!isPublisherAuthTimestampValid(timestamp)) {
    return unauthorized('Auth signature expired')
  }

  const message = buildPublisherAuthMessage(normalizedWallet, timestamp)
  const isValid = await verifyMessage({
    address: normalizedWallet as `0x${string}`,
    message,
    signature: signature as `0x${string}`,
  })

  if (!isValid) {
    return unauthorized('Invalid wallet signature')
  }

  return null
}

// Get all sites for a publisher.
// No signature auth required — toSiteView strips apiSecret; only public fields are returned.
// Mutations (POST / PATCH / DELETE) still require verifyPublisherRequest.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const wallet = searchParams.get('wallet')

    if (!wallet) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 })
    }

    const publisher = await prisma.publisher.findFirst({ where: { wallet } })

    if (!publisher) {
      return NextResponse.json({ error: 'Publisher not found' }, { status: 404 })
    }

    const sites = await prisma.publisherSite.findMany({
      where: { publisherId: publisher.id },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ sites: sites.map(toSiteView) })
  } catch (error) {
    console.error('Error fetching publisher sites:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
    }, { status: 500 })
  }
}

// Add a new site
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<{
      wallet: string
      domain: string
      domainOrUrl: string
      pathPrefix: string
    }>
    const { wallet } = body
    const domainInput = body.domainOrUrl ?? body.domain

    if (!wallet || !domainInput) {
      return NextResponse.json({ error: 'Wallet and domainOrUrl are required' }, { status: 400 })
    }

    let host: string
    let pathPrefix: string
    try {
      const parsed = parseSiteInput(domainInput, body.pathPrefix)
      host = parsed.host
      pathPrefix = parsed.pathPrefix
    } catch {
      return NextResponse.json({ error: 'Invalid domainOrUrl' }, { status: 400 })
    }
    if (!host) {
      return NextResponse.json({ error: 'Invalid host in domainOrUrl' }, { status: 400 })
    }

    const authError = await verifyPublisherRequest(request, wallet)
    if (authError) return authError

    const [allSites, allPublishers] = await Promise.all([
      prisma.publisherSite.findMany(),
      prisma.publisher.findMany(),
    ])
    const publisherById = new Map(allPublishers.map((p) => [p.id, p] as const))
    const existingPublisher = await prisma.publisher.findFirst({ where: { wallet } })

    const overlappingSite = allSites.find((site) => {
      const siteHost = normalizeHost(String((site as { host?: string }).host ?? site.domain ?? ''))
      const sitePathPrefix = normalizePathPrefix(String((site as { pathPrefix?: string }).pathPrefix ?? '/'))
      return siteHost === host && isPathOverlap(sitePathPrefix, pathPrefix)
    })

    if (overlappingSite && overlappingSite.publisherId !== existingPublisher?.id) {
      const owner = publisherById.get(overlappingSite.publisherId)
      return NextResponse.json({
        error: 'Host/path already registered by another publisher',
        existing: {
          domain: overlappingSite.domain,
          host: normalizeHost(String((overlappingSite as { host?: string }).host ?? overlappingSite.domain ?? '')),
          pathPrefix: normalizePathPrefix(String((overlappingSite as { pathPrefix?: string }).pathPrefix ?? '/')),
          siteId: overlappingSite.siteId,
          publisherId: overlappingSite.publisherId,
          publisherWallet: owner?.wallet ?? null,
        }
      }, { status: 409 })
    }

    if (!existingPublisher) {
      const newPublisher = await prisma.publisher.create({
        data: { wallet, domain: host, verified: false, totalEarned: 0 },
      })

      const apiKey = generateApiKeyServer()
      const apiSecret = generateSecretServer()

      const newSite = await prisma.publisherSite.create({
        data: {
          publisherId: newPublisher.id,
          domain: host,
          host,
          pathPrefix,
          matchType: 'PREFIX',
          siteId: `site_${newPublisher.id}_0`,
          apiKey,
          apiSecret,
          verified: true,
        },
      })
      await prisma.publisher.update({ where: { id: newPublisher.id }, data: { verified: true } })

      return NextResponse.json({
        success: true,
        site: {
          ...toSiteView(newSite),
          apiSecret,
        }
      })
    }

    const sites = await prisma.publisherSite.findMany({ where: { publisherId: existingPublisher.id } })

    const existingSite = sites.find((site) => {
      const siteHost = normalizeHost(String((site as { host?: string }).host ?? site.domain ?? ''))
      const sitePathPrefix = normalizePathPrefix(String((site as { pathPrefix?: string }).pathPrefix ?? '/'))
      return siteHost === host && sitePathPrefix === pathPrefix
    })

    if (existingSite) {
      return NextResponse.json({
        error: 'Site already registered',
        site: {
          id: existingSite.id,
          domain: existingSite.domain,
          host: normalizeHost(String((existingSite as { host?: string }).host ?? existingSite.domain ?? '')),
          pathPrefix: normalizePathPrefix(String((existingSite as { pathPrefix?: string }).pathPrefix ?? '/')),
          siteId: existingSite.siteId,
          verified: existingSite.verified
        }
      }, { status: 409 })
    }

    const apiKey = generateApiKeyServer()
    const apiSecret = generateSecretServer()

    const siteCount = sites.length
    const newSite = await prisma.publisherSite.create({
      data: {
        publisherId: existingPublisher.id,
        domain: host,
        host,
        pathPrefix,
        matchType: 'PREFIX',
        siteId: `site_${existingPublisher.id}_${siteCount}`,
        apiKey,
        apiSecret,
        verified: true,
      },
    })
    await prisma.publisher.update({ where: { id: existingPublisher.id }, data: { verified: true } })

    return NextResponse.json({
      success: true,
      site: {
        ...toSiteView(newSite),
        apiSecret,
      }
    })
  } catch (error) {
    console.error('Error adding site:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
    }, { status: 500 })
  }
}

// Rotate API credentials for a site
export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<{ wallet: string; siteId: string }>
    const { wallet, siteId } = body

    if (!wallet || !siteId) {
      return NextResponse.json({ error: 'Wallet and siteId are required' }, { status: 400 })
    }

    const authError = await verifyPublisherRequest(request, wallet)
    if (authError) return authError

    const publisher = await prisma.publisher.findFirst({ where: { wallet } })
    if (!publisher) {
      return NextResponse.json({ error: 'Publisher not found' }, { status: 404 })
    }

    const site = await prisma.publisherSite.findFirst({ where: { id: siteId, publisherId: publisher.id } })
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 })
    }

    const apiKey = generateApiKeyServer()
    const apiSecret = generateSecretServer()
    await prisma.publisherSite.update({
      where: { id: siteId },
      data: { apiKey, apiSecret },
    })

    return NextResponse.json({
      success: true,
      site: {
        ...toSiteView(site),
        apiKey,
        apiSecret,
      },
    })
  } catch (error) {
    console.error('Error rotating site credentials:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Delete a site
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const siteId = searchParams.get('siteId')
    const wallet = searchParams.get('wallet')

    if (!siteId || !wallet) {
      return NextResponse.json({ error: 'Site ID and wallet are required' }, { status: 400 })
    }

    const authError = await verifyPublisherRequest(request, wallet)
    if (authError) return authError

    const publisher = await prisma.publisher.findFirst({ where: { wallet } })
    if (!publisher) {
      return NextResponse.json({ error: 'Publisher not found' }, { status: 404 })
    }

    const site = await prisma.publisherSite.findFirst({ where: { id: siteId, publisherId: publisher.id } })

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 })
    }

    await prisma.publisherSite.delete({ where: { id: siteId } })

    return NextResponse.json({ success: true, message: 'Site removed successfully' })
  } catch (error) {
    console.error('Error removing site:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
