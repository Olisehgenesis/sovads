import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyAdminSignature } from '@/lib/admin'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { campaignId, adminWallet, signature, message } = body as {
      campaignId: string
      adminWallet: string
      signature: string
      message: string
    }

    if (!campaignId || !adminWallet || !signature || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const isValid = await verifyAdminSignature(adminWallet, message, signature)
    if (!isValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const campaign = await prisma.campaign.findFirst({ where: { id: campaignId } })
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { active: false },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin delete campaign error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
