import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// CORS headers helper
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  })
}

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const results: {
    timestamp: string
    databaseUrl: string | null
    connection: { status: 'success' | 'error'; duration: number; error?: string }
    testQueries: {
      publishers: { status: 'success' | 'error'; count: number; error?: string }
      campaigns: { status: 'success' | 'error'; count: number; error?: string }
      publisherSites: { status: 'success' | 'error'; count: number; error?: string }
    }
  } = {
    timestamp: new Date().toISOString(),
    databaseUrl: process.env.DATABASE_URL ? '***configured***' : null,
    connection: { status: 'error', duration: 0 },
    testQueries: {
      publishers: { status: 'error', count: 0 },
      campaigns: { status: 'error', count: 0 },
      publisherSites: { status: 'error', count: 0 },
    },
  }

  // Test 1: Database Connection
  try {
    const pingStart = Date.now()
    await prisma.$queryRaw`SELECT 1`
    results.connection = { status: 'success', duration: Date.now() - pingStart }
  } catch (error) {
    results.connection = {
      status: 'error',
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    }
    return NextResponse.json(
      { ...results, overall: 'failed', message: 'Database connection failed' },
      { status: 500, headers: corsHeaders }
    )
  }

  // Test 2: Publishers count
  try {
    const count = await prisma.publisher.count()
    results.testQueries.publishers = { status: 'success', count }
  } catch (error) {
    results.testQueries.publishers = {
      status: 'error',
      count: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  }

  // Test 3: Campaigns count
  try {
    const count = await prisma.campaign.count()
    results.testQueries.campaigns = { status: 'success', count }
  } catch (error) {
    results.testQueries.campaigns = {
      status: 'error',
      count: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  }

  // Test 4: Publisher sites count
  try {
    const count = await prisma.publisherSite.count()
    results.testQueries.publisherSites = { status: 'success', count }
  } catch (error) {
    results.testQueries.publisherSites = {
      status: 'error',
      count: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  }

  const totalDuration = Date.now() - startTime
  const allTestsPassed = results.connection.status === 'success'

  return NextResponse.json(
    {
      ...results,
      overall: allTestsPassed ? 'success' : 'partial',
      totalDuration,
      message: allTestsPassed ? 'All database tests passed' : 'Some database tests failed',
    },
    {
      status: allTestsPassed ? 200 : 207,
      headers: corsHeaders,
    }
  )
}

// CORS headers helper
