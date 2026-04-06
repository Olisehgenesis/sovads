'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'

interface LeaderboardEntry {
    wallet: string
    points: number
    rank: number
}

function shortWallet(wallet: string): string {
    if (!wallet) return '0x???'
    const lower = wallet.toLowerCase()
    if (lower.startsWith('anon_') || lower === 'anonymous') return `0x···ANON···`
    return `${wallet.slice(0, 6)}···${wallet.slice(-4)}`
}

function rankBadgeClass(rank: number): string {
    if (rank === 1) return 'bg-yellow-400 text-black border-black'
    if (rank === 2) return 'bg-gray-300 text-black border-black'
    if (rank === 3) return 'bg-amber-600 text-white border-black'
    return 'bg-white text-black border-black'
}

function rankEmoji(rank: number): string {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈'
    if (rank === 3) return '🥉'
    return ''
}

export default function LeaderboardPage() {
    const { address, isConnected } = useAccount()
    const [entries, setEntries] = useState<LeaderboardEntry[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchLeaderboard = async () => {
            try {
                const response = await fetch('/api/viewers/leaderboard')
                if (response.ok) {
                    const data = await response.json()
                    // sort descending by points
                    const sorted: LeaderboardEntry[] = (data.entries || []).sort(
                        (a: LeaderboardEntry, b: LeaderboardEntry) => b.points - a.points
                    )
                    // re-assign rank after sort
                    sorted.forEach((e, i) => { e.rank = i + 1 })
                    setEntries(sorted)
                } else {
                    setEntries([])
                }
            } catch {
                setEntries([])
            } finally {
                setLoading(false)
            }
        }
        fetchLeaderboard()
        const interval = setInterval(fetchLeaderboard, 30000)
        return () => clearInterval(interval)
    }, [])

    const connectedWallet = address?.toLowerCase()
    const myEntry = connectedWallet
        ? entries.find(e => e.wallet.toLowerCase() === connectedWallet)
        : null

    return (
        <div className="max-w-4xl mx-auto px-4 py-16">
            {/* Header */}
            <div className="text-center mb-10">
                <h1 className="brutal-title text-6xl">LEADERBOARD</h1>
                <p className="text-sm font-bold uppercase tracking-widest text-black/60 mt-2">
                    Top SovPoints Earners · {entries.length} participants
                </p>
            </div>

            {/* Connected wallet banner */}
            {isConnected && (
                <div className={`mb-6 p-5 border-4 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] ${myEntry ? 'bg-yellow-50' : 'bg-white'}`}>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-bold uppercase tracking-widest text-black/50">Your wallet</span>
                            <span className="font-mono text-sm font-bold">{shortWallet(address!)}</span>
                        </div>
                        {myEntry ? (
                            <div className="flex items-center gap-4">
                                <div className="text-left sm:text-right">
                                    <p className="text-xs font-bold uppercase text-black/50">Rank</p>
                                    <p className="font-heading text-2xl">
                                        #{myEntry.rank} {rankEmoji(myEntry.rank)}
                                    </p>
                                </div>
                                <div className="w-px h-10 bg-black/20 hidden sm:block" />
                                <div className="text-left sm:text-right">
                                    <p className="text-xs font-bold uppercase text-black/50">Points</p>
                                    <p className="font-heading text-2xl">{myEntry.points.toLocaleString()}</p>
                                </div>
                            </div>
                        ) : (
                            <span className="text-xs font-bold uppercase text-black/40 italic">Not on the board yet — start earning!</span>
                        )}
                    </div>
                </div>
            )}

            {/* Table */}
            <div className="card bg-white p-0 overflow-hidden border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b-4 border-black bg-[#F5F3F0]">
                            <th className="px-4 py-4 font-heading uppercase text-xs tracking-widest w-16">#</th>
                            <th className="px-4 py-4 font-heading uppercase text-xs tracking-widest">Wallet</th>
                            <th className="px-4 py-4 font-heading uppercase text-xs tracking-widest text-right">Points</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={3} className="px-6 py-12 text-center font-bold text-xs uppercase animate-pulse tracking-widest">
                                    Scanning the chain...
                                </td>
                            </tr>
                        ) : entries.length === 0 ? (
                            <tr>
                                <td colSpan={3} className="px-6 py-12 text-center font-bold text-xs uppercase text-black/40">
                                    No entries yet
                                </td>
                            </tr>
                        ) : (
                            entries.map((entry) => {
                                const isMe = connectedWallet && entry.wallet.toLowerCase() === connectedWallet
                                return (
                                    <tr
                                        key={`${entry.rank}-${entry.wallet}`}
                                        className={`border-b-2 transition-colors ${
                                            isMe
                                                ? 'bg-yellow-100 border-yellow-400'
                                                : entry.rank === 1
                                                ? 'bg-yellow-50/60 border-black/10'
                                                : 'border-black/10 hover:bg-[#F5F3F0]'
                                        }`}
                                    >
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center justify-center w-8 h-8 font-heading text-sm border-2 ${rankBadgeClass(entry.rank)}`}>
                                                {entry.rank}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="font-mono text-sm font-bold">
                                                {shortWallet(entry.wallet)}
                                            </span>
                                            {isMe && (
                                                <span className="ml-2 text-xs font-bold uppercase bg-black text-white px-1.5 py-0.5 tracking-widest">
                                                    YOU
                                                </span>
                                            )}
                                            {rankEmoji(entry.rank) && (
                                                <span className="ml-1 text-base">{rankEmoji(entry.rank)}</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right font-heading text-lg">
                                            {entry.points.toLocaleString()}
                                            <span className="text-xs font-bold text-black/40 ml-1">pts</span>
                                        </td>
                                    </tr>
                                )
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Footer CTA */}
            <div className="mt-10 p-8 border-4 border-black bg-black text-white shadow-[8px_8px_0px_0px_rgba(0,0,0,0.3)] rotate-[0.5deg]">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                    <div>
                        <h3 className="text-2xl font-heading mb-1 uppercase text-white">
                            {isConnected ? (myEntry ? `You're ranked #${myEntry.rank}` : 'Not on the board yet') : 'Connect to see your rank'}
                        </h3>
                        <p className="text-xs uppercase font-bold opacity-60 text-white">
                            {isConnected ? 'Keep earning SovPoints to climb the ranks' : 'Connect your wallet to track your position'}
                        </p>
                    </div>
                    <Link
                        href="/rewards"
                        className="btn bg-white text-black hover:bg-white/90 border-2 border-white shadow-[4px_4px_0px_0px_rgba(255,255,255,0.3)] px-8 py-3 whitespace-nowrap"
                    >
                        Earn More Points →
                    </Link>
                </div>
            </div>
        </div>
    )
}
