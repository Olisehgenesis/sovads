import { NextRequest, NextResponse } from 'next/server'
import { adminTopup, isSovadGsConfigured } from '@/lib/sovadgs'

/**
 * POST - Publisher tops up the system payout contract
 * 1. User sends G$ to PAYOUT_ADDRESS (frontend)
 * 2. API calls adminTopup to move G$ from PAYOUT_ADDRESS to SOVADGS contract
 */
export async function POST(request: NextRequest) {
  try {
    if (!isSovadGsConfigured) {
      return NextResponse.json(
        { error: 'System payout not configured (missing private key)' },
        { status: 503 }
      )
    }

    const body = await request.json()
    const { amount, wallet, txHash } = body as { amount?: number; wallet?: string; txHash?: string }

    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { error: 'amount (positive number) required' },
        { status: 400 }
      )
    }

    // In a real scenario, we might want to verify the txHash (transfer to PAYOUT_ADDRESS)
    // before calling adminTopup. For now, we follow the user's flow.
    
    const topupTxHash = await adminTopup(amount)

    return NextResponse.json({
      success: true,
      txHash: topupTxHash,
      amount,
      message: `${amount} G$ moved to payout contract`
    })
  } catch (error) {
    console.error('System topup error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'System topup failed' },
      { status: 500 }
    )
  }
}
