'use client';

import React, { useState, useEffect } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { useStreamingAds } from '@/hooks/useStreamingAds';

const ADMIN_ADDRESS = '0x53eaF4CD171842d8144e45211308e5D90B4b0088'.toLowerCase();

interface Campaign {
    id: string;
    name: string;
    budget: string;
    active: boolean;
    onChainId?: number;
    advertiserId: string;
    verificationStatus?: string;
}

interface Publisher {
    id: string;
    wallet: string;
    domain: string;
    verified: boolean;
}

const BackofficePage = () => {
    const { address } = useAccount();
    const { signMessageAsync } = useSignMessage();
    const {
        updatePublisherUnits,
        pause,
        unpause,
        stopCampaign,
        isProtocolPaused,
        isLoading,
        error: contractError
    } = useStreamingAds();

    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [publishers, setPublishers] = useState<Publisher[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCampaign, setSelectedCampaign] = useState<string>('');
    const [publisherAddress, setPublisherAddress] = useState('');
    const [units, setUnits] = useState('');
    const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const isAuthorized = address?.toLowerCase() === ADMIN_ADDRESS;

    const fetchCampaigns = async () => {
        if (!address) return;
        try {
            const res = await fetch(`/api/admin/campaigns?admin=${address}`);
            if (res.ok) {
                const data = await res.json();
                setCampaigns(data.campaigns);
            }
        } catch (err) {
            console.error('Failed to fetch campaigns', err);
        }
    };

    const fetchPublishers = async () => {
        if (!address) return;
        try {
            const res = await fetch(`/api/admin/publishers-sites-audit`);
            if (res.ok) {
                const data = await res.json();
                setPublishers(data.publishers.map((p: any) => ({
                    id: p.publisherId,
                    wallet: p.wallet,
                    domain: p.domain || 'N/A',
                    verified: p.verifiedInDb
                })));
            }
        } catch (err) {
            console.error('Failed to fetch publishers', err);
        }
    };

    useEffect(() => {
        if (isAuthorized) {
            Promise.all([fetchCampaigns(), fetchPublishers()]).finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, [address, isAuthorized]);

    const handleVerifyCampaign = async (campaignId: string, status: 'approved' | 'rejected') => {
        if (!address) return;
        try {
            const timestamp = Date.now();
            const message = `Verify Campaign ${campaignId} as ${status} at ${timestamp}`;
            const signature = await signMessageAsync({ message });

            const res = await fetch('/api/admin/campaigns/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    campaignId,
                    status,
                    adminWallet: address,
                    signature,
                    message
                })
            });

            if (res.ok) {
                setStatusMessage({ type: 'success', text: `Campaign ${status}` });
                fetchCampaigns();
            } else {
                const data = await res.json();
                setStatusMessage({ type: 'error', text: data.error || 'Verification failed' });
            }
        } catch (err) {
            setStatusMessage({ type: 'error', text: 'Signing failed' });
        }
    };

    const handleVerifyPublisher = async (publisherId: string, verified: boolean) => {
        if (!address) return;
        try {
            const timestamp = Date.now();
            const message = `${verified ? 'Verify' : 'Unverify'} Publisher ${publisherId} at ${timestamp}`;
            const signature = await signMessageAsync({ message });

            const res = await fetch('/api/admin/publishers/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    publisherId,
                    verified,
                    adminWallet: address,
                    signature,
                    message
                })
            });

            if (res.ok) {
                setStatusMessage({ type: 'success', text: `Publisher ${verified ? 'verified' : 'unverified'}` });
                fetchPublishers();
            } else {
                const data = await res.json();
                setStatusMessage({ type: 'error', text: data.error || 'Update failed' });
            }
        } catch (err) {
            setStatusMessage({ type: 'error', text: 'Signing failed' });
        }
    };

    const handleUpdateUnits = async () => {
        if (!selectedCampaign || !publisherAddress || !units) return;
        const campaign = campaigns.find(c => c.id === selectedCampaign);
        if (!campaign || campaign.onChainId === undefined) {
            setStatusMessage({ type: 'error', text: 'Campaign not found or not on-chain' });
            return;
        }

        try {
            await updatePublisherUnits(campaign.onChainId, publisherAddress, units);
            setStatusMessage({ type: 'success', text: `Updated units for ${publisherAddress}` });
            setPublisherAddress('');
            setUnits('');
        } catch (err) {
            setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Update failed' });
        }
    };

    const handleTogglePause = async () => {
        try {
            if (isProtocolPaused) {
                await unpause();
            } else {
                await pause();
            }
        } catch (err) {
            setStatusMessage({ type: 'error', text: 'Pause toggle failed' });
        }
    };

    if (loading) return <div className="p-20 text-center font-black uppercase anime-pulse">Loading Backoffice...</div>;

    if (!isAuthorized) {
        return (
            <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8 text-center font-mono">
                <h1 className="text-6xl font-black mb-4 text-red-600 tracking-tighter">UNAUTHORIZED</h1>
                <p className="text-xl font-bold border-4 border-white p-6 uppercase shadow-[8px_8px_0px_0px_rgba(255,255,255,1)]">
                    RESTRICTED SECTOR <br /> ACCESS DENIED FOR {address || 'ANONYMOUS'}.
                </p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F0F0F0] font-mono selection:bg-yellow-300">
            <main className="max-w-7xl mx-auto px-4 py-12">
                <header className="mb-12 flex flex-col md:flex-row md:items-end justify-between border-b-8 border-black pb-6 gap-6">
                    <div>
                        <h1 className="text-7xl font-black uppercase tracking-tighter leading-none">
                            Back<span className="text-yellow-500">Office</span>
                        </h1>
                        <p className="font-black uppercase text-xs opacity-60 mt-4 tracking-widest">
                            [SYSTEM_TERMINAL::SOVADS_PROTOCOL_ADMIN]
                        </p>
                    </div>
                    <div className="flex gap-4">
                        <div className="bg-white border-4 border-black p-4 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                            <span className="text-[10px] font-black uppercase block opacity-40 mb-1">Status</span>
                            <span className={`text-xl font-black uppercase ${isProtocolPaused ? 'text-red-500' : 'text-green-500'}`}>
                                {isProtocolPaused ? 'PROTOCOL_PAUSED' : 'SYSTEM_ACTIVE'}
                            </span>
                        </div>
                        <button
                            onClick={handleTogglePause}
                            disabled={isLoading}
                            className={`px-8 py-4 font-black uppercase border-4 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all active:translate-x-1 active:translate-y-1 active:shadow-none ${isProtocolPaused ? 'bg-green-400' : 'bg-black text-white'
                                }`}
                        >
                            {isProtocolPaused ? 'Resume Pulse' : 'EMERGENCY_STOP'}
                        </button>
                    </div>
                </header>

                {statusMessage && (
                    <div className={`mb-8 p-6 border-4 border-black font-black uppercase text-sm shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] ${statusMessage.type === 'success' ? 'bg-green-400 text-black' : 'bg-red-500 text-white'}`}>
                        {statusMessage.text}
                    </div>
                )}

                <div className="grid lg:grid-cols-3 gap-12">
                    {/* Main Controls */}
                    <div className="lg:col-span-2 space-y-12">

                        {/* Leaderboard Management */}
                        <section className="bg-white border-4 border-black p-8 shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]">
                            <h2 className="text-3xl font-black uppercase mb-8 flex items-center gap-3">
                                <div className="w-8 h-8 bg-black"></div>
                                Leaderboard Update
                            </h2>

                            <div className="grid grid-cols-1 gap-8 mb-8">
                                <div>
                                    <label className="text-[10px] font-black uppercase mb-2 block tracking-widest underline">01. Select Active Campaign</label>
                                    <select
                                        value={selectedCampaign}
                                        onChange={(e) => setSelectedCampaign(e.target.value)}
                                        className="w-full bg-yellow-50 border-4 border-black p-4 font-black text-lg focus:outline-none focus:ring-8 focus:ring-yellow-200"
                                    >
                                        <option value="">-- SELECT_TARGET --</option>
                                        {campaigns.filter(c => c.active).map(c => (
                                            <option key={c.id} value={c.id}>
                                                {c.name.toUpperCase()} [ID: {c.onChainId}]
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="text-[10px] font-black uppercase mb-2 block tracking-widest underline">02. Publisher Wallet</label>
                                        <input
                                            type="text"
                                            value={publisherAddress}
                                            onChange={(e) => setPublisherAddress(e.target.value)}
                                            placeholder="0x..."
                                            className="w-full bg-gray-50 border-4 border-black p-4 font-black focus:outline-none focus:ring-8 focus:ring-pink-200"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black uppercase mb-2 block tracking-widest underline">03. Units (Weight)</label>
                                        <input
                                            type="number"
                                            value={units}
                                            onChange={(e) => setUnits(e.target.value)}
                                            placeholder="e.g. 100"
                                            className="w-full bg-gray-50 border-4 border-black p-4 font-black focus:outline-none focus:ring-8 focus:ring-pink-200"
                                        />
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={handleUpdateUnits}
                                disabled={isLoading || !selectedCampaign || !publisherAddress || !units}
                                className="w-full bg-yellow-400 py-6 text-2xl font-black uppercase border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:shadow-none active:translate-x-1 active:translate-y-1 transition-all disabled:opacity-50"
                            >
                                {isLoading ? 'EXECUTING_TX...' : 'SYNC_LEADERBOARD_UNITS'}
                            </button>
                        </section>

                        {/* Campaign Approval Section */}
                        <section className="bg-white border-4 border-black shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
                            <div className="bg-black text-white p-6 font-black uppercase text-xl flex items-center justify-between">
                                <span>Campaign Registry</span>
                                <span className="text-[10px] opacity-60">Total: {campaigns.length}</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b-4 border-black bg-gray-100">
                                            <th className="p-4 font-black uppercase text-xs">Campaign_Name</th>
                                            <th className="p-4 font-black uppercase text-xs border-l-4 border-black">Status</th>
                                            <th className="p-4 font-black uppercase text-xs border-l-4 border-black text-center">Verify</th>
                                            <th className="p-4 font-black uppercase text-xs border-l-4 border-black text-right">Emergency</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {campaigns.map(c => (
                                            <tr key={c.id} className="border-b-2 border-black hover:bg-yellow-50 group">
                                                <td className="p-4 font-black text-sm uppercase">{c.name} <br /> <span className="text-[10px] opacity-40">[OCID: {c.onChainId ?? 'NaN'}]</span></td>
                                                <td className="p-4 border-l-2 border-black">
                                                    <div className={`inline-block px-3 py-1 border-2 border-black text-[10px] font-black uppercase ${c.verificationStatus === 'approved' ? 'bg-green-400' : c.verificationStatus === 'rejected' ? 'bg-red-400' : 'bg-yellow-200'}`}>
                                                        {c.verificationStatus || 'PENDING'}
                                                    </div>
                                                </td>
                                                <td className="p-4 border-l-2 border-black">
                                                    <div className="flex gap-2 justify-center">
                                                        <button
                                                            onClick={() => handleVerifyCampaign(c.id, 'approved')}
                                                            className="bg-green-400 border-2 border-black p-1 hover:bg-green-500 transition-colors"
                                                            title="Approve"
                                                        >
                                                            ✅
                                                        </button>
                                                        <button
                                                            onClick={() => handleVerifyCampaign(c.id, 'rejected')}
                                                            className="bg-red-400 border-2 border-black p-1 hover:bg-red-500 transition-colors"
                                                            title="Reject"
                                                        >
                                                            ❌
                                                        </button>
                                                    </div>
                                                </td>
                                                <td className="p-4 text-right border-l-2 border-black">
                                                    <button
                                                        onClick={() => c.onChainId !== undefined && stopCampaign(c.onChainId)}
                                                        disabled={!c.active || isLoading}
                                                        className="bg-black text-white px-4 py-2 text-[10px] font-black uppercase hover:bg-red-600 disabled:opacity-30 border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,0.2)] active:shadow-none"
                                                    >
                                                        STOP_FLOW
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    </div>

                    {/* Sidebar Components */}
                    <div className="space-y-12">

                        {/* Publisher Verification */}
                        <section className="bg-white border-4 border-black shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]">
                            <div className="bg-pink-500 text-white p-6 font-black uppercase text-lg border-b-4 border-black">
                                Publisher Audit
                            </div>
                            <div className="p-6 space-y-4 max-h-[600px] overflow-y-auto">
                                {publishers.map(p => (
                                    <div key={p.id} className="border-2 border-black p-4 bg-gray-50 flex flex-col gap-3">
                                        <div>
                                            <h4 className="font-black text-xs uppercase">{p.domain}</h4>
                                            <p className="text-[10px] font-bold opacity-40 break-all">{p.wallet}</p>
                                        </div>
                                        <button
                                            onClick={() => handleVerifyPublisher(p.id, !p.verified)}
                                            className={`w-full py-2 font-black uppercase text-[10px] border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none transition-all ${p.verified ? 'bg-red-200 hover:bg-red-300' : 'bg-green-200 hover:bg-green-300'
                                                }`}
                                        >
                                            {p.verified ? 'Revoke_Status' : 'Approve_Publisher'}
                                        </button>
                                    </div>
                                ))}
                                {publishers.length === 0 && <p className="text-[10px] font-bold uppercase opacity-40 italic">No publishers found.</p>}
                            </div>
                        </section>

                        {/* System Log */}
                        <section className="bg-black text-green-400 p-6 border-4 border-black shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]">
                            <h3 className="text-xs font-black uppercase mb-4 text-white underline">Admin_Manual</h3>
                            <div className="text-[10px] font-mono space-y-2 uppercase leading-relaxed">
                                <p className="flex gap-2"><span>[INFO]</span> <span>Connected: {address?.slice(0, 6)}...{address?.slice(-4)}</span></p>
                                <p className="flex gap-2 text-yellow-400"><span>[WARN]</span> <span>All DB writes require admin signature.</span></p>
                                <p className="flex gap-2 text-pink-500"><span>[WARN]</span> <span>On-chain STOP is permanent.</span></p>
                                <p className="mt-4 opacity-60 italic">Ready for input...</p>
                            </div>
                        </section>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default BackofficePage;
