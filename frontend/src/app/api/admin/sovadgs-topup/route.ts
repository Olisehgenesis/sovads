import { NextRequest, NextResponse } from 'next/server'
import { adminTopup, isSovadGsConfigured } from '@/lib/sovadgs'

/**
 * POST - Admin topup: deposit G$ from admin wallet into SovadGs contract
 * Body: { amount }
 */
export async function POST(request: NextRequest) {
  try {
    if (!isSovadGsConfigured) {
      return NextResponse.json(
        { error: 'SOVADGS_PAYOUT_PRIVATE_KEY not configured' },
        { status: 503 }
      )
    }

    const body = await request.json()
    const { amount } = body as { amount?: number }

    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { error: 'amount (positive number) required' },
        { status: 400 }
      )
    }

    const txHash = await adminTopup(amount)

    return NextResponse.json({
      success: true,
      txHash,
      amount,
      message: `${amount} G$ deposited into SovadGs`
    })
  } catch (error) {
    console.error('Admin topup error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Admin topup failed' },
      { status: 500 }
    )
  }
}
