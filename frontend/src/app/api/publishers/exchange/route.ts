import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
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

    const publisher = await prisma.publisher.findFirst({ where: { wallet } })

    if (!publisher) {
      return NextResponse.json({ error: 'Publisher not found' }, { status: 404 })
    }

    // 1 token unit ($1) = 10,000 G$
    const gsPerUnit = tokenInfo.gsPerUnit ?? 10_000
    const gsReceived = amount * gsPerUnit

    const [exchange] = await prisma.$transaction([
      prisma.exchange.create({
        data: {
          publisherId: publisher.id,
          wallet,
          fromToken: token,
          fromAmount: amount,
          gsReceived,
          tokenAddress: tokenInfo.address,
          txHash: txHash || undefined,
          status: 'completed',
        },
      }),
      prisma.topup.create({
        data: {
          publisherId: publisher.id,
          wallet,
          amount: gsReceived,
          token,
          tokenAddress: tokenInfo.address,
          txHash: txHash || undefined,
          status: 'approved',
        },
      }),
      prisma.publisher.update({
        where: { id: publisher.id },
        data: { totalTopup: { increment: gsReceived } },
      }),
    ])

    return NextResponse.json({
      success: true,
      exchangeId: exchange.id,
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

    const publisher = await prisma.publisher.findFirst({ where: { wallet } })
    if (!publisher) {
      return NextResponse.json({ error: 'Publisher not found' }, { status: 404 })
    }

    const exchanges = await prisma.exchange.findMany({
      where: { publisherId: publisher.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({
      exchanges: exchanges.map((e) => ({
        id: e.id,
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

/**
 * POST - Record token → G$ exchange
 * 1 USDC/cUSD/USDT ($1) = 10,000 G$
 * Body: { wallet, amount, token, txHash? }
 */
