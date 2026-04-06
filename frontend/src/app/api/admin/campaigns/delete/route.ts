import { NextRequest, NextResponse } from 'next/server'
import { collections } from '@/lib/db'
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

    const campaignsCollection = await collections.campaigns()
    const campaign = await campaignsCollection.findOne({ _id: campaignId })
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    await campaignsCollection.updateOne(
      { _id: campaignId },
      { $set: { active: false, deleted: true, updatedAt: new Date() } }
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin delete campaign error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
