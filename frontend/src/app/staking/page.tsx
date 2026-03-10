'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAccount, useBalance } from 'wagmi';
import { formatEther } from 'viem';
import { useStreamingAds } from '@/hooks/useStreamingAds';
import { GOODDOLLAR_ADDRESS } from '@/lib/chain-config';
import WalletButton from '@/components/WalletButton';

// ─── Types ───────────────────────────────────────────────────────────────────

type ModalMode = 'stake' | 'unstake' | null;

interface StatRow {
    label: string;
    value: string;
    sub?: string;
}

// ─── Modal ───────────────────────────────────────────────────────────────────

function StakeModal({
    mode,
    onClose,
    onConfirm,
    isLoading,
    walletBalance,
    walletSymbol,
    error,
}: {
    mode: ModalMode;
    onClose: () => void;
    onConfirm: (amount: string) => Promise<void>;
    isLoading: boolean;
    walletBalance?: string;
    walletSymbol?: string;
    error?: string | null;
}) {
    const [amount, setAmount] = useState('');

    const isStake = mode === 'stake';
    const accentClass = isStake ? 'bg-yellow-400' : 'bg-pink-400';
    const accentText = isStake ? 'text-black' : 'text-white';
    const label = isStake ? 'Stake' : 'Unstake';

    const handleConfirm = async () => {
        if (!amount || isNaN(Number(amount))) return;
        await onConfirm(amount);
        setAmount('');
    };

    const setMax = () => {
        if (walletBalance) setAmount(walletBalance);
    };

    // Close on backdrop click
    const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) onClose();
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4"
            onClick={handleBackdrop}
        >
            <div className="bg-white border-4 border-black shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] w-full max-w-md font-mono animate-in fade-in zoom-in-95 duration-150">
                {/* Header bar */}
                <div className={`${accentClass} ${accentText} px-6 py-4 flex items-center justify-between border-b-4 border-black`}>
                    <h2 className="text-xl font-black uppercase tracking-tighter">{label} G$</h2>
                    <button
                        onClick={onClose}
                        className="font-black text-xl leading-none hover:opacity-70 transition-opacity"
                        aria-label="Close"
                    >
                        ✕
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-5">
                    {/* Amount input */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-black uppercase tracking-widest">Amount (G$)</label>
                            {walletBalance && (
                                <button
                                    onClick={setMax}
                                    className="text-[10px] font-black uppercase bg-black text-white px-2 py-0.5 hover:bg-gray-800 transition-colors"
                                >
                                    Max: {Number(walletBalance).toFixed(2)} {walletSymbol}
                                </button>
                            )}
                        </div>
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="0.00"
                            autoFocus
                            className="w-full bg-gray-50 border-2 border-black p-3 text-2xl font-black focus:outline-none focus:bg-yellow-50 transition-colors"
                        />
                    </div>

                    {/* Rules */}
                    {isStake ? (
                        <div className="bg-yellow-50 border-2 border-yellow-400 p-3 space-y-1">
                            <p className="text-[10px] font-black uppercase tracking-widest text-yellow-700 mb-1">What happens when you stake:</p>
                            <ul className="text-xs font-bold text-black/70 list-disc pl-4 space-y-1">
                                <li>Rewards stream to you instantly via Superfluid</li>
                                <li>Time-boost multiplier starts accruing</li>
                                <li>SovPoints earned for leaderboard (+5 pts / 10% range)</li>
                            </ul>
                        </div>
                    ) : (
                        <div className="bg-pink-50 border-2 border-pink-400 p-3 space-y-1">
                            <p className="text-[10px] font-black uppercase tracking-widest text-pink-700 mb-1">⚠ Warning:</p>
                            <ul className="text-xs font-bold text-black/70 list-disc pl-4 space-y-1">
                                <li>Unstaking resets your time-accrued multiplier to 1.0x</li>
                                <li>Reward stream stops for the withdrawn amount</li>
                            </ul>
                        </div>
                    )}

                    {error && (
                        <p className="text-xs font-bold text-red-600 bg-red-50 border-2 border-red-500 p-2 uppercase">
                            {error}
                        </p>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-1">
                        <button
                            onClick={onClose}
                            className="flex-1 py-3 font-black uppercase text-sm border-2 border-black bg-white hover:bg-gray-100 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5 transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={isLoading || !amount || Number(amount) <= 0}
                            className={`flex-1 py-3 font-black uppercase text-sm border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-1 active:translate-y-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${accentClass} ${accentText}`}
                        >
                            {isLoading ? 'Processing…' : `Confirm ${label}`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Stat card ───────────────────────────────────────────────────────────────

function StatCard({
    label,
    value,
    sub,
    accent,
}: {
    label: string;
    value: string;
    sub?: string;
    accent?: string;
}) {
    return (
        <div className={`border-2 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${accent ?? 'bg-white'}`}>
            <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">{label}</p>
            <p className="text-2xl font-black leading-none">{value}</p>
            {sub && <p className="text-[10px] font-bold uppercase opacity-50 mt-1">{sub}</p>}
        </div>
    );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function StakingPage() {
    const { address } = useAccount();
    const {
        stake,
        unstake,
        getStakerInfo,
        updateStakingMultiplier,
        totalStaked,
        isLoading,
        error,
    } = useStreamingAds();

    const [stakedAmount, setStakedAmount] = useState('0');
    const [multiplier, setMultiplier] = useState('1.0');
    const [stakingTime, setStakingTime] = useState('—');
    const [units, setUnits] = useState('0');
    const [modal, setModal] = useState<ModalMode>(null);
    const [toast, setToast] = useState<string | null>(null);

    const { data: balanceData } = useBalance({
        address: address as `0x${string}`,
        token: GOODDOLLAR_ADDRESS as `0x${string}`,
    });

    const fetchStakerData = useCallback(async () => {
        if (!address) return;
        const info = await getStakerInfo(address);
        if (!info) return;
        const stakedEther = formatEther(info.stakedAmount);
        setStakedAmount(stakedEther);
        setUnits(info.units.toString());

        // stakingTime is a unix timestamp (seconds) of when staking began — compute elapsed
        const startTs = Number(info.stakingTime);
        if (startTs === 0) {
            setStakingTime('—');
        } else {
            const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - startTs);
            const days = Math.floor(elapsed / 86400);
            const hrs = Math.floor((elapsed % 86400) / 3600);
            const mins = Math.floor((elapsed % 3600) / 60);
            setStakingTime(elapsed < 3600 ? `${mins}m` : elapsed < 86400 ? `${hrs}h ${mins}m` : `${days}d ${hrs}h`);
        }

        // Multiplier: units-per-G$ staked. Divide by ether value to avoid BigInt→Number overflow.
        const stakedNum = Number(stakedEther);
        setMultiplier(
            stakedNum > 0
                ? (Number(info.units) / stakedNum).toFixed(2)
                : '1.00'
        );
    }, [address, getStakerInfo]);

    useEffect(() => {
        fetchStakerData();
        const t = setInterval(fetchStakerData, 10_000);
        return () => clearInterval(t);
    }, [fetchStakerData]);

    const handleAction = async (amount: string) => {
        if (modal === 'stake') {
            const result = await stake(amount);
            if (result?.pointsAwarded) {
                setToast(`+${result.pointsAwarded.toLocaleString()} SovPoints earned 🔥`);
                setTimeout(() => setToast(null), 5000);
            }
        } else {
            await unstake(amount);
        }
        setModal(null);
        fetchStakerData();
    };

    // ── Not connected ──────────────────────────────────────────────────────────
    if (!address) {
        return (
            <div className="min-h-screen bg-[#F0F0F0] font-mono flex items-center justify-center p-4">
                <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-10 text-center max-w-sm w-full">
                    <div className="text-5xl mb-5">⚡</div>
                    <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">Stake G$</h2>
                    <p className="text-xs font-bold text-black/50 uppercase mb-6">
                        Connect your wallet to stake and earn streaming rewards.
                    </p>
                    <WalletButton />
                </div>
            </div>
        );
    }

    // ── Table rows ─────────────────────────────────────────────────────────────
    const tableRows: StatRow[] = [
        { label: 'Active Stake', value: `${Number(stakedAmount).toLocaleString()} G$` },
        { label: 'Units Earned', value: Number(units).toLocaleString(), sub: 'proportional reward weight' },
        { label: 'Time Staked', value: stakingTime },
        { label: 'Your Multiplier', value: `${multiplier}x`, sub: 'time-boost factor' },
        { label: 'Wallet Balance', value: balanceData ? `${Number(balanceData.formatted).toFixed(2)} ${balanceData.symbol}` : '—' },
        { label: 'Global TVL', value: totalStaked ? `${Number(formatEther(totalStaked)).toLocaleString()} G$` : '0 G$' },
    ];

    return (
        <>
            {/* Modal */}
            {modal && (
                <StakeModal
                    mode={modal}
                    onClose={() => setModal(null)}
                    onConfirm={handleAction}
                    isLoading={isLoading}
                    walletBalance={balanceData?.formatted}
                    walletSymbol={balanceData?.symbol}
                    error={error}
                />
            )}

            <div className="min-h-screen bg-[#F0F0F0] font-mono selection:bg-yellow-300">
                <main className="max-w-3xl mx-auto px-4 py-12 space-y-10">

                    {/* ── Page header ── */}
                    <div>
                        <h1 className="text-5xl font-black uppercase tracking-tighter leading-none border-b-8 border-black pb-3 mb-3">
                            Staking <span className="text-yellow-500">Pulse</span>
                        </h1>
                        <p className="text-base font-bold italic text-black/60">
                            Secure the network · Boost your rewards · Fuel the flow
                        </p>
                        {toast && (
                            <div className="mt-3 px-4 py-3 bg-green-100 border-2 border-green-600 text-green-800 text-sm font-black uppercase">
                                {toast}
                            </div>
                        )}
                    </div>

                    {/* ── Hero stat cards ── */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        <StatCard label="Your Multiplier" value={`${multiplier}x`} sub="time-boost" accent="bg-yellow-400" />
                        <StatCard label="Active Stake" value={`${Number(stakedAmount).toFixed(2)} G$`} accent="bg-black text-white [&_p]:text-white" />
                        <StatCard label="Global TVL" value={totalStaked ? `${Number(formatEther(totalStaked)).toLocaleString()} G$` : '0 G$'} />
                    </div>

                    {/* ── CTA buttons ── */}
                    <div className="flex gap-4">
                        <button
                            onClick={() => setModal('stake')}
                            className="flex-1 py-4 bg-yellow-400 text-black font-black uppercase text-lg tracking-widest border-2 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:-translate-x-0.5 hover:-translate-y-0.5 active:shadow-none active:translate-x-1 active:translate-y-1 transition-all"
                        >
                            ↑ Stake
                        </button>
                        <button
                            onClick={() => setModal('unstake')}
                            className="flex-1 py-4 bg-white text-black font-black uppercase text-lg tracking-widest border-2 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:-translate-x-0.5 hover:-translate-y-0.5 active:shadow-none active:translate-x-1 active:translate-y-1 transition-all"
                        >
                            ↓ Unstake
                        </button>
                        <button
                            onClick={() => updateStakingMultiplier()}
                            disabled={isLoading}
                            title="Sync your time-boost multiplier on-chain"
                            className="px-4 py-4 bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-x-0.5 hover:-translate-y-0.5 active:shadow-none active:translate-x-1 active:translate-y-1 transition-all font-black text-xl disabled:opacity-40"
                        >
                            ⟳
                        </button>
                    </div>

                    {/* ── Stats table ── */}
                    <div>
                        <h2 className="text-xs font-black uppercase tracking-widest mb-3 border-b-2 border-black pb-1">
                            Your Position
                        </h2>
                        <table className="w-full border-2 border-black text-sm">
                            <tbody>
                                {tableRows.map((row, i) => (
                                    <tr
                                        key={row.label}
                                        className={`border-b border-black last:border-b-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                                    >
                                        <td className="px-4 py-3 font-black uppercase text-xs text-black/60 tracking-wider w-1/2 border-r border-black">
                                            {row.label}
                                            {row.sub && <span className="block text-[9px] font-bold normal-case text-black/40 mt-0.5">{row.sub}</span>}
                                        </td>
                                        <td className="px-4 py-3 font-black text-right">
                                            {row.value}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* ── Info grid ── */}
                    <div>
                        <h2 className="text-xs font-black uppercase tracking-widest mb-3 border-b-2 border-black pb-1">
                            How It Works
                        </h2>
                        <div className="grid sm:grid-cols-3 gap-4">
                            {[
                                {
                                    n: '01', bg: 'bg-black text-white', title: 'Instant Flow',
                                    body: 'Rewards stream via Superfluid GDA — no claiming needed. Check your Superfluid dashboard.',
                                },
                                {
                                    n: '02', bg: 'bg-yellow-400', title: 'Time Boost',
                                    body: 'Your reward share grows the longer you stay staked without adding more capital.',
                                },
                                {
                                    n: '03', bg: 'bg-pink-400 text-white', title: 'Zero Lock',
                                    body: 'Unstake anytime. Capital is always liquid — but your multiplier is built by staying.',
                                },
                            ].map(({ n, bg, title, body }) => (
                                <div key={n} className="border-2 border-black p-4 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                                    <div className={`w-9 h-9 flex items-center justify-center font-black text-sm border-2 border-black mb-3 ${bg}`}>{n}</div>
                                    <h4 className="font-black uppercase text-sm mb-1">{title}</h4>
                                    <p className="text-xs font-bold text-black/60 leading-relaxed">{body}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                </main>
            </div>
        </>
    );
}
