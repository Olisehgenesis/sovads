import { NextRequest, NextResponse } from 'next/server'
import { getMongoClient, getDatabase } from '@/lib/mongo'
import { collections } from '@/lib/db'

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
    mongodbUri: string | null
    connection: {
      status: 'success' | 'error'
      duration: number
      error?: string
    }
    database: {
      status: 'success' | 'error'
      name: string | null
      error?: string
    }
    collections: {
      status: 'success' | 'error'
      collections: string[]
      error?: string
    }
    testQueries: {
      publishers: { status: 'success' | 'error'; count: number; error?: string }
      campaigns: { status: 'success' | 'error'; count: number; error?: string }
      publisherSites: { status: 'success' | 'error'; count: number; error?: string }
    }
  } = {
    timestamp: new Date().toISOString(),
    mongodbUri: process.env.MONGODB_URI ? '***configured***' : null,
    connection: { status: 'error', duration: 0 },
    database: { status: 'error', name: null },
    collections: { status: 'error', collections: [] },
    testQueries: {
      publishers: { status: 'error', count: 0 },
      campaigns: { status: 'error', count: 0 },
      publisherSites: { status: 'error', count: 0 },
    },
  }

  try {
    // Test 1: MongoDB Connection
    try {
      const client = await getMongoClient()
      const pingStart = Date.now()
      await client.db().admin().ping()
      results.connection = {
        status: 'success',
        duration: Date.now() - pingStart,
      }
    } catch (error) {
      results.connection = {
        status: 'error',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      }
      return NextResponse.json(
        {
          ...results,
          overall: 'failed',
          message: 'MongoDB connection failed',
        },
        { status: 500, headers: corsHeaders }
      )
    }

    // Test 2: Database Access
    try {
      const db = await getDatabase()
      results.database = {
        status: 'success',
        name: db.databaseName,
      }
    } catch (error) {
      results.database = {
        status: 'error',
        name: null,
        error: error instanceof Error ? error.message : String(error),
      }
    }

    // Test 3: List Collections
    try {
      const db = await getDatabase()
      const collectionNames = await db.listCollections().toArray()
      results.collections = {
        status: 'success',
        collections: collectionNames.map((c) => c.name),
      }
    } catch (error) {
      results.collections = {
        status: 'error',
        collections: [],
        error: error instanceof Error ? error.message : String(error),
      }
    }

    // Test 4: Test Queries on Key Collections
    try {
      const publishersCollection = await collections.publishers()
      const publisherCount = await publishersCollection.countDocuments({})
      results.testQueries.publishers = {
        status: 'success',
        count: publisherCount,
      }
    } catch (error) {
      results.testQueries.publishers = {
        status: 'error',
        count: 0,
        error: error instanceof Error ? error.message : String(error),
      }
    }

    try {
      const campaignsCollection = await collections.campaigns()
      const campaignCount = await campaignsCollection.countDocuments({})
      results.testQueries.campaigns = {
        status: 'success',
        count: campaignCount,
      }
    } catch (error) {
      results.testQueries.campaigns = {
        status: 'error',
        count: 0,
        error: error instanceof Error ? error.message : String(error),
      }
    }

    try {
      const publisherSitesCollection = await collections.publisherSites()
      const siteCount = await publisherSitesCollection.countDocuments({})
      results.testQueries.publisherSites = {
        status: 'success',
        count: siteCount,
      }
    } catch (error) {
      results.testQueries.publisherSites = {
        status: 'error',
        count: 0,
        error: error instanceof Error ? error.message : String(error),
      }
    }

    const totalDuration = Date.now() - startTime
    const allTestsPassed =
      results.connection.status === 'success' &&
      results.database.status === 'success' &&
      results.collections.status === 'success'

    return NextResponse.json(
      {
        ...results,
        overall: allTestsPassed ? 'success' : 'partial',
        totalDuration,
        message: allTestsPassed
          ? 'All database tests passed'
          : 'Some database tests failed',
      },
      {
        status: allTestsPassed ? 200 : 207, // 207 = Multi-Status
        headers: corsHeaders,
      }
    )
  } catch (error) {
    const totalDuration = Date.now() - startTime
    return NextResponse.json(
      {
        ...results,
        overall: 'failed',
        totalDuration,
        message: 'Database health check failed',
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500, headers: corsHeaders }
    )
  }
}

