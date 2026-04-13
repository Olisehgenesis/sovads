import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 200, headers: corsHeaders })
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const wallet = searchParams.get('wallet')?.toLowerCase()

        const topViewers = await prisma.viewerPoints.findMany({
            orderBy: { totalPoints: 'desc' },
            take: 50,
        })

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

        // If wallet provided and not already in top 50, find its rank
        let myRank: { rank: number; points: number } | null = null
        if (wallet) {
            const inTop = entries.find(e => e.fullWallet?.toLowerCase() === wallet)
            if (!inTop) {
                const viewer = await prisma.viewerPoints.findFirst({
                    where: { wallet },
                })
                if (viewer) {
                    const rank = await prisma.viewerPoints.count({
                        where: { totalPoints: { gt: viewer.totalPoints } },
                    })
                    myRank = { rank: rank + 1, points: viewer.totalPoints }
                }
            }
        }

        return NextResponse.json({ entries, myRank }, { headers: corsHeaders })
    } catch (error) {
        console.error('Database unavailable while fetching leaderboard:', error)
        return NextResponse.json({ entries: [], myRank: null, error: 'Database unavailable' }, { status: 503, headers: corsHeaders })
    }
}
