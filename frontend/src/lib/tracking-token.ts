import { createHmac, timingSafeEqual } from 'crypto'

type TrackingTokenClaims = {
  adId: string
  campaignId: string
  siteId: string
  exp: number
  placement?: string
  size?: string
}

const secret = process.env.TRACKING_TOKEN_SECRET || 'dev-tracking-secret-change-me'

function toBase64Url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

function fromBase64Url(input: string): Buffer {
  return Buffer.from(input, 'base64url')
}

function sign(payloadB64: string): string {
  return toBase64Url(createHmac('sha256', secret).update(payloadB64).digest())
}

export function createTrackingToken(claims: TrackingTokenClaims): string {
  const payloadB64 = toBase64Url(JSON.stringify(claims))
  const sig = sign(payloadB64)
  return `${payloadB64}.${sig}`
}

export function verifyTrackingToken(token: string): TrackingTokenClaims | null {
  try {
    const [payloadB64, sig] = token.split('.')
    if (!payloadB64 || !sig) return null
    const expectedSig = sign(payloadB64)
    const sigBuf = fromBase64Url(sig)
    const expectedBuf = fromBase64Url(expectedSig)
    if (sigBuf.length !== expectedBuf.length) return null
    if (!timingSafeEqual(sigBuf, expectedBuf)) return null
    const claims = JSON.parse(fromBase64Url(payloadB64).toString('utf8')) as TrackingTokenClaims
    if (!claims.adId || !claims.campaignId || !claims.siteId || !claims.exp) return null
    if (Date.now() > claims.exp) return null
    return claims
  } catch {
    return null
  }
}
