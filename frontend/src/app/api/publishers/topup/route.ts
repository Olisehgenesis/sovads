import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
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

    const publisher = await prisma.publisher.findFirst({ where: { wallet } })

    if (!publisher) {
      return NextResponse.json({ error: 'Publisher not found' }, { status: 404 })
    }

    const gsPerUnit = tokenInfo.gsPerUnit ?? 10_000
    const gsReceived = amount * gsPerUnit

    const topup = await prisma.topup.create({
      data: {
        publisherId: publisher.id,
        wallet,
        amount,
        token,
        tokenAddress: tokenInfo.address,
        gsReceived,
        txHash: txHash || undefined,
        status: 'approved',
      },
    })

    await prisma.publisher.update({
      where: { id: publisher.id },
      data: { totalTopup: { increment: gsReceived } },
    })

    return NextResponse.json({
      success: true,
      topupId: topup.id,
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
