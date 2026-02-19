'use client'

import { useEffect, useMemo, useState } from 'react'
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
}

export default function EditCampaignPage({ params }: { params: { id: string } }) {
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

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/campaigns/detail?id=${encodeURIComponent(params.id)}`)
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
  }, [params.id])

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
        id: params.id,
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
    return <div className="min-h-screen p-6">Loading campaign...</div>
  }

  if (!campaign) {
    return <div className="min-h-screen p-6">Campaign not found.</div>
  }

  return (
    <div className="max-w-2xl mx-auto p-6 bg-card border border-border rounded-xl shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <button type="button" onClick={() => router.back()} className="btn btn-outline px-4 py-2">
          Back
        </button>
      </div>
      <h1 className="text-2xl font-bold mb-4">Edit Campaign</h1>
      <div className="text-xs text-foreground/60 mb-6">{formatHint}</div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm mb-1">Campaign Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-border rounded-md" />
        </div>
        <div>
          <label className="block text-sm mb-1">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full px-3 py-2 border border-border rounded-md" />
        </div>
        <div>
          <label className="block text-sm mb-1">Creative URL</label>
          <input value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} className="w-full px-3 py-2 border border-border rounded-md" />
          <div className="mt-2">
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
              className="block w-full text-sm"
            />
          </div>
          {uploading ? <p className="text-xs mt-1">Uploading...</p> : null}
        </div>
        <div>
          <label className="block text-sm mb-1">Target URL</label>
          <input value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} className="w-full px-3 py-2 border border-border rounded-md" />
        </div>
        <div>
          <label className="block text-sm mb-1">Tags (comma separated)</label>
          <input value={tags} onChange={(e) => setTags(e.target.value)} className="w-full px-3 py-2 border border-border rounded-md" />
        </div>
        <div>
          <label className="block text-sm mb-1">Target Locations (comma separated)</label>
          <input value={targetLocations} onChange={(e) => setTargetLocations(e.target.value)} className="w-full px-3 py-2 border border-border rounded-md" />
        </div>
      </div>

      {error ? <div className="mt-4 text-sm text-red-500">{error}</div> : null}

      <div className="mt-6 flex justify-end">
        <button onClick={onSave} disabled={isSaving || uploading} className="btn btn-primary px-6 py-2">
          {isSaving ? 'Saving...' : 'Save Campaign'}
        </button>
      </div>
    </div>
  )
}
