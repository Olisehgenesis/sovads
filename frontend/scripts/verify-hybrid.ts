import { createTrackingToken, verifyTrackingToken } from '../src/lib/tracking-token'

async function test() {
    console.log('--- Testing Tracking Token with Wallet ---')
    const claims = {
        adId: 'test-ad',
        campaignId: 'test-campaign',
        siteId: 'test-site',
        exp: Date.now() + 10000,
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678'
    }

    const token = createTrackingToken(claims)
    console.log('Token created:', token)

    const verified = verifyTrackingToken(token)
    if (verified && verified.walletAddress === claims.walletAddress) {
        console.log('✅ Token verification successful with wallet address')
    } else {
        console.log('❌ Token verification failed')
        process.exit(1)
    }
}

test().catch(console.error)
