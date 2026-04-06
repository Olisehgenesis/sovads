'use client'

import { useEffect, useMemo, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'
import {
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_VIDEO_EXTENSIONS,
  getAllowedCreativeFormatLabel,
  hasAllowedCreativeExtension,
} from '@/lib/creative-validation'

type CampaignPayload = {
  id: string
  name: string
  description?: string
  bannerUrl: string
  targetUrl: string
  tags?: string[]
  targetLocations?: string[]
  mediaType?: 'image' | 'video'
  advertiserId?: string
}

export default function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { address } = useAccount()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [campaign, setCampaign] = useState<CampaignPayload | null>(null)
  const [uploading, setUploading] = useState(false)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [bannerUrl, setBannerUrl] = useState('')
  const [targetUrl, setTargetUrl] = useState('')
  const [tags, setTags] = useState('')
  const [targetLocations, setTargetLocations] = useState('')

  const formatHint = useMemo(
    () =>
      `${getAllowedCreativeFormatLabel()} URL must include extension (${[
        ...ALLOWED_IMAGE_EXTENSIONS,
        ...ALLOWED_VIDEO_EXTENSIONS,
      ].join(', ')}).`,
    []
  )

  // live preview derived from current bannerUrl state
  const previewUrl = bannerUrl.startsWith('http') ? bannerUrl : ''
  const previewIsVideo = /\.(mp4|webm|ogv|mov)/i.test(bannerUrl)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/campaigns/detail?id=${encodeURIComponent(id)}`)
        if (!res.ok) throw new Error('Failed to load campaign')
        const data = await res.json()
        const c = data.campaign as CampaignPayload
        setCampaign(c)
        setName(c.name || '')
        setDescription(c.description || '')
        setBannerUrl(c.bannerUrl || '')
        setTargetUrl(c.targetUrl || '')
        setTags((c.tags || []).join(', '))
        setTargetLocations((c.targetLocations || []).join(', '))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load campaign')
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [id])

  const onSave = async () => {
    if (!address) {
      setError('Connect wallet to edit campaign')
      return
    }
    if (!name.trim() || !description.trim() || !bannerUrl.trim() || !targetUrl.trim()) {
      setError('Name, description, creative URL, and target URL are required')
      return
    }
    if (!hasAllowedCreativeExtension(bannerUrl)) {
      setError(`Unsupported creative format. ${getAllowedCreativeFormatLabel()}`)
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      const payload = {
        wallet: address,
        id,
        updates: {
          name,
          description,
          bannerUrl,
          targetUrl,
          tags: tags
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean),
          targetLocations: targetLocations
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean),
        },
      }
      const res = await fetch('/api/campaigns/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to update campaign')
      }
      router.push('/advertiser')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update campaign')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F5F3F0] flex items-center justify-center">
        <p className="text-[12px] font-black uppercase tracking-widest text-[#666666]">Loading campaign…</p>
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="min-h-screen bg-[#F5F3F0] flex items-center justify-center">
        <div className="border-2 border-black bg-white p-8 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <p className="text-[13px] font-black uppercase text-[#ef4444]">Campaign not found.</p>
          <button
            type="button"
            onClick={() => router.back()}
            className="mt-4 border-2 border-black px-4 py-2 text-[10px] font-black uppercase tracking-wider hover:bg-[#F5F3F0]"
          >
            Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F5F3F0] p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="border-b-2 border-black pb-4 mb-6 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#666666]">Campaign</p>
            <h1 className="text-[20px] font-black uppercase tracking-tight text-[#141414]">Edit Campaign</h1>
          </div>
          <button
            type="button"
            onClick={() => router.back()}
            className="border-2 border-black px-3 py-1.5 text-[10px] font-black uppercase tracking-wider hover:bg-[#e8e6e3] bg-white"
          >
            ← Back
          </button>
        </div>

        <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-6 space-y-5">
          {/* Format hint */}
          <p className="text-[9px] font-black uppercase tracking-widest text-[#999999]">{formatHint}</p>

          {/* Live creative preview */}
          {previewUrl && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-2">Creative Preview</p>
              <div className="border-2 border-black bg-black overflow-hidden" style={{ height: '120px' }}>
                {previewIsVideo ? (
                  <video src={previewUrl} className="w-full h-full object-contain" muted playsInline />
                ) : (
                  <img src={previewUrl} alt="Creative preview" className="w-full h-full object-contain" />
                )}
              </div>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-1">
              Campaign Name *
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border-2 border-black px-3 py-2 text-[13px] font-medium focus:outline-none bg-white"
              placeholder="My Campaign"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-1">
              Description *
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full border-2 border-black px-3 py-2 text-[13px] font-medium focus:outline-none bg-white resize-none"
              placeholder="Describe your campaign"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-1">
              Creative URL *
            </label>
            <input
              value={bannerUrl}
              onChange={(e) => setBannerUrl(e.target.value)}
              className="w-full border-2 border-black px-3 py-2 text-[13px] font-medium focus:outline-none bg-white mb-2"
              placeholder="https://cdn.example.com/banner.png"
            />
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#999999] mb-1">
              — or upload a new file —
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/ogg,video/quicktime"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                setUploading(true)
                setError(null)
                try {
                  const form = new FormData()
                  form.append('image', file)
                  const res = await fetch('/api/uploads/image', { method: 'POST', body: form })
                  if (!res.ok) {
                    const data = await res.json().catch(() => ({}))
                    throw new Error(data.error || 'Upload failed')
                  }
                  const data = await res.json()
                  setBannerUrl(data.url)
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Upload failed')
                } finally {
                  setUploading(false)
                }
              }}
              className="block w-full text-[11px]"
              disabled={uploading}
            />
            {uploading && (
              <p className="text-[10px] font-black uppercase tracking-wider text-[#666666] mt-1">Uploading…</p>
            )}
            <p className="text-[9px] text-[#999999] mt-1">
              Images: JPG, PNG, WEBP, GIF (max 10 MB). Videos: MP4, WEBM, MOV (max 25 MB, 30 s).
            </p>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-1">
              Target URL *
            </label>
            <input
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              className="w-full border-2 border-black px-3 py-2 text-[13px] font-medium focus:outline-none bg-white"
              placeholder="https://yoursite.com"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-1">
              Tags (comma-separated)
            </label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full border-2 border-black px-3 py-2 text-[13px] font-medium focus:outline-none bg-white"
              placeholder="defi, web3, nft"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] mb-1">
              Target Locations (comma-separated)
            </label>
            <input
              value={targetLocations}
              onChange={(e) => setTargetLocations(e.target.value)}
              className="w-full border-2 border-black px-3 py-2 text-[13px] font-medium focus:outline-none bg-white"
              placeholder="US, EU, NG"
            />
          </div>

          {!address && (
            <div className="border-2 border-black bg-[#fef2f2] p-3">
              <p className="text-[11px] font-black uppercase text-[#ef4444]">Connect your wallet to save changes.</p>
            </div>
          )}

          {error && (
            <div className="border-2 border-black bg-[#fef2f2] p-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
              <p className="text-[11px] font-black uppercase text-[#ef4444]">{error}</p>
            </div>
          )}

          {bannerUrl !== campaign.bannerUrl && (
            <div className="border-2 border-black bg-[#fffbeb] p-3">
              <p className="text-[10px] font-black uppercase text-[#b45309]">
                ⚠ Changing the creative will submit it for re-moderation. Your campaign will be paused until it is approved.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="border-2 border-black px-4 py-2 text-[10px] font-black uppercase tracking-wider hover:bg-[#F5F3F0] bg-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving || uploading || !address}
              className="border-2 border-black bg-black text-white px-6 py-2 text-[10px] font-black uppercase tracking-wider hover:bg-[#222222] disabled:opacity-50 transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
            >
              {isSaving ? 'Saving…' : 'Save Campaign'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

