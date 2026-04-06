'use client';

import React, { useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { useStreamingAds } from '../../hooks/useStreamingAds';
import { GOODDOLLAR_ADDRESS, chainId } from '@/lib/chain-config';
import { getTokenInfo, getTokenLabel } from '@/lib/tokens';

const ERC20_BALANCE_ABI = [{
  name: 'balanceOf',
  type: 'function',
  stateMutability: 'view',
  inputs: [{ name: 'owner', type: 'address' }],
  outputs: [{ type: 'uint256' }],
}] as const;

interface CampaignFormData {
  name: string;
  description: string;
  bannerUrl: string;
  targetUrl: string;
  budget: string;
  cpc: string;
  duration: string;
  tokenAddress: string;
  tags: string;
  targetLocations: string;
  metadata: string;
  mediaType: 'image' | 'video';
}

// ─── Collapsible advanced metadata panel ────────────────────────────────────
function AdvancedMetadata({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-2 border-black">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[#F5F3F0] text-[10px] font-black uppercase tracking-[0.2em] hover:bg-[#e8e6e3] transition-colors"
      >
        <span>Advanced — Custom Metadata (JSON)</span>
        <span className="text-[12px]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="p-4 bg-white border-t-2 border-black space-y-2">
          <textarea
            name="metadata"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={4}
            className="w-full border-2 border-black px-3 py-2 font-mono text-[12px] focus:outline-none bg-white resize-none"
            placeholder='{"audience": "builders", "cta": "Join the beta"}'
          />
          <p className="text-[9px] font-black uppercase tracking-widest text-[#999999]">
            Optional structured metadata for publisher context. Must be valid JSON.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Step indicator ──────────────────────────────────────────────────────────
const TABS = ['details', 'budget', 'dates'] as const
type Tab = typeof TABS[number]

function StepBar({
  active,
  onSelect,
}: {
  active: Tab
  onSelect: (t: Tab) => void
}) {
  return (
    <div className="flex items-center gap-0 mb-10">
      {TABS.map((tab, i) => {
        const done = TABS.indexOf(active) > i
        const current = active === tab
        return (
          <React.Fragment key={tab}>
            <button
              type="button"
              onClick={() => onSelect(tab)}
              className={[
                'flex items-center gap-2 px-3 py-2 border-2 border-black text-[10px] font-black uppercase tracking-wider transition-all',
                current
                  ? 'bg-black text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] -translate-x-px -translate-y-px'
                  : done
                  ? 'bg-[#22c55e] text-white border-black'
                  : 'bg-white text-[#999999] hover:bg-[#F5F3F0]',
              ].join(' ')}
            >
              <span className="flex h-5 w-5 items-center justify-center border border-current text-[9px] rounded-none">
                {done ? '✓' : i + 1}
              </span>
              <span className="hidden sm:inline">{tab}</span>
            </button>
            {i < TABS.length - 1 && (
              <div className="flex-1 h-0.5 bg-black mx-0 max-w-[32px]" />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function CreateCampaign() {
  const { address } = useAccount();
  const { createStreamingCampaign, isLoading, error } = useStreamingAds();

  const { data: gdollarBalanceRaw } = useReadContract({
    address: GOODDOLLAR_ADDRESS as `0x${string}`,
    abi: ERC20_BALANCE_ABI,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    chainId,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });
  const gdollarBalance = gdollarBalanceRaw != null
    ? parseFloat(formatUnits(gdollarBalanceRaw as bigint, 18)).toFixed(4)
    : null;

  const [formData, setFormData] = useState<CampaignFormData>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('clone') === 'true') {
        return {
          name: params.get('name') || '',
          description: params.get('description') || '',
          bannerUrl: params.get('bannerUrl') || '',
          targetUrl: params.get('targetUrl') || '',
          budget: params.get('budget') || '',
          cpc: params.get('cpc') || '0.01',
          duration: '',
          tokenAddress: params.get('tokenAddress') || '',
          tags: params.get('tags') || '',
          targetLocations: params.get('targetLocations') || '',
          metadata: '',
          mediaType: (params.get('mediaType') as 'image' | 'video') || 'image',
        }
      }
    }
    return {
      name: '',
      description: '',
      bannerUrl: '',
      targetUrl: '',
      budget: '',
      cpc: '0.01',
      duration: '',
      tokenAddress: GOODDOLLAR_ADDRESS,
      tags: '',
      targetLocations: '',
      metadata: '',
      mediaType: 'image',
    }
  });

  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('details');

  const selectedTokenInfo = getTokenInfo(formData.tokenAddress) || { symbol: 'TOKEN', name: 'Token', decimals: 18, address: '' };

  const [uploading, setUploading] = useState(false);
  const [bannerPreview, setBannerPreview] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const supportedTokens = [GOODDOLLAR_ADDRESS];

  const generateCampaignId = () => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 100).toString().padStart(2, '0');
    return `sovads-${month}-${day}-${random}`;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const validateForm = (): string | null => {
    if (!formData.name.trim()) return 'Campaign name is required';
    if (!formData.description.trim()) return 'Description is required';
    if (!formData.bannerUrl.trim()) return 'Creative media URL is required';
    if (!formData.targetUrl.trim()) return 'Target URL is required';
    if (!formData.budget || parseFloat(formData.budget) < 0.0001) return 'Budget must be at least 0.0001';
    if (!formData.tokenAddress) return 'Token address is required';
    if (!startDate || !startTime) return 'Start date and time are required';
    if (!endDate || !endTime) return 'End date and time are required';
    const startIso = `${startDate}T${startTime}`;
    const endIso = `${endDate}T${endTime}`;
    if (new Date(startIso) > new Date(endIso)) return 'Start must be before end';
    try { new URL(formData.targetUrl) } catch {
      try { new URL(`https://${formData.targetUrl}`) } catch { return 'Please enter a valid target URL' }
    }
    return null;
  };

  const tabForError = (msg: string | null): Tab | null => {
    if (!msg) return null;
    if (/name|description|creative|landing|target url/i.test(msg)) return 'details';
    if (/budget|token/i.test(msg)) return 'budget';
    if (/start|end|date|time/i.test(msg)) return 'dates';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address) { setSubmitError('Please connect your wallet'); return; }
    const validationError = validateForm();
    if (validationError) {
      setSubmitError(validationError);
      const targetTab = tabForError(validationError);
      if (targetTab && targetTab !== activeTab) setActiveTab(targetTab);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const campaignId = generateCampaignId();
      const startIso = `${startDate}T${startTime}`;
      const endIso = `${endDate}T${endTime}`;
      const normalizedTargetUrl = /^(https?:)?\/\//i.test(formData.targetUrl)
        ? formData.targetUrl
        : `https://${formData.targetUrl}`;

      const onChainMetadata = JSON.stringify({
        id: campaignId, name: formData.name, description: formData.description,
        bannerUrl: formData.bannerUrl, targetUrl: normalizedTargetUrl,
        cpc: formData.cpc, startDate: startIso, endDate: endIso,
        createdAt: new Date().toISOString(),
      });

      const durationSeconds = Math.max(1, Math.floor((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000));
      const { hash: txHash, id: onChainId } = await createStreamingCampaign(formData.budget, durationSeconds, onChainMetadata);

      const parsedTags = formData.tags.split(',').map((t) => t.trim()).filter(Boolean);
      const parsedLocations = formData.targetLocations.split(',').map((l) => l.trim()).filter(Boolean);

      let metadataObject: Record<string, unknown> | undefined;
      if (formData.metadata.trim()) {
        try { metadataObject = JSON.parse(formData.metadata) } catch {
          setSubmitError('Metadata must be valid JSON'); setIsSubmitting(false); return;
        }
      }

      const resp = await fetch('/api/campaigns/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: address,
          campaignData: { ...formData, tags: parsedTags, targetLocations: parsedLocations, metadata: metadataObject },
          transactionHash: txHash,
          contractCampaignId: campaignId,
          onChainId,
          startDate: startIso,
          endDate: endIso,
          targetUrl: normalizedTargetUrl,
        }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data?.error || data?.details || 'Failed to save campaign');
      }

      setSuccess(true);
      setFormData({ name: '', description: '', bannerUrl: '', targetUrl: '', budget: '', cpc: '0.01', duration: '', tokenAddress: supportedTokens[0] || '', tags: '', targetLocations: '', metadata: '', mediaType: 'image' });
      setStartDate(''); setStartTime(''); setEndDate(''); setEndTime(''); setBannerPreview('');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create campaign');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Success screen ──────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen bg-[#F5F3F0] flex items-center justify-center p-6">
        <div className="bg-white border-2 border-black p-12 text-center shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-w-md w-full">
          <div className="inline-flex h-16 w-16 items-center justify-center border-2 border-black bg-[#22c55e] text-white text-3xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] mb-6">
            ✓
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#666666] mb-2">Done</p>
          <h1 className="text-[22px] font-black uppercase tracking-tight text-[#141414] mb-3">Campaign Created</h1>
          <p className="text-[13px] text-[#666666] leading-5 mb-8">
            Your campaign is live on-chain. It will begin serving once the start date is reached.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button onClick={() => setSuccess(false)} className="border-2 border-black bg-black text-white px-5 py-2.5 text-[10px] font-black uppercase tracking-wider hover:bg-[#222222]">
              Create Another
            </button>
            <a href="/advertiser" className="border-2 border-black bg-white text-black px-5 py-2.5 text-[10px] font-black uppercase tracking-wider hover:bg-[#F5F3F0] text-center">
              Dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F5F3F0] py-12 px-4">
      <div className="max-w-2xl mx-auto">

        {/* Page header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#666666]">Advertiser</p>
            <h1 className="text-[26px] font-black uppercase tracking-tight text-[#141414]">New Campaign</h1>
          </div>
          <button
            type="button"
            onClick={() => { if (typeof window !== 'undefined') window.history.back(); }}
            className="border-2 border-black px-3 py-1.5 text-[10px] font-black uppercase tracking-wider hover:bg-[#e8e6e3] bg-white"
          >
            ← Back
          </button>
        </div>

        {/* Step bar */}
        <StepBar active={activeTab} onSelect={setActiveTab} />

        {/* Form card */}
        <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <form onSubmit={handleSubmit}>

            {/* ── Details ── */}
            {activeTab === 'details' && (
              <div className="p-8 space-y-7">
                <div>
                  <label htmlFor="name" className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-2">
                    Campaign Name *
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    className="w-full border-2 border-black px-3 py-2.5 text-[13px] font-medium focus:outline-none bg-white"
                    placeholder="My Campaign"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="description" className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-2">
                    Description *
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    rows={3}
                    className="w-full border-2 border-black px-3 py-2.5 text-[13px] font-medium focus:outline-none bg-white resize-none"
                    placeholder="Describe your campaign"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-2">
                    Creative (image, GIF, or video) *
                  </label>
                  <input
                    type="file"
                    accept="image/*,video/*,.gif"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploading(true);
                      setSubmitError(null);
                      try {
                        const form = new FormData();
                        form.append('image', file);
                        const res = await fetch('/api/uploads/image', { method: 'POST', body: form });
                        if (!res.ok) {
                          const errorData = await res.json().catch(() => ({}));
                          throw new Error(errorData.error || 'Upload failed');
                        }
                        const data = await res.json();
                        setFormData((prev) => ({ ...prev, bannerUrl: data.url, mediaType: data.mediaType === 'video' ? 'video' : 'image' }));
                        setBannerPreview(data.url);
                      } catch (err) {
                        setSubmitError(err instanceof Error ? err.message : 'Failed to upload media');
                      } finally {
                        setUploading(false);
                      }
                    }}
                    className="block w-full text-[12px] border-2 border-black px-3 py-2 bg-[#F5F3F0] cursor-pointer file:mr-3 file:border-0 file:bg-black file:text-white file:px-3 file:py-1 file:text-[10px] file:font-black file:uppercase file:cursor-pointer hover:bg-[#e8e6e3]"
                    disabled={uploading}
                  />
                  {uploading && (
                    <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-[#666666]">Uploading…</p>
                  )}
                  {bannerPreview && !uploading && (
                    <div className="mt-4 border-2 border-black bg-black overflow-hidden" style={{ maxHeight: '160px' }}>
                      {formData.mediaType === 'video' ? (
                        <video src={bannerPreview} className="w-full h-full object-contain" controls playsInline muted style={{ maxHeight: '160px' }} />
                      ) : (
                        <img src={bannerPreview} alt="Preview" className="w-full object-contain" style={{ maxHeight: '160px' }} />
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor="targetUrl" className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-2">
                    Landing URL *
                  </label>
                  <input
                    type="url"
                    id="targetUrl"
                    name="targetUrl"
                    value={formData.targetUrl}
                    onChange={handleInputChange}
                    className="w-full border-2 border-black px-3 py-2.5 text-[13px] font-medium focus:outline-none bg-white"
                    placeholder="https://example.com"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="tags" className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-2">
                      Tags
                    </label>
                    <input
                      type="text"
                      id="tags"
                      name="tags"
                      value={formData.tags}
                      onChange={handleInputChange}
                      className="w-full border-2 border-black px-3 py-2.5 text-[13px] font-medium focus:outline-none bg-white"
                      placeholder="DeFi, NFTs, web3"
                    />
                  </div>
                  <div>
                    <label htmlFor="targetLocations" className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-2">
                      Geo
                    </label>
                    <input
                      type="text"
                      id="targetLocations"
                      name="targetLocations"
                      value={formData.targetLocations}
                      onChange={handleInputChange}
                      className="w-full border-2 border-black px-3 py-2.5 text-[13px] font-medium focus:outline-none bg-white"
                      placeholder="Global, US, UK"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ── Budget ── */}
            {activeTab === 'budget' && (
              <div className="p-8 space-y-7">
                <div>
                  <label htmlFor="tokenAddress" className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-2">
                    Payment Token *
                  </label>
                  <select
                    id="tokenAddress"
                    name="tokenAddress"
                    value={formData.tokenAddress}
                    onChange={handleInputChange}
                    className="w-full border-2 border-black px-3 py-2.5 text-[13px] font-medium focus:outline-none bg-white"
                    required
                  >
                    <option value="">Select a token</option>
                    {supportedTokens.map((token, i) => (
                      <option key={i} value={token}>{getTokenLabel(token)}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="budget" className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-2">
                      Budget ({selectedTokenInfo.symbol}) *
                      {gdollarBalance !== null && (
                        <span className="ml-2 normal-case tracking-normal font-medium text-[#666666]">
                          — Balance: <span className="text-[#141414] font-black">{gdollarBalance} G$</span>
                        </span>
                      )}
                    </label>
                    <input
                      type="number"
                      id="budget"
                      name="budget"
                      value={formData.budget}
                      onChange={handleInputChange}
                      step="0.0001"
                      min="0.0001"
                      max={gdollarBalance ?? undefined}
                      className="w-full border-2 border-black px-3 py-2.5 text-[13px] font-medium focus:outline-none bg-white"
                      placeholder="1.0"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="cpc" className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-2">
                      Cost Per Click ({selectedTokenInfo.symbol})
                    </label>
                    <input
                      type="number"
                      id="cpc"
                      name="cpc"
                      value={formData.cpc}
                      readOnly
                      disabled
                      className="w-full border-2 border-black px-3 py-2.5 text-[13px] font-medium bg-[#F5F3F0] opacity-60"
                    />
                    <p className="text-[9px] font-black uppercase tracking-widest text-[#999999] mt-1.5">Fixed at 0.002 {selectedTokenInfo.symbol}.</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Dates ── */}
            {activeTab === 'dates' && (
              <div className="p-8 space-y-7">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-5">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-2">Start Date *</label>
                      <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full border-2 border-black px-3 py-2.5 text-[13px] font-medium focus:outline-none bg-white" required />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-2">Start Time *</label>
                      <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full border-2 border-black px-3 py-2.5 text-[13px] font-medium focus:outline-none bg-white" required />
                    </div>
                  </div>
                  <div className="space-y-5">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-2">End Date *</label>
                      <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full border-2 border-black px-3 py-2.5 text-[13px] font-medium focus:outline-none bg-white" required />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-2">End Time *</label>
                      <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full border-2 border-black px-3 py-2.5 text-[13px] font-medium focus:outline-none bg-white" required />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Error */}
            {(error || submitError) && (
              <div className="mx-8 mb-6 border-2 border-black bg-[#fef2f2] px-4 py-3">
                <p className="text-[11px] font-black uppercase text-[#ef4444]">{error || submitError}</p>
              </div>
            )}

            {/* Footer controls */}
            <div className="border-t-2 border-black px-8 py-5 flex items-center justify-between gap-4 bg-[#F5F3F0]">
              <button
                type="button"
                onClick={() => {
                  if (activeTab === 'budget') setActiveTab('details');
                  else if (activeTab === 'dates') setActiveTab('budget');
                }}
                disabled={activeTab === 'details'}
                className="border-2 border-black px-4 py-2 text-[10px] font-black uppercase tracking-wider bg-white hover:bg-[#e8e6e3] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ← Back
              </button>

              <div className="flex items-center gap-3">
                {!address && (
                  <span className="text-[10px] font-black uppercase text-[#ef4444]">Connect wallet first</span>
                )}
                {activeTab !== 'dates' ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (activeTab === 'details') setActiveTab('budget');
                      else if (activeTab === 'budget') setActiveTab('dates');
                    }}
                    className="border-2 border-black bg-black text-white px-5 py-2 text-[10px] font-black uppercase tracking-wider hover:bg-[#222222] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                  >
                    Next →
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={isSubmitting || isLoading || !address}
                    className="border-2 border-black bg-black text-white px-6 py-2 text-[10px] font-black uppercase tracking-wider hover:bg-[#222222] disabled:opacity-50 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                  >
                    {isSubmitting ? 'Creating…' : 'Create Campaign'}
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>

        {/* Advanced metadata — lives outside the main form card */}
        <div className="mt-4">
          <AdvancedMetadata
            value={formData.metadata}
            onChange={(v) => setFormData((prev) => ({ ...prev, metadata: v }))}
          />
        </div>

      </div>
    </div>
  );
}

