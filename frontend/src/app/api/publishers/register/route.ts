import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Publisher registration API
 * Note: This only saves to database. 
 * To register on-chain, use the subscribePublisher function from useAds hook
 * which calls the SovAdsManager contract's subscribePublisher function.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { wallet, domain } = body

    if (!wallet || !domain) {
      return NextResponse.json({ error: 'Wallet and domain are required' }, { status: 400 })
    }

    let publishersCollection
    try {
      publishersCollection = prisma.publisher
    } catch (dbError) {
      console.error('DB connection error:', dbError)
      return NextResponse.json({ error: 'Database connection failed' }, { status: 500 })
    }

    const existingPublisher = await prisma.publisher.findFirst({ where: { wallet } })

    if (existingPublisher) {
      return NextResponse.json({
        success: true,
        id: existingPublisher.id,
        siteId: `site_${existingPublisher.id}`,
        domain: existingPublisher.domain,
        verified: existingPublisher.verified
      })
    }

    const publisher = await prisma.publisher.create({
      data: { wallet, domain, verified: false, totalEarned: 0 },
    })

    return NextResponse.json({
      success: true,
      id: publisher.id,
      siteId: `site_${publisher.id}`,
      domain: publisher.domain,
      verified: false,
      note: 'Register on-chain using subscribePublisher from useAds hook'
    })
  } catch (error) {
    console.error('Error registering publisher:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const wallet = searchParams.get('wallet')

    if (!wallet) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 })
    }

    let publishersCollection2
    try {
      publishersCollection2 = prisma.publisher
    } catch (dbError) {
      console.error('DB connection error:', dbError)
      return NextResponse.json({ error: 'Database connection failed' }, { status: 500 })
    }

    const publisher = await prisma.publisher.findFirst({ where: { wallet } })

    if (!publisher) {
      return NextResponse.json({ error: 'Publisher not found' }, { status: 404 })
    }

    return NextResponse.json({
      id: publisher.id,
      wallet: publisher.wallet,
      domain: publisher.domain,
      verified: publisher.verified,
      totalEarned: publisher.totalEarned,
      createdAt: publisher.createdAt,
      updatedAt: publisher.updatedAt,
    })
  } catch (error) {
    console.error('Error fetching publisher:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
    }, { status: 500 })
  }
}