import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { collections } from '@/lib/db'
import { TREASURY_ADDRESS } from '@/lib/treasury-tokens'
import { SUPPORTED_EXCHANGE_TOKENS } from '@/lib/treasury-tokens'

/**
 * POST - Record token → G$ exchange
 * 1 USDC/cUSD/USDT ($1) = 10,000 G$
 * Body: { wallet, amount, token, txHash? }
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

    // 1 token unit ($1) = 10,000 G$
    const gsPerUnit = tokenInfo.gsPerUnit ?? 10_000
    const gsReceived = amount * gsPerUnit

    const now = new Date()

    // Record exchange
    const exchangeDoc = {
      _id: randomUUID(),
      publisherId: publisher._id,
      wallet,
      fromToken: token,
      fromAmount: amount,
      gsReceived,
      tokenAddress: tokenInfo.address,
      txHash: txHash || undefined,
      status: 'completed' as const,
      createdAt: now,
      updatedAt: now
    }
    const exchangesCollection = await collections.exchanges()
    await exchangesCollection.insertOne(exchangeDoc)

    // Also record topup for balance (backward compat)
    const topupsCollection = await collections.topups()
    await topupsCollection.insertOne({
      _id: randomUUID(),
      publisherId: publisher._id,
      wallet,
      amount: gsReceived,
      token,
      tokenAddress: tokenInfo.address,
      txHash: txHash || undefined,
      status: 'approved',
      createdAt: now,
      updatedAt: now
    })

    await publishersCollection.updateOne(
      { _id: publisher._id },
      {
        $inc: { totalTopup: gsReceived },
        $set: { updatedAt: now }
      }
    )

    return NextResponse.json({
      success: true,
      exchangeId: exchangeDoc._id,
      fromToken: token,
      fromAmount: amount,
      gsReceived,
      treasuryAddress: TREASURY_ADDRESS,
      message: `${amount} ${token} → ${gsReceived} G$`
    })
  } catch (error) {
    console.error('Exchange error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Exchange failed' },
      { status: 500 }
    )
  }
}

/**
 * GET - Exchange history for publisher
 * ?wallet=0x...
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const wallet = searchParams.get('wallet')

    if (!wallet) {
      return NextResponse.json({ error: 'wallet required' }, { status: 400 })
    }

    const publishersCol = await collections.publishers()
    const publisher = await publishersCol.findOne({ wallet })
    if (!publisher) {
      return NextResponse.json({ error: 'Publisher not found' }, { status: 404 })
    }

    const exchangesCol = await collections.exchanges()
    const exchanges = await exchangesCol
      .find({ publisherId: publisher._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray()

    return NextResponse.json({
      exchanges: exchanges.map((e) => ({
        id: e._id,
        fromToken: e.fromToken,
        fromAmount: e.fromAmount,
        gsReceived: e.gsReceived,
        txHash: e.txHash,
        status: e.status,
        createdAt: e.createdAt
      }))
    })
  } catch (error) {
    console.error('Exchange history error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    )
  }
}
