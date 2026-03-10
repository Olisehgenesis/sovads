import { NextRequest, NextResponse } from 'next/server'
import { collections } from '@/lib/db'
import { isWalletAdmin, verifyAdminSignature } from '@/lib/admin'

export async function POST(request: NextRequest) {
    try {
        const { adminWallet, signature, message, publisherId, verified } = await request.json()

        if (!adminWallet || !isWalletAdmin(adminWallet)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const isValid = await verifyAdminSignature(adminWallet, message, signature)
        if (!isValid) {
            return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
        }

        const publishersCollection = await collections.publishers()
        const result = await publishersCollection.updateOne(
            { _id: publisherId },
            { $set: { verified: Boolean(verified), updatedAt: new Date() } }
        )

        if (result.matchedCount === 0) {
            return NextResponse.json({ error: 'Publisher not found' }, { status: 404 })
        }

        return NextResponse.json({ success: true }, { status: 200 })
    } catch (error) {
        console.error('Admin verify publisher error:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
