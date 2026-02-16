import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { collections } from '@/lib/db'
import { TREASURY_ADDRESS } from '@/lib/treasury-tokens'
import { SUPPORTED_EXCHANGE_TOKENS } from '@/lib/treasury-tokens'

/**
 * POST - Record a topup (user sent tokens to treasury)
 * Body: { wallet, amount, token, txHash? }
 * token: 'cUSD' | 'USDC'
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { wallet, amount, token, txHash } = body as {
      wallet?: string
      amount?: number
      token?: string
      txHash?: string
    }

    if (!wallet || typeof amount !== 'number' || amount <= 0 || !token) {
      return NextResponse.json(
        { error: 'wallet, amount (positive), and token required' },
        { status: 400 }
      )
    }

    const tokenInfo = SUPPORTED_EXCHANGE_TOKENS.find((t) => t.symbol === token)
    if (!tokenInfo) {
      return NextResponse.json(
        { error: `Unsupported token. Use: ${SUPPORTED_EXCHANGE_TOKENS.map((t) => t.symbol).join(', ')}` },
        { status: 400 }
      )
    }

    const publishersCollection = await collections.publishers()
    const publisher = await publishersCollection.findOne({ wallet })

    if (!publisher) {
      return NextResponse.json({ error: 'Publisher not found' }, { status: 404 })
    }

    const gsPerUnit = tokenInfo.gsPerUnit ?? 10_000
    const gsReceived = amount * gsPerUnit

    const topupsCollection = await collections.topups()
    const now = new Date()
    const topupDoc = {
      _id: randomUUID(),
      publisherId: publisher._id,
      wallet,
      amount,
      token,
      tokenAddress: tokenInfo.address,
      gsReceived,
      txHash: txHash || undefined,
      status: 'approved' as const,
      createdAt: now,
      updatedAt: now
    }
    await topupsCollection.insertOne(topupDoc)

    await publishersCollection.updateOne(
      { _id: publisher._id },
      {
        $inc: { totalTopup: gsReceived },
        $set: { updatedAt: now }
      }
    )

    return NextResponse.json({
      success: true,
      topupId: topupDoc._id,
      amount,
      token,
      gsReceived,
      treasuryAddress: TREASURY_ADDRESS,
      message: `Topup: ${amount} ${token} → ${gsReceived} G$`
    })
  } catch (error) {
    console.error('Topup error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Topup failed' },
      { status: 500 }
    )
  }
}
