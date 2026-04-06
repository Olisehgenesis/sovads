import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
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

        const existing = await prisma.publisher.findFirst({ where: { id: publisherId } })
        if (!existing) {
            return NextResponse.json({ error: 'Publisher not found' }, { status: 404 })
        }

        await prisma.publisher.update({
            where: { id: publisherId },
            data: { verified: Boolean(verified) },
        })

        return NextResponse.json({ success: true }, { status: 200 })
    } catch (error) {
        console.error('Admin verify publisher error:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
