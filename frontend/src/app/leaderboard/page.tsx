'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface LeaderboardEntry {
    wallet: string
    points: number
    rank: number
}

export default function LeaderboardPage() {
    const [entries, setEntries] = useState<LeaderboardEntry[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchLeaderboard = async () => {
            try {
                const response = await fetch('/api/viewers/leaderboard')
                if (response.ok) {
                    const data = await response.json()
                    setEntries(data.entries || [])
                } else {
                    console.error('Failed to fetch leaderboard:', response.status, response.statusText)
                    setEntries([])
                }
            } catch (error) {
                console.error('Error fetching leaderboard:', error)
                setEntries([])
            } finally {
                setLoading(false)
            }
        }

        fetchLeaderboard()
        // periodically refresh to make stake rewards show up quickly
        const interval = setInterval(fetchLeaderboard, 30000)
        return () => clearInterval(interval)
    }, [])

    return (
        <div className="max-w-4xl mx-auto px-4 py-16">
            <div className="text-center mb-12">
                <h1 className="brutal-title text-6xl">LEADERBOARD</h1>
                <p className="text-sm font-bold uppercase tracking-widest text-black/60">
                    The Top SovPoints Earners
                </p>
            </div>

            <div className="card bg-white p-0 overflow-hidden shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b-4 border-black bg-[#F5F3F0]">
                            <th className="px-6 py-4 font-heading uppercase text-sm tracking-tight">Rank</th>
                            <th className="px-6 py-4 font-heading uppercase text-sm tracking-tight">Wallet</th>
                            <th className="px-6 py-4 font-heading uppercase text-sm tracking-tight text-right">Points</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={3} className="px-6 py-8 text-center font-bold text-xs uppercase animate-pulse">
                                    Scanning the chain...
                                </td>
                            </tr>
                        ) : (
                            entries.map((entry, idx) => (
                                <tr
                                    key={entry.wallet}
                                    className={`border-b-2 border-black/10 hover:bg-[#F5F3F0] transition-colors ${idx === 0 ? 'bg-yellow-50/50' : ''}`}
                                >
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center justify-center w-8 h-8 font-heading text-lg border-2 border-black ${idx === 0 ? 'bg-yellow-400 text-black' : idx < 3 ? 'bg-black text-white' : 'bg-white text-black font-bold'}`}>
                                            {entry.rank}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 font-mono text-sm font-bold">
                                        {entry.wallet}
                                    </td>
                                    <td className="px-6 py-4 text-right font-heading text-xl">
                                        {entry.points.toLocaleString()}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <div className="mt-12 p-8 card bg-black text-white rotate-1">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                    <div>
                        <h3 className="text-2xl font-heading mb-2 uppercase text-white">Your Rank</h3>
                        <p className="text-xs uppercase font-bold opacity-80 italic text-white">Connect wallet to view your standing</p>
                    </div>
                    <Link href="/rewards" className="btn bg-white text-black hover:bg-white/90 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] px-8 py-3">
                        Earn More Points
                    </Link>
                </div>
            </div>
        </div>
    )
}
