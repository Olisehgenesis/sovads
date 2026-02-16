import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { collections } from '@/lib/db'
import { payoutG$, getTreasuryBalance, isSovadGsConfigured } from '@/lib/sovadgs'

/**
 * POST - Request G$ withdrawal (1 SovPoint = 1 G$)
 * Body: { wallet, amount }
 */
export async function POST(request: NextRequest) {
  try {
    if (!isSovadGsConfigured) {
      return NextResponse.json(
        { error: 'G$ payouts not configured' },
        { status: 503 }
      )
    }

    const body = await request.json()
    const { wallet, amount } = body as { wallet?: string; amount?: number }

    if (!wallet || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { error: 'wallet and amount (positive number) required' },
        { status: 400 }
      )
    }

    const publishersCollection = await collections.publishers()
    const publisher = await publishersCollection.findOne({ wallet })

    if (!publisher) {
      return NextResponse.json({ error: 'Publisher not found' }, { status: 404 })
    }

    // Available = earnings + topups - withdrawn
    const eventsCollection = await collections.events()
    const campaignsCollection = await collections.campaigns()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 365)

    const events = await eventsCollection
      .find({
        publisherId: publisher._id,
        type: 'CLICK',
        timestamp: { $gte: startDate }
      })
      .toArray()

    const campaignIds = [...new Set(events.map((e) => e.campaignId))]
    const campaigns = await campaignsCollection
      .find({ _id: { $in: campaignIds } })
      .project({ cpc: 1 })
      .toArray()

    const cpcMap = new Map(campaigns.map((c) => [c._id, c.cpc ?? 0]))
    const earnings = events.reduce(
      (sum, e) => sum + (cpcMap.get(e.campaignId) ?? 0),
      0
    )

    const totalTopup = publisher.totalTopup ?? 0
    const totalWithdrawn = publisher.totalWithdrawn ?? 0
    const available = Math.max(0, earnings + totalTopup - totalWithdrawn)

    if (amount > available) {
      return NextResponse.json(
        { error: `Insufficient balance. Available: ${available.toFixed(2)} G$` },
        { status: 400 }
      )
    }

    const treasuryBalance = await getTreasuryBalance()
    if (amount > treasuryBalance) {
      return NextResponse.json(
        { error: 'Treasury insufficient. Try again later.' },
        { status: 503 }
      )
    }

    const txHash = await payoutG$(wallet, amount)

    await collections.withdrawals().insertOne({
      _id: randomUUID(),
      publisherId: publisher._id,
      wallet,
      amount,
      txHash,
      status: 'completed',
      createdAt: new Date(),
      updatedAt: new Date()
    })

    await publishersCollection.updateOne(
      { _id: publisher._id },
      {
        $inc: { totalWithdrawn: amount },
        $set: { updatedAt: new Date() }
      }
    )

    return NextResponse.json({
      success: true,
      txHash,
      amount,
      message: `${amount} G$ sent to ${wallet}`
    })
  } catch (error) {
    console.error('Withdraw error:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Withdrawal failed'
      },
      { status: 500 }
    )
  }
}

/**
 * GET - Treasury balance and config status
 */
export async function GET() {
  try {
    const balance = await getTreasuryBalance()
    return NextResponse.json({
      treasuryBalance: balance,
      configured: isSovadGsConfigured
    })
  } catch {
    return NextResponse.json({
      treasuryBalance: 0,
      configured: false
    })
  }
}
