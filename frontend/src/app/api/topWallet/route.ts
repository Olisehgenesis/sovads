import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, createWalletClient, http, isAddress, parseEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { celo } from 'viem/chains'

// Minimum CELO balance to consider "sufficient" (0.005 CELO covers ~10 txns)
const MIN_BALANCE = parseEther('0.005')
// Amount to top up with if below threshold (0.01 CELO)
const TOP_UP_AMOUNT = parseEther('0.01')

const celoClient = createPublicClient({
  chain: celo,
  transport: http(
    (process.env.CELO_MAINNET_RPC_URL || 'https://forno.celo.org').trim()
  ),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { account } = body as { chainId?: number; account?: string }

    if (!account || !isAddress(account)) {
      return NextResponse.json({ ok: -1, error: 'Invalid account address' }, { status: 400 })
    }

    // Check recipient balance
    const balance = await celoClient.getBalance({ address: account as `0x${string}` })
    if (balance >= MIN_BALANCE) {
      // Already has enough gas
      return NextResponse.json({ ok: 0 })
    }

    // Need private key for faucet wallet
    const faucetKey = (process.env.SOVADS_OPERATOR_PRIVATE_KEY || '').trim() as `0x${string}`
    if (!faucetKey || faucetKey === '0x') {
      return NextResponse.json({ ok: -1, error: 'Faucet not configured' }, { status: 500 })
    }

    const faucetAccount = privateKeyToAccount(faucetKey)

    // Check faucet balance to avoid draining it
    const faucetBalance = await celoClient.getBalance({ address: faucetAccount.address })
    if (faucetBalance < TOP_UP_AMOUNT + parseEther('0.002')) {
      return NextResponse.json({ ok: -1, error: 'Faucet depleted' }, { status: 503 })
    }

    const walletClient = createWalletClient({
      account: faucetAccount,
      chain: celo,
      transport: http(
        (process.env.CELO_MAINNET_RPC_URL || 'https://forno.celo.org').trim()
      ),
    })

    const txHash = await walletClient.sendTransaction({
      to: account as `0x${string}`,
      value: TOP_UP_AMOUNT,
    })

    return NextResponse.json({ ok: 1, txHash })
  } catch (err) {
    console.error('[topWallet] error:', err)
    return NextResponse.json(
      { ok: -1, error: err instanceof Error ? err.message : 'Faucet error' },
      { status: 500 }
    )
  }
}
