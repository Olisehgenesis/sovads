import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { collections } from '@/lib/db'
import { decryptPayloadServer, verifySignatureServer } from '@/lib/crypto-server'
import { verifyTrackingToken } from '@/lib/tracking-token'
import type { Event } from '@/lib/models'

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

    const [publisherSitesCollection, publishersCollection, campaignsCollection, eventsCollection] = await Promise.all([
      collections.publisherSites(),
      collections.publishers(),
      collections.campaigns(),
      collections.events(),
    ])

    const site = tokenClaims
      ? await publisherSitesCollection.findOne({ siteId: tokenClaims.siteId })
      : await publisherSitesCollection.findOne({ apiKey })

    if (!site) {
      return NextResponse.json({ error: tokenClaims ? 'Invalid tracking token site' : 'Invalid API key' }, { status: 401 })
    }
    if (!tokenClaims && site.siteId !== requestSiteId) {
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
      eventPayload = await parseEventPayload(body, site.apiSecret)
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
    const explicitWallet = payloadWallet || tokenClaims?.walletAddress
    let attributedWallet = explicitWallet
    const viewerPointsCollection = await collections.viewerPoints()

    if (!attributedWallet && fingerprint) {
      // Fallback: Check if device is linked to a wallet
      const mapping = await viewerPointsCollection.findOne({
        fingerprint: fingerprint as string,
        wallet: { $ne: null }
      })
      if (mapping) {
        attributedWallet = mapping.wallet as string
      }
    }

    // Security: Linkage Cooldown and Limits
    if (explicitWallet && fingerprint) {
      const existingMapping = await viewerPointsCollection.findOne({
        fingerprint: fingerprint as string,
        wallet: { $ne: null }
      })
      const nowTs = new Date()

      if (existingMapping && existingMapping.wallet !== explicitWallet) {
        const cooldownMs = 13 * 60 * 60 * 1000 // 13 hours
        const lastChange = existingMapping.lastWalletChange ? new Date(existingMapping.lastWalletChange).getTime() : 0
        if (nowTs.getTime() - lastChange < cooldownMs) {
          // Block rotating wallets too fast on one device
          return NextResponse.json({ error: 'Device linkage cooldown in effect' }, { status: 403 })
        }
      }

      // Check wallet device quota (max 10)
      const linkedDevicesCount = await viewerPointsCollection.countDocuments({ wallet: explicitWallet })
      if (linkedDevicesCount >= 10 && (!existingMapping || existingMapping.wallet !== explicitWallet)) {
        return NextResponse.json({ error: 'Wallet device quota exceeded' }, { status: 403 })
      }
    }
    if (!EVENT_TYPES.includes(type)) {
      return NextResponse.json({ error: 'Invalid event type' }, { status: 400 })
    }
    if (siteId !== site.siteId) {
      return NextResponse.json({ error: 'Payload site ID mismatch' }, { status: 401 })
    }
    if (tokenClaims) {
      if (tokenClaims.siteId !== siteId || tokenClaims.campaignId !== campaignId || tokenClaims.adId !== adId) {
        return NextResponse.json({ error: 'Tracking token claims mismatch' }, { status: 401 })
      }
    }

    const campaign = await campaignsCollection.findOne({ _id: campaignId })
    if (!campaign || !campaign.active) {
      return NextResponse.json({ error: 'Campaign not found or inactive' }, { status: 404 })
    }

    const duplicateWindow = type === 'IMPRESSION' ? 60 * 1000 : 5 * 60 * 1000
    const duplicateWindowStart = new Date(Date.now() - duplicateWindow)
    const existingEvent = await eventsCollection.findOne({
      type,
      campaignId,
      adId,
      siteId,
      ...(fingerprint ? { fingerprint } : {}),
      timestamp: { $gte: duplicateWindowStart },
    })
    if (existingEvent) {
      return NextResponse.json({ error: 'Duplicate event detected', eventId: existingEvent._id }, { status: 409 })
    }

    const oneHourAgo = new Date(Date.now() - 3600 * 1000)
    const recentEvents = await eventsCollection.countDocuments({
      type,
      campaignId,
      siteId,
      timestamp: { $gte: oneHourAgo },
    })
    if (recentEvents > 100) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    // High-Granularity Velocity Limits (Anti-Farming)
    if (fingerprint) {
      const perDeviceWindow = type === 'IMPRESSION' ? 60 * 1000 : 24 * 60 * 60 * 1000
      const maxPerDevice = type === 'IMPRESSION' ? 1 : 100
      const deviceRecentEvents = await eventsCollection.countDocuments({
        fingerprint,
        type,
        timestamp: { $gte: new Date(Date.now() - perDeviceWindow) }
      })
      if (deviceRecentEvents >= maxPerDevice) {
        return NextResponse.json({ error: `Velocity limit exceeded for this device (${type})` }, { status: 429 })
      }
    }

    const publisher = await publishersCollection.findOne({ _id: site.publisherId })
    const eventDoc: Event = {
      _id: randomUUID(),
      type,
      campaignId,
      publisherId: publisher?._id ?? site.publisherId,
      siteId: site.siteId,
      adId,
      ipAddress: getIp(request),
      userAgent: payloadUserAgent ?? (request.headers.get('user-agent') || 'unknown'),
      ...(fingerprint ? { fingerprint } : {}),
      viewerWallet: attributedWallet || undefined,
      verified: rendered === true && viewportVisible !== false,
      publisherSiteId: site._id,
      timestamp: new Date(),
    }

    await eventsCollection.insertOne(eventDoc)

    if (type === 'CLICK') {
      await campaignsCollection.updateOne(
        { _id: campaignId },
        { $inc: { spent: campaign.cpc }, $set: { updatedAt: new Date() } }
      )
    }

    ; (async () => {
      try {
        if (!fingerprint && !attributedWallet) return
        const [vPointsCollection, viewerRewardsCollection] = await Promise.all([
          collections.viewerPoints(),
          collections.viewerRewards(),
        ])
        const points = type === 'CLICK' ? 5 : 1
        const nowTs = new Date()

        // 1. Update/Create Identity Mapping
        let viewer = attributedWallet
          ? await vPointsCollection.findOne({ wallet: attributedWallet as string })
          : await vPointsCollection.findOne({
            fingerprint: fingerprint as string,
            wallet: { $eq: null }
          } as any)

        if (!viewer) {
          viewer = {
            _id: randomUUID(),
            wallet: attributedWallet || null,
            fingerprint: fingerprint || 'unknown',
            totalPoints: points,
            claimedPoints: 0,
            pendingPoints: points,
            lastInteraction: nowTs,
            linkedDevices: fingerprint ? [fingerprint] : [],
            createdAt: nowTs,
            updatedAt: nowTs,
          }
          await vPointsCollection.insertOne(viewer)
        } else {
          const update: any = {
            $inc: { totalPoints: points, pendingPoints: points },
            $set: { lastInteraction: nowTs, updatedAt: nowTs }
          }

          if (explicitWallet) {
            update.$set.wallet = explicitWallet
            update.$set.lastWalletChange = nowTs
            update.$addToSet = { linkedDevices: fingerprint }
          }

          await vPointsCollection.updateOne({ _id: viewer._id }, update)
        }

        // 2. Insert Reward Record
        await viewerRewardsCollection.insertOne({
          _id: randomUUID(),
          viewerId: viewer._id,
          wallet: attributedWallet || undefined,
          fingerprint,
          type,
          campaignId,
          adId,
          siteId,
          points,
          claimed: false,
          timestamp: nowTs,
        } as any)
      } catch (error) {
        console.error('Error awarding viewer points:', error)
      }
    })()

    return NextResponse.json({ success: true, eventId: eventDoc._id })
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
