import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

// Weekly engagement-streak gate for the GoodDollar bonus claim.
// Rule: a wallet must view at least one ad (IMPRESSION) on DAYS_REQUIRED
// distinct UTC days within a rolling WINDOW_DAYS window.
//
// Tune via env vars (no redeploy of code needed):
//   VIEWER_STREAK_DAYS_REQUIRED  (default 3)
//   VIEWER_STREAK_WINDOW_DAYS    (default 7)
function readPositiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}
const DAYS_REQUIRED = readPositiveInt(process.env.VIEWER_STREAK_DAYS_REQUIRED, 3)
const WINDOW_DAYS = readPositiveInt(process.env.VIEWER_STREAK_WINDOW_DAYS, 7)

// UTC YYYY-MM-DD key for grouping rewards by calendar day.
function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const wallet = searchParams.get('wallet')
    const fingerprint = searchParams.get('fingerprint')

    if (!wallet && !fingerprint) {
      return NextResponse.json(
        { error: 'Wallet or fingerprint required' },
        { status: 400, headers: corsHeaders },
      )
    }

    const windowMs = WINDOW_DAYS * 24 * 60 * 60 * 1000
    const windowStart = new Date(Date.now() - windowMs)

    // Build the OR filter so callers that pass BOTH wallet and fingerprint pick
    // up prior anonymous days before the lazy anon→wallet merge runs on the
    // next POST. Anonymous rows always have wallet=null and a fingerprint.
    const orFilter: Array<Record<string, unknown>> = []
    if (wallet) orFilter.push({ wallet: wallet.toLowerCase() })
    if (fingerprint) orFilter.push({ fingerprint })

    // Only IMPRESSION events count toward the streak — CLICKS and STAKE bonuses
    // are excluded so multi-click farming and the one-time stake bonus can't
    // shortcut the multi-day requirement.
    const rewards = await prisma.viewerReward.findMany({
      where: {
        type: 'IMPRESSION',
        timestamp: { gte: windowStart },
        OR: orFilter,
      },
      select: { timestamp: true },
      orderBy: { timestamp: 'asc' },
    })

    const dayKeys = new Set<string>()
    for (const r of rewards) {
      dayKeys.add(utcDayKey(r.timestamp))
    }
    const daysViewed = dayKeys.size
    const qualified = daysViewed >= DAYS_REQUIRED

    // Today (UTC) — used by the UI to know whether the user has already
    // logged a qualifying view today (so the tracker can show "view another
    // ad on a new day" vs "come back tomorrow").
    const todayKey = utcDayKey(new Date())
    const viewedToday = dayKeys.has(todayKey)

    return NextResponse.json(
      {
        wallet: wallet ? wallet.toLowerCase() : null,
        fingerprint: fingerprint || null,
        daysViewed,
        daysRequired: DAYS_REQUIRED,
        windowDays: WINDOW_DAYS,
        windowStart: windowStart.toISOString(),
        qualified,
        viewedToday,
        days: Array.from(dayKeys).sort(),
      },
      { headers: corsHeaders },
    )
  } catch (error) {
    console.error('Error computing viewer streak:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders },
    )
  }
}
