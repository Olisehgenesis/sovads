import { NextRequest, NextResponse } from 'next/server'
import { isAddress } from 'viem'

// GoodDollar's official gas faucet endpoint
const GD_FAUCET_URL = 'https://goodserver.gooddollar.org/verify/topWallet'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { account } = body as { chainId?: number; account?: string }

    if (!account || !isAddress(account)) {
      return NextResponse.json({ ok: -1, error: 'Invalid account address' }, { status: 400 })
    }

    // Proxy to GoodDollar's faucet — same request shape, same response shape
    const res = await fetch(GD_FAUCET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chainId: 42220, account }),
    })

    const data = await res.json().catch(() => ({ ok: -1, error: 'Invalid faucet response' }))
    return NextResponse.json(data, { status: res.ok ? 200 : res.status })
  } catch (err) {
    console.error('[topWallet] error:', err)
    return NextResponse.json(
      { ok: -1, error: err instanceof Error ? err.message : 'Faucet unreachable' },
      { status: 500 }
    )
  }
}

