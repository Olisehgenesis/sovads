import { NextRequest, NextResponse } from 'next/server'
import { collections } from '@/lib/db'

// CORS headers helper
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

/**
 * Normalize domain for consistent matching
 * - Convert to lowercase
 * - Remove www. prefix
 * - Remove protocol if present
 * - Remove trailing slash
 */
function normalizeDomain(domain: string): string {
  let normalized = domain.toLowerCase().trim()
  
  // Remove protocol
  normalized = normalized.replace(/^https?:\/\//, '')
  
  // Remove www. prefix
  if (normalized.startsWith('www.')) {
    normalized = normalized.substring(4)
  }
  
  // Remove trailing slash
  normalized = normalized.replace(/\/$/, '')
  
  // Remove port if present (for localhost)
  if (normalized.includes(':') && !normalized.includes('mongodb')) {
    normalized = normalized.split(':')[0]
  }
  
  return normalized
}

/**
 * Generate domain variations for flexible matching
 */
function getDomainVariations(domain: string): string[] {
  const normalized = normalizeDomain(domain)
  const variations = [normalized]
  
  // Add www version
  if (!normalized.startsWith('www.')) {
    variations.push(`www.${normalized}`)
  }
  
  // Remove www if present
  if (normalized.startsWith('www.')) {
    variations.push(normalized.substring(4))
  }
  
  return [...new Set(variations)] // Remove duplicates
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  })
}

export async function POST(request: NextRequest) {
  try {
    const { domain } = (await request.json()) as { domain?: string }

    if (!domain) {
      return NextResponse.json({ 
        error: 'Domain is required' 
      }, { status: 400, headers: corsHeaders })
    }

    const normalizedDomain = normalizeDomain(domain)
    const domainVariations = getDomainVariations(domain)

    // Try to access MongoDB - handle connection errors gracefully
    let publisherSitesCollection, publishersCollection
    try {
      publisherSitesCollection = await collections.publisherSites()
      publishersCollection = await collections.publishers()
      
      // Test the connection by trying a simple query
      await publisherSitesCollection.findOne({}, { limit: 1 })
    } catch (dbError) {
      console.error('MongoDB connection error in site detection:', dbError)
      const errorDetails = dbError instanceof Error ? dbError.message : String(dbError)
      const errorStack = dbError instanceof Error ? dbError.stack : undefined
      
      // Log full error in development
      if (process.env.NODE_ENV === 'development') {
        console.error('Full MongoDB error:', { errorDetails, errorStack })
      }
      
      // If MongoDB is unavailable, return temp site ID anyway
      const encodedDomain = Buffer.from(normalizedDomain).toString('base64')
      const tempSiteId = `temp_${encodedDomain.substring(0, 8)}_${Date.now()}`
      
      return NextResponse.json({ 
        siteId: tempSiteId,
        domain: normalizedDomain,
        verified: false,
        message: 'Database unavailable - using temporary site ID',
        error: process.env.NODE_ENV === 'development' ? errorDetails : undefined,
        stack: process.env.NODE_ENV === 'development' ? errorStack : undefined
      }, { headers: corsHeaders })
    }

    // Try to find publisher site with domain variations
    let publisherSite = null
    for (const domainVar of domainVariations) {
      publisherSite = await publisherSitesCollection.findOne({ domain: domainVar })
      if (publisherSite) break
    }

    if (publisherSite) {
      const publisher = await publishersCollection.findOne({ _id: publisherSite.publisherId })
      return NextResponse.json({ 
        siteId: publisherSite.siteId,
        domain: publisherSite.domain,
        verified: publisher?.verified || false
      }, { headers: corsHeaders })
    }

    // Check if site already exists in Publisher (legacy) with domain variations
    let site = null
    for (const domainVar of domainVariations) {
      site = await publishersCollection.findOne({ 
        domain: domainVar,
        verified: true 
      })
      if (site) break
    }

    if (site) {
      return NextResponse.json({ 
        siteId: site._id,
        domain: site.domain,
        verified: site.verified
      }, { headers: corsHeaders })
    }

    // Check for unverified site with domain variations
    let unverifiedSite = null
    for (const domainVar of domainVariations) {
      unverifiedSite = await publishersCollection.findOne({ 
        domain: domainVar,
        verified: false 
      })
      if (unverifiedSite) break
    }

    if (unverifiedSite) {
      return NextResponse.json({ 
        siteId: unverifiedSite._id,
        domain: unverifiedSite.domain,
        verified: unverifiedSite.verified,
        message: 'Site exists but not verified'
      }, { headers: corsHeaders })
    }

    // Generate a temporary site ID for new domains
    const encodedDomain = Buffer.from(normalizedDomain).toString('base64')
    const tempSiteId = `temp_${encodedDomain.substring(0, 8)}_${Date.now()}`
    
    return NextResponse.json({ 
      siteId: tempSiteId,
      domain: normalizedDomain,
      verified: false,
      message: 'New site detected - please register to start earning'
    }, { headers: corsHeaders })

  } catch (error) {
    console.error('Error detecting site:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ 
      error: 'Failed to detect site',
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
    }, { status: 500, headers: corsHeaders })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const domain = searchParams.get('domain')

    if (!domain) {
      return NextResponse.json({ 
        error: 'Domain parameter is required' 
      }, { status: 400, headers: corsHeaders })
    }

    const publishersCollection = await collections.publishers()
    const site = await publishersCollection.findOne(
      { domain },
      {
        projection: {
          _id: 1,
          domain: 1,
          verified: 1,
          totalEarned: 1,
          createdAt: 1,
        },
      }
    )

    if (!site) {
      return NextResponse.json({ 
        error: 'Site not found' 
      }, { status: 404, headers: corsHeaders })
    }

    return NextResponse.json({ 
      site: {
        id: site._id,
        domain: site.domain,
        verified: site.verified,
        totalEarned: site.totalEarned,
        createdAt: site.createdAt,
      }
    }, { headers: corsHeaders })
  } catch (error) {
    console.error('Error fetching site:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch site' 
    }, { status: 500, headers: corsHeaders })
  }
}
