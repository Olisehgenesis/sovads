import { NextRequest, NextResponse } from 'next/server'
import { collections } from '@/lib/db'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 200, headers: corsHeaders })
}

export async function GET() {
    try {
        const viewerPointsCollection = await collections.viewerPoints()

        // Fetch top 50 viewers by total points
        const topViewers = await viewerPointsCollection
            .find({})
            .sort({ totalPoints: -1 })
            .limit(50)
            .toArray()

        const entries = topViewers.map((v, index) => {
            const display = v.wallet
                ? `${v.wallet.slice(0, 6)}...${v.wallet.slice(-4)}`
                : v.fingerprint
                    ? `anon_${v.fingerprint.slice(0, 6)}`
                    : 'Anonymous'

            return {
                wallet: display,
                fullWallet: v.wallet || null,
                points: v.totalPoints,
                rank: index + 1
            }
        })

        return NextResponse.json({ entries }, { headers: corsHeaders })
    } catch (error) {
        console.error('Error fetching leaderboard:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders })
    }
}
