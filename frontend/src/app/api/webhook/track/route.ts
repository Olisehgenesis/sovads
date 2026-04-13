import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decryptPayloadServer, verifySignatureServer } from '@/lib/crypto-server'
import { verifyTrackingToken } from '@/lib/tracking-token'

const EVENT_TYPES = ['IMPRESSION', 'CLICK'] as const
type EventType = (typeof EVENT_TYPES)[number]

type EncryptedRequest = {
  apiKey?: string
  encrypted?: string
  iv?: string
  signature?: string
  timestamp?: number
  siteId?: string
}

type SignedPayloadRequest = {
  apiKey?: string
  payload?: string | EventPayload
  signature?: string
  timestamp?: number
  siteId?: string
  trackingToken?: string
}

type EventPayload = {
  type?: EventType
  campaignId?: string
  adId?: string
  siteId?: string
  fingerprint?: string | null
  rendered?: boolean
  viewportVisible?: boolean
  renderTime?: number
  userAgent?: string
  walletAddress?: string
}

const getIp = (request: NextRequest): string =>
  request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  request.headers.get('x-real-ip') ||
  request.headers.get('cf-connecting-ip') ||
  request.headers.get('x-client-ip') ||
  'unknown'

const parseEventPayload = async (body: unknown, apiSecret: string): Promise<EventPayload | null> => {
  const signedBody = body as SignedPayloadRequest
  if (typeof signedBody.payload === 'string' && signedBody.signature && signedBody.timestamp) {
    const isValid = await verifySignatureServer(
      signedBody.payload,
      signedBody.signature,
      apiSecret,
      signedBody.timestamp
    )
    if (!isValid) {
      return null
    }
    return JSON.parse(signedBody.payload) as EventPayload
  }

  const encryptedBody = body as EncryptedRequest
  if (!encryptedBody.encrypted || !encryptedBody.iv || !encryptedBody.signature || !encryptedBody.timestamp) {
    return null
  }
  const isValid = await verifySignatureServer(
    encryptedBody.encrypted,
    encryptedBody.signature,
    apiSecret,
    encryptedBody.timestamp
  )
  if (!isValid) {
    return null
  }
  const decrypted = await decryptPayloadServer(encryptedBody.encrypted, encryptedBody.iv, apiSecret)
  return JSON.parse(decrypted) as EventPayload
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const tokenClaims = typeof (body as SignedPayloadRequest).trackingToken === 'string'
      ? verifyTrackingToken((body as SignedPayloadRequest).trackingToken as string)
      : null
    const {
      apiKey,
      timestamp,
      siteId: requestSiteId,
    } = body as SignedPayloadRequest

    if (!tokenClaims && (!apiKey || !timestamp || !requestSiteId)) {
      return NextResponse.json(
        { error: 'Missing required fields: apiKey, timestamp, siteId' },
        { status: 400 }
      )
    }

    const now = Date.now()
    if (!tokenClaims && Math.abs(now - Number(timestamp)) > 5 * 60 * 1000) {
      return NextResponse.json({ error: 'Request timestamp too old or too far in future' }, { status: 400 })
    }

    const [publisherSitesCollection, publishersCollection, campaignsCollection, eventsCollection] = [
      prisma.publisherSite,
      prisma.publisher,
      prisma.campaign,
      prisma.event,
    ]

    const site = tokenClaims
      ? await prisma.publisherSite.findFirst({ where: { siteId: tokenClaims.siteId } })
      : await prisma.publisherSite.findFirst({ where: { apiKey } })

    // Ghost-site mode: tracking token is cryptographically valid but site record was
    // lost from DB (e.g. after a data recovery). Allow tracking with half points so
    // publishers whose sites survived the data loss still earn. Reject only when there
    // is NO token at all (raw apiKey flow with no DB record = unknown caller).
    const isGhostSite = !site && !!tokenClaims

    if (!site && !isGhostSite) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }
    if (!tokenClaims && site && site.siteId !== requestSiteId) {
      return NextResponse.json({ error: 'Site ID mismatch' }, { status: 401 })
    }

    let eventPayload: EventPayload | null = null
    if (tokenClaims) {
      const rawPayload = (body as SignedPayloadRequest).payload
      if (typeof rawPayload === 'string') {
        eventPayload = JSON.parse(rawPayload) as EventPayload
      } else if (rawPayload && typeof rawPayload === 'object') {
        eventPayload = rawPayload as EventPayload
      }
      if (!eventPayload) {
        return NextResponse.json({ error: 'Missing payload for tracking token flow' }, { status: 400 })
      }
    } else {
      eventPayload = await parseEventPayload(body, site!.apiSecret)
      if (!eventPayload) {
        return NextResponse.json({ error: 'Invalid signature or payload' }, { status: 401 })
      }
    }

    const {
      type,
      campaignId,
      adId,
      siteId,
      fingerprint,
      rendered,
      viewportVisible,
      userAgent: payloadUserAgent,
      walletAddress: payloadWallet,
    } = eventPayload

    if (!type || !campaignId || !adId || !siteId) {
      return NextResponse.json({ error: 'Missing required event fields' }, { status: 400 })
    }

    // Resolve Identity
    const explicitWallet = payloadWallet?.toLowerCase() || tokenClaims?.walletAddress?.toLowerCase()
    let attributedWallet = explicitWallet

    if (!attributedWallet && fingerprint) {
      // Fallback: Check if device is linked to a wallet
      const mapping = await prisma.viewerPoints.findFirst({
        where: { fingerprint: fingerprint as string, wallet: { not: null } },
      })
      if (mapping) {
        attributedWallet = mapping.wallet as string
      }
    }

    // Security: Linkage Cooldown and Limits
    if (explicitWallet && fingerprint) {
      const existingMapping = await prisma.viewerPoints.findFirst({
        where: { fingerprint: fingerprint as string, wallet: { not: null } },
      })
      const nowTs = new Date()

      if (existingMapping && existingMapping.wallet !== explicitWallet) {
        const cooldownMs = 13 * 60 * 60 * 1000
        const lastChange = existingMapping.lastWalletChange ? new Date(existingMapping.lastWalletChange).getTime() : 0
        if (nowTs.getTime() - lastChange < cooldownMs) {
          return NextResponse.json({ error: 'Device linkage cooldown in effect' }, { status: 403 })
        }
      }

      // Check wallet device quota (max 10)
      const linkedDevicesCount = await prisma.viewerPoints.count({ where: { wallet: explicitWallet } })
      if (linkedDevicesCount >= 10 && (!existingMapping || existingMapping.wallet !== explicitWallet)) {
        return NextResponse.json({ error: 'Wallet device quota exceeded' }, { status: 403 })
      }
    }
    if (!EVENT_TYPES.includes(type)) {
      return NextResponse.json({ error: 'Invalid event type' }, { status: 400 })
    }
    // For ghost sites (site not in DB but valid token) skip the DB siteId check
    if (!isGhostSite && siteId !== site!.siteId) {
      return NextResponse.json({ error: 'Payload site ID mismatch' }, { status: 401 })
    }
    if (tokenClaims) {
      if (tokenClaims.siteId !== siteId || tokenClaims.campaignId !== campaignId || tokenClaims.adId !== adId) {
        return NextResponse.json({ error: 'Tracking token claims mismatch' }, { status: 401 })
      }
    }

    const campaign = await prisma.campaign.findFirst({ where: { id: campaignId } })
    if (!campaign || !campaign.active) {
      return NextResponse.json({ error: 'Campaign not found or inactive' }, { status: 404 })
    }

    const duplicateWindow = type === 'IMPRESSION' ? 60 * 1000 : 5 * 60 * 1000
    const duplicateWindowStart = new Date(Date.now() - duplicateWindow)
    const existingEvent = await prisma.event.findFirst({
      where: {
        type,
        campaignId,
        adId,
        siteId,
        ...(fingerprint ? { fingerprint } : {}),
        timestamp: { gte: duplicateWindowStart },
      },
    })
    if (existingEvent) {
      return NextResponse.json({ error: 'Duplicate event detected', eventId: existingEvent.id }, { status: 409 })
    }

    const oneHourAgo = new Date(Date.now() - 3600 * 1000)
    const recentEvents = await prisma.event.count({
      where: { type, campaignId, siteId, timestamp: { gte: oneHourAgo } },
    })
    if (recentEvents > 100) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    // High-Granularity Velocity Limits (Anti-Farming)
    if (fingerprint) {
      const perDeviceWindow = type === 'IMPRESSION' ? 60 * 1000 : 24 * 60 * 60 * 1000
      const maxPerDevice = type === 'IMPRESSION' ? 1 : 100
      const deviceRecentEvents = await prisma.event.count({
        where: { fingerprint, type, timestamp: { gte: new Date(Date.now() - perDeviceWindow) } },
      })
      if (deviceRecentEvents >= maxPerDevice) {
        return NextResponse.json({ error: `Velocity limit exceeded for this device (${type})` }, { status: 429 })
      }
    }

    const publisher = site ? await prisma.publisher.findFirst({ where: { id: site.publisherId } }) : null
    const resolvedSiteId = site?.siteId ?? tokenClaims?.siteId ?? siteId
    const resolvedSiteDbId = site?.id ?? resolvedSiteId
    const eventDoc = await prisma.event.create({
      data: {
        type,
        campaignId,
        publisherId: publisher?.id ?? site?.publisherId ?? 'ghost',
        siteId: resolvedSiteId,
        adId,
        ipAddress: getIp(request),
        userAgent: payloadUserAgent ?? (request.headers.get('user-agent') || 'unknown'),
        fingerprint: fingerprint || undefined,
        viewerWallet: attributedWallet || undefined,
        verified: rendered === true && viewportVisible !== false,
        publisherSiteId: resolvedSiteDbId,
      },
    })

    if (type === 'CLICK') {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { spent: { increment: campaign.cpc } },
      })
    }

    ; (async () => {
      try {
        if (!fingerprint && !attributedWallet) return
        // Ghost sites (DB record lost) earn half points as a grace period
        const points = isGhostSite
          ? (type === 'CLICK' ? 3 : 1)
          : (type === 'CLICK' ? 5 : 1)
        const nowTs = new Date()

        // 1. Update/Create Identity Mapping
        let viewer = attributedWallet
          ? await prisma.viewerPoints.findFirst({ where: { wallet: attributedWallet as string } })
          : await prisma.viewerPoints.findFirst({
              where: { fingerprint: fingerprint as string, wallet: null },
            })

        if (!viewer) {
          viewer = await prisma.viewerPoints.create({
            data: {
              wallet: attributedWallet || null,
              fingerprint: fingerprint || 'unknown',
              totalPoints: points,
              claimedPoints: 0,
              pendingPoints: points,
              lastInteraction: nowTs,
              linkedDevices: fingerprint ? [fingerprint] : [],
            },
          })

          // If a guest/fingerprint record already exists, merge it into the new wallet record.
          if (explicitWallet && fingerprint) {
            const anonRecord = await prisma.viewerPoints.findFirst({
              where: { fingerprint: fingerprint as string, wallet: null },
            })

            if (anonRecord && anonRecord.id !== viewer.id) {
              await prisma.viewerPoints.update({
                where: { id: viewer.id },
                data: {
                  totalPoints: { increment: anonRecord.totalPoints },
                  pendingPoints: { increment: anonRecord.pendingPoints },
                  claimedPoints: { increment: anonRecord.claimedPoints },
                  linkedDevices: {
                    push: fingerprint,
                  },
                },
              })
              await prisma.viewerPoints.delete({ where: { id: anonRecord.id } })
            }
          }
        } else {
          const dataUpdate: any = {
            totalPoints: { increment: points },
            pendingPoints: { increment: points },
            lastInteraction: nowTs,
          }

          if (explicitWallet) {
            dataUpdate.wallet = explicitWallet
            dataUpdate.lastWalletChange = nowTs
            // Add fingerprint to linkedDevices (deduplicated)
            if (fingerprint && !viewer.linkedDevices.includes(fingerprint)) {
              dataUpdate.linkedDevices = { push: fingerprint }
            }

            // Merge Logic: merge anonymous record into wallet record
            if (viewer.wallet === explicitWallet) {
              const anonRecord = await prisma.viewerPoints.findFirst({
                where: { fingerprint: fingerprint as string, wallet: null },
              })

              if (anonRecord && anonRecord.id !== viewer.id) {
                dataUpdate.totalPoints = { increment: points + (anonRecord.totalPoints || 0) }
                dataUpdate.pendingPoints = { increment: points + (anonRecord.pendingPoints || 0) }
                await prisma.viewerPoints.delete({ where: { id: anonRecord.id } })
              }
            }
          }

          await prisma.viewerPoints.update({ where: { id: viewer.id }, data: dataUpdate })
        }

        // 2. Insert Reward Record
        await prisma.viewerReward.create({
          data: {
            viewerId: viewer.id,
            wallet: attributedWallet || undefined,
            fingerprint,
            type,
            campaignId,
            adId,
            siteId,
            points,
            claimed: false,
          },
        })

        // 3. Award Commission to Publisher
        if (publisher && publisher.wallet) {
          const publisherWallet = publisher.wallet.toLowerCase()
          const commissionPoints = type === 'CLICK' ? 5 : 1

          let pubViewer = await prisma.viewerPoints.findFirst({ where: { wallet: publisherWallet } })
          if (!pubViewer) {
            pubViewer = await prisma.viewerPoints.create({
              data: {
                wallet: publisherWallet,
                fingerprint: publisherWallet,
                totalPoints: commissionPoints,
                claimedPoints: 0,
                pendingPoints: commissionPoints,
                lastInteraction: nowTs,
              },
            })
          } else {
            await prisma.viewerPoints.update({
              where: { id: pubViewer.id },
              data: {
                totalPoints: { increment: commissionPoints },
                pendingPoints: { increment: commissionPoints },
                lastInteraction: nowTs,
              },
            })
          }

          // Add reward record for publisher too
          await prisma.viewerReward.create({
            data: {
              viewerId: pubViewer.id,
              wallet: publisherWallet,
              type: `${type}_COMMISSION`,
              campaignId,
              adId,
              siteId,
              points: commissionPoints,
              claimed: false,
            },
          })
        }
      } catch (error) {
        console.error('Error awarding viewer points:', error)
      }
    })()

    return NextResponse.json({ success: true, eventId: eventDoc.id })
  } catch (error) {
    console.error('Error in webhook track:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
