import { NextRequest, NextResponse } from 'next/server'
import { createWalletClient, createPublicClient, http, isAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { celo } from 'viem/chains'
import { prisma } from '@/lib/prisma'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

const APP_PRIVATE_KEY = process.env.ENGAGEMENT_REWARDS_APP_PRIVATE_KEY as `0x${string}`
const APP_ADDRESS = (process.env.ENGAGEMENT_REWARDS_APP_ADDRESS || '') as `0x${string}`
const REWARDS_CONTRACT = (process.env.ENGAGEMENT_REWARDS_CONTRACT || '0x25db74CF4E7BA120526fd87e159CF656d94bAE43') as `0x${string}`

// EIP-712 typed data for AppClaim (matches SDK's prepareAppSignature exactly)
function buildAppClaimTypedData(app: `0x${string}`, user: `0x${string}`, validUntilBlock: bigint) {
  return {
    domain: {
      name: 'EngagementRewards',
      version: '1.0',
      chainId: celo.id, // 42220
      verifyingContract: REWARDS_CONTRACT,
    },
    types: {
      AppClaim: [
        { name: 'app', type: 'address' },
        { name: 'user', type: 'address' },
        { name: 'validUntilBlock', type: 'uint256' },
      ],
    },
    primaryType: 'AppClaim' as const,
    message: { app, user, validUntilBlock },
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { user, validUntilBlock, inviter } = body

    // Input validation
    if (!user || !validUntilBlock) {
      return NextResponse.json({ error: 'Missing required parameters: user, validUntilBlock' }, { status: 400, headers: corsHeaders })
    }

    if (!isAddress(user)) {
      return NextResponse.json({ error: 'Invalid user address' }, { status: 400, headers: corsHeaders })
    }

    const blockNum = BigInt(validUntilBlock)
    if (blockNum <= 0n) {
      return NextResponse.json({ error: 'Invalid validUntilBlock' }, { status: 400, headers: corsHeaders })
    }

    if (!APP_PRIVATE_KEY) {
      return NextResponse.json({ error: 'Signing not configured' }, { status: 500, headers: corsHeaders })
    }

    // Retry budget: max 5 sign requests per wallet per hour.
    // A successful claim only needs ONE signature, but legitimate retries can happen because
    // each signature is bound to `validUntilBlock` (~600 blocks / ~50 min on Celo) and is
    // invalidated by: user rejecting in wallet, tx failing/expiring before inclusion,
    // page refresh mid-flow, or re-running eligibility checks. The cap absorbs those
    // retries while preventing a single wallet from spamming the app signer.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const recentCount = await prisma.engagementRewardClaim.count({
      where: {
        wallet: (user as string).toLowerCase(),
        createdAt: { gte: oneHourAgo },
      },
    })
    if (recentCount >= 5) {
      return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429, headers: corsHeaders })
    }

    const account = privateKeyToAccount(APP_PRIVATE_KEY)
    const walletClient = createWalletClient({
      chain: celo,
      transport: http(process.env.CELO_MAINNET_RPC_URL),
      account,
    })

    const { domain, types, primaryType, message } = buildAppClaimTypedData(
      APP_ADDRESS,
      user as `0x${string}`,
      blockNum,
    )

    const signature = await walletClient.signTypedData({ domain, types, primaryType, message })

    // Log to DB for auditing
    await prisma.engagementRewardClaim.create({
      data: {
        wallet: (user as string).toLowerCase(),
        inviter: inviter ? (inviter as string).toLowerCase() : null,
        status: 'pending',
      },
    })

    return NextResponse.json({ signature }, { headers: corsHeaders })
  } catch (error) {
    console.error('[sign-claim] Error:', error)
    return NextResponse.json(
      { error: 'Failed to sign claim', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: corsHeaders }
    )
  }
}

