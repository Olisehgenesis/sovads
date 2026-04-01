'use client';

import React, { useState } from 'react';
import { useAccount } from 'wagmi';
import { useStreamingAds } from '../../hooks/useStreamingAds';
import { GOODDOLLAR_ADDRESS } from '@/lib/chain-config';
import { getTokenInfo, getTokenLabel } from '@/lib/tokens';

interface CampaignFormData {
  name: string;
  description: string;
  bannerUrl: string;
  targetUrl: string;
  budget: string;
  cpc: string;
  duration: string; // in days
  tokenAddress: string;
  tags: string;
  targetLocations: string;
  metadata: string;
  mediaType: 'image' | 'video';
}

export default function CreateCampaign() {
  const { address } = useAccount();
  const { createStreamingCampaign, isLoading, error } = useStreamingAds();

  const [formData, setFormData] = useState<CampaignFormData>(() => {
    // Check if cloning from URL params
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('clone') === 'true') {
        return {
          name: params.get('name') || '',
          description: params.get('description') || '',
          bannerUrl: params.get('bannerUrl') || '',
          targetUrl: params.get('targetUrl') || '',
          budget: params.get('budget') || '',
          cpc: params.get('cpc') || '0.002',
          duration: '',
          tokenAddress: params.get('tokenAddress') || '',
          tags: params.get('tags') || '',
          targetLocations: params.get('targetLocations') || '',
          metadata: '',
          mediaType: (params.get('mediaType') as 'image' | 'video') || 'image'
        }
      }
    }
    return {
      name: '',
      description: '',
      bannerUrl: '',
      targetUrl: '',
      budget: '',
      cpc: '0.002',
      duration: '',
      tokenAddress: GOODDOLLAR_ADDRESS,
      tags: '',
      targetLocations: '',
      metadata: '',
      mediaType: 'image'
    }
  });
  const [startDate, setStartDate] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'details' | 'budget' | 'dates'>('details');

  // Get token info for selected token
  const selectedTokenInfo = getTokenInfo(formData.tokenAddress) || { symbol: 'TOKEN', name: 'Token', decimals: 18, address: '' };

  const [uploading, setUploading] = useState(false);
  const [bannerPreview, setBannerPreview] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Generate unique campaign ID in format sovads-mm-dd-xx
  const generateCampaignId = (): string => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 100).toString().padStart(2, '0');
    return `sovads-${month}-${day}-${random}`;
  };

  // Load supported tokens (default to G$ for now as it's the only one for streaming)
  const supportedTokens = [GOODDOLLAR_ADDRESS];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const validateForm = (): string | null => {
    if (!formData.name.trim()) return 'Campaign name is required';
    if (!formData.description.trim()) return 'Description is required';
    if (!formData.bannerUrl.trim()) return 'Creative media URL is required';
    if (!formData.targetUrl.trim()) return 'Target URL is required';
    if (!formData.budget || parseFloat(formData.budget) < 0.0001) return 'Budget must be at least 0.0001';
    if (!formData.tokenAddress) return 'Token address is required';
    if (!startDate) return 'Start date is required';
    if (!startTime) return 'Start time is required';
    if (!endDate) return 'End date is required';
    if (!endTime) return 'End time is required';
    const startIso = `${startDate}T${startTime}`;
    const endIso = `${endDate}T${endTime}`;
    if (new Date(startIso) > new Date(endIso)) return 'Start date/time must be before end date/time';

    // Validate URLs (accept hostnames like example.com by prepending https:// when needed)
    try {
      new URL(formData.targetUrl);
    } catch {
      try {
        new URL(`https://${formData.targetUrl}`);
      } catch {
        return 'Please enter a valid target URL';
      }
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!address) {
      setSubmitError('Please connect your wallet');
      return;
    }

    const validationError = validateForm();
    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Generate unique campaign ID
      const campaignId = generateCampaignId();

      // Prepare metadata for contract
      const startIso = `${startDate}T${startTime}`;
      const endIso = `${endDate}T${endTime}`;

      // Normalize target URL: prefer provided scheme, otherwise default to https://
      const normalizedTargetUrl = /^(https?:)?\/\//i.test(formData.targetUrl)
        ? formData.targetUrl
        : `https://${formData.targetUrl}`;

      const metadata = JSON.stringify({
        id: campaignId,
        name: formData.name,
        description: formData.description,
        bannerUrl: formData.bannerUrl,
        targetUrl: normalizedTargetUrl,
        cpc: formData.cpc,
        startDate: startIso,
        endDate: endIso,
        createdAt: new Date().toISOString()
      });

      // Step 1: Create campaign on contract first
      console.log('Creating campaign on contract...');
      const start = new Date(startIso).getTime();
      const end = new Date(endIso).getTime();
      const durationSeconds = Math.max(1, Math.floor((end - start) / 1000));
      const { hash: txHash, id: onChainId } = await createStreamingCampaign(
        formData.budget,
        durationSeconds,
        metadata
      );

      console.log(`Campaign created on contract successfully. ID: ${onChainId}`);

      // Step 2: Save to database after successful contract interaction
      console.log('Saving campaign to database...');

      const parsedTags = formData.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)

      const parsedLocations = formData.targetLocations
        .split(',')
        .map((loc) => loc.trim())
        .filter((loc) => loc.length > 0)

      let metadataObject: Record<string, unknown> | undefined
      if (formData.metadata.trim().length > 0) {
        try {
          metadataObject = JSON.parse(formData.metadata)
        } catch (err) {
          console.error('Invalid metadata JSON:', err)
          setSubmitError('Metadata must be valid JSON')
          setIsSubmitting(false)
          return
        }
      }

      const resp = await fetch('/api/campaigns/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: address as `0x${string}`,
          campaignData: {
            ...formData,
            tags: parsedTags,
            targetLocations: parsedLocations,
            metadata: metadataObject,
          },
          transactionHash: txHash,
          contractCampaignId: campaignId, // This is the string ID sovads-mm-dd-xx
          onChainId: onChainId, // This is the numeric ID from contract
          startDate: startIso,
          endDate: endIso,
          targetUrl: normalizedTargetUrl,
        }),
      })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        const errorMessage = data?.error || data?.details || 'Failed to save campaign to database'
        console.error('API error response:', data)
        throw new Error(errorMessage)
      }
      const result = await resp.json()
      console.log('Campaign saved to database:', result.campaign.id);

      setSuccess(true);

      // Reset form
      setFormData({
        name: '',
        description: '',
        bannerUrl: '',
        targetUrl: '',
        budget: '',
        cpc: '0.002',
        duration: '',
        tokenAddress: supportedTokens[0] || '',
        tags: '',
        targetLocations: '',
        metadata: '',
        mediaType: 'image'
      });
      setStartDate('');
      setStartTime('');
      setEndDate('');
      setEndTime('');
      setBannerPreview('');

    } catch (err) {
      console.error('Error creating campaign:', err);
      setSubmitError(err instanceof Error ? err.message : 'Failed to create campaign');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-xl mx-auto p-8">
        <div className="card p-10 bg-white text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center border-2 border-black bg-[var(--accent-success)] text-white text-3xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] mb-6">
            ✓
          </div>
          <h1 className="text-2xl font-heading mb-3">Campaign Created</h1>
          <p className="text-sm text-[var(--text-secondary)] mb-8 max-w-sm mx-auto">
            Your campaign is live on-chain and saved. It will begin serving once the start date is reached.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => setSuccess(false)}
              className="btn btn-primary"
            >
              Create Another
            </button>
            <a href="/advertiser" className="btn btn-outline">Back to Dashboard</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto p-8 card">
      <div className="mb-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => { if (typeof window !== 'undefined') window.history.back(); }}
          className="btn btn-outline text-xs"
        >
          Back
        </button>
      </div>
      <h1 className="text-3xl font-heading mb-8 uppercase">New Campaign</h1>

      {/* Step indicator */}
      <div className="mb-6 flex gap-2 items-center">
        {(['details', 'budget', 'dates'] as const).map((tab, i) => (
          <div key={tab} className="flex items-center gap-2">
            <div className={`flex h-6 w-6 items-center justify-center border-2 border-black text-[10px] font-black ${
              activeTab === tab ? 'bg-black text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]' :
              (['details','budget','dates'].indexOf(activeTab) > i) ? 'bg-[var(--accent-success)] text-white border-black' :
              'bg-white text-black'
            }`}>{(['details','budget','dates'].indexOf(activeTab) > i) ? '✓' : i + 1}</div>
            <span className={`text-[10px] font-black uppercase tracking-wider hidden sm:inline ${
              activeTab === tab ? 'text-black' : 'text-[var(--text-tertiary)]'
            }`}>{tab}</span>
            {i < 2 && <span className="text-[var(--text-tertiary)] text-xs mx-1">—</span>}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="mb-8 flex gap-3">
        <button
          type="button"
          className={`py-2 px-4 font-heading text-xs uppercase border-2 border-black transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${activeTab === 'details' ? 'bg-black text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]' : 'bg-white text-black hover:-translate-x-0.5 hover:-translate-y-0.5'}`}
          onClick={() => setActiveTab('details')}
        >
          Details
        </button>
        <button
          type="button"
          className={`py-2 px-4 font-heading text-xs uppercase border-2 border-black transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${activeTab === 'budget' ? 'bg-black text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]' : 'bg-white text-black hover:-translate-x-0.5 hover:-translate-y-0.5'}`}
          onClick={() => setActiveTab('budget')}
        >
          Budget
        </button>
        <button
          type="button"
          className={`py-2 px-4 font-heading text-xs uppercase border-2 border-black transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${activeTab === 'dates' ? 'bg-black text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]' : 'bg-white text-black hover:-translate-x-0.5 hover:-translate-y-0.5'}`}
          onClick={() => setActiveTab('dates')}
        >
          Dates
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {activeTab === 'details' && (
          <>
            {/* Campaign Name */}
            <div>
              <label htmlFor="name" className="block text-xs font-bold uppercase mb-2">
                Name *
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className="w-full"
                placeholder="Campaign name"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-xs font-bold uppercase mb-2">
                Description *
              </label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={2}
                className="w-full"
                placeholder="Describe your campaign"
                required
              />
            </div>

            {/* Creative Media Upload */}
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-2">
                Creative (image, GIF, or short video) *
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept="image/*,video/*,.gif"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    setUploading(true)
                    setSubmitError(null)
                    try {
                      const form = new FormData()
                      form.append('image', file)
                      const res = await fetch('/api/uploads/image', { method: 'POST', body: form })
                      if (!res.ok) {
                        const errorData = await res.json().catch(() => ({}))
                        throw new Error(errorData.error || 'Upload failed')
                      }
                      const data = await res.json()
                      setFormData(prev => ({
                        ...prev,
                        bannerUrl: data.url,
                        mediaType: data.mediaType === 'video' ? 'video' : 'image'
                      }))
                      setBannerPreview(data.url)
                    } catch (err) {
                      console.error('Upload error', err)
                      setSubmitError(err instanceof Error ? err.message : 'Failed to upload media')
                    } finally {
                      setUploading(false)
                    }
                  }}
                  className="block w-full text-sm file:mr-4 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:text-primary-foreground hover:file:bg-primary/90"
                  disabled={uploading}
                  required
                />
              </div>
              {uploading && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-sm text-foreground/60">Uploading media...</p>
                </div>
              )}
              {bannerPreview && !uploading && (
                <div className="mt-4 border-4 border-black bg-white overflow-hidden shadow-[4px_4px_0px_0px_black]">
                  {formData.mediaType === 'video' ? (
                    <video
                      src={bannerPreview}
                      className="max-h-48 w-full object-contain bg-black"
                      controls
                      playsInline
                      muted
                    />
                  ) : (
                    <img
                      src={bannerPreview}
                      alt="Preview"
                      className="max-h-48 w-full object-contain bg-black"
                    />
                  )}
                </div>
              )}
            </div>

            {/* Target URL */}
            <div>
              <label htmlFor="targetUrl" className="block text-xs font-bold uppercase mb-2">
                URL *
              </label>
              <input
                type="url"
                id="targetUrl"
                name="targetUrl"
                value={formData.targetUrl}
                onChange={handleInputChange}
                className="w-full"
                placeholder="https://example.com"
                required
              />
            </div>

            {/* Tags */}
            <div>
              <label htmlFor="tags" className="block text-xs font-bold uppercase mb-2">
                Tags (comma separated)
              </label>
              <input
                type="text"
                id="tags"
                name="tags"
                value={formData.tags}
                onChange={handleInputChange}
                className="w-full"
                placeholder="DeFi, NFTs, web3 gaming"
              />
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                Add keywords that describe your campaign.
              </p>
            </div>

            {/* Target Locations */}
            <div>
              <label htmlFor="targetLocations" className="block text-xs font-bold uppercase mb-2">
                Geo
              </label>
              <input
                type="text"
                id="targetLocations"
                name="targetLocations"
                value={formData.targetLocations}
                onChange={handleInputChange}
                className="w-full"
                placeholder="Global, US, UK"
              />
            </div>

            {/* Metadata */}
            <div>
              <label htmlFor="metadata" className="block text-xs font-bold uppercase mb-2">
                Additional Metadata (JSON)
              </label>
              <textarea
                id="metadata"
                name="metadata"
                value={formData.metadata}
                onChange={handleInputChange}
                rows={3}
                className="w-full font-mono text-sm"
                placeholder='{"audience": "builders", "cta": "Join the beta"}'
              />
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                Optional structured metadata for publisher context.
              </p>
            </div>
          </>
        )}

        {activeTab === 'budget' && (
          <>
            {/* Token first */}
            <div>
              <label htmlFor="tokenAddress" className="block text-xs font-bold uppercase mb-2">
                Payment Token *
              </label>
              <select
                id="tokenAddress"
                name="tokenAddress"
                value={formData.tokenAddress}
                onChange={handleInputChange}
                className="w-full"
                required
              >
                <option value="">Select a token</option>
                {supportedTokens.map((token, index) => {
                  const label = getTokenLabel(token);
                  return (
                    <option key={index} value={token}>{label}</option>
                  );
                })}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="budget" className="block text-xs font-bold uppercase mb-2">
                  Budget ({selectedTokenInfo.symbol}) *
                </label>
                <input
                  type="number"
                  id="budget"
                  name="budget"
                  value={formData.budget}
                  onChange={handleInputChange}
                  step="0.0001"
                  min="0.0001"
                  className="w-full"
                  placeholder="1.0"
                  required
                />
              </div>
              <div>
                <label htmlFor="cpc" className="block text-xs font-bold uppercase mb-2">
                  Cost Per Click ({selectedTokenInfo.symbol})
                </label>
                <input
                  type="number"
                  id="cpc"
                  name="cpc"
                  value={formData.cpc}
                  readOnly
                  disabled
                  className="w-full opacity-60"
                />
                <p className="text-xs text-[var(--text-tertiary)] mt-1">Fixed at 0.002 {selectedTokenInfo.symbol}.</p>
              </div>
            </div>

            {/* Duration removed; computed from Start and End dates */}
          </>
        )}

        {activeTab === 'dates' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase mb-2">Start Date *</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full"
                required
              />
              <label className="block text-xs font-bold uppercase mt-4 mb-2">Start Time *</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase mb-2">End Date *</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full"
                required
              />
              <label className="block text-xs font-bold uppercase mt-4 mb-2">End Time *</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full"
                required
              />
            </div>
          </div>
        )}

        {/* Error Messages */}
        {(error || submitError) && (
          <div className="border-2 border-black bg-red-100 p-4 font-bold text-xs uppercase text-red-700">
            {error || submitError}
          </div>
        )}

        {/* Wizard Controls */}
        <div className="flex items-center justify-between gap-4 pt-4">
          <button
            type="button"
            className="btn btn-outline text-xs"
            onClick={() => {
              if (activeTab === 'budget') setActiveTab('details')
              else if (activeTab === 'dates') setActiveTab('budget')
            }}
            disabled={activeTab === 'details'}
          >Back</button>

          {activeTab !== 'dates' ? (
            <button
              type="button"
              className="btn btn-primary text-xs"
              onClick={() => {
                if (activeTab === 'details') setActiveTab('budget')
                else if (activeTab === 'budget') setActiveTab('dates')
              }}
            >Next</button>
          ) : (
            <button
              type="submit"
              disabled={isSubmitting || isLoading || !address}
              className="btn btn-primary text-xs"
            >
              {isSubmitting ? '...' : 'Create'}
            </button>
          )}
        </div>

        {!address && (
          <p className="text-center text-xs font-bold uppercase text-[var(--text-secondary)] border-2 border-black bg-[#F5F3F0] p-3">
            Connect your wallet to create a campaign
          </p>
        )}
      </form>
    </div>
  );
}
