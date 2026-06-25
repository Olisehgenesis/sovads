'use client'

import { useEffect, useMemo, useState } from 'react'
import AdvertiserIcon from './AdvertiserIcon'
import { Alert, Button, Field, TextInput, TextArea } from './ui'
import type { Campaign } from './types'
import { useCampaignTasks } from '@/hooks/useCampaignTasks'
import { validateHttpUrl } from '@/lib/url-validation'
import { MIN_CTA_REWARD_GS } from '@/lib/campaign-limits'

interface Props {
  campaign: Campaign
  ownerAddress?: string
  onClose: () => void
  onSaved: () => void
}

/** Format an ISO string (or Date) for the native <input type="datetime-local"> control. */
const toDateTimeLocal = (iso: string | null | undefined): string => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  // datetime-local wants "YYYY-MM-DDTHH:mm" in *local* time.
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Convert a Date back into the format above. */
const formatDateForInput = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Whole-day delta between two dates (ceil so a 6-day-23h run counts as 7). */
const daysBetween = (startStr: string, endStr: string): number | null => {
  if (!startStr || !endStr) return null
  const start = new Date(startStr).getTime()
  const end = new Date(endStr).getTime()
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null
  return Math.max(1, Math.ceil((end - start) / (24 * 60 * 60 * 1000)))
}

/**
 * Modal for editing an existing campaign's display metadata. Mirrors the v1
 * `/api/campaigns/update` contract.
 */
export default function EditCampaignModal({ campaign, ownerAddress, onClose, onSaved }: Props) {
  const [name, setName] = useState(campaign.name)
  const [description, setDescription] = useState(campaign.description)
  const [targetUrl, setTargetUrl] = useState(campaign.targetUrl)
  const [bannerUrl, setBannerUrl] = useState(campaign.bannerUrl)
  const [tags, setTags] = useState((campaign.tags ?? []).join(', '))
  const [targetLocations, setTargetLocations] = useState((campaign.targetLocations ?? []).join(', '))
  const [cpc, setCpc] = useState(String(campaign.cpc))
  const [startDate, setStartDate] = useState(toDateTimeLocal(campaign.startDate))
  const [endDate, setEndDate] = useState(toDateTimeLocal(campaign.endDate))
  // Popup auto-close duration in seconds. Stored on campaign.metadata so the
  // SDK can read it without a schema migration. Default 10s matches the
  // current SDK behaviour described in sdk-demo.html.
  const initialPopupSecs = (() => {
    const raw = campaign.metadata?.popupDurationSecs
    const n = typeof raw === 'number' ? raw : Number(raw)
    return Number.isFinite(n) && n > 0 ? String(n) : '10'
  })()
  const [popupDurationSecs, setPopupDurationSecs] = useState(initialPopupSecs)
  const [uploading, setUploading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // CTA tasks attached to this campaign. We load lazily inside the modal so
  // the user can bump rewards without leaving the page.
  const { tasks, refresh: refreshTasks } = useCampaignTasks(campaign.id, ownerAddress)
  // Local draft state per task id, keyed by field. Lets the user edit several
  // numbers before hitting Save (mirrors the rest of the form).
  const [taskDrafts, setTaskDrafts] = useState<Record<string, { rewardPoints: string; rewardGs: string; maxPerWallet: string }>>({})
  useEffect(() => {
    // Seed draft state from the freshly loaded tasks (only for ids we don't
    // already have a draft for, so in-progress edits aren't blown away by a
    // refresh).
    setTaskDrafts((prev) => {
      const next = { ...prev }
      for (const t of tasks) {
        if (!next[t.id]) {
          next[t.id] = {
            rewardPoints: String(t.rewardPoints ?? 0),
            rewardGs: t.rewardGs == null ? '' : String(t.rewardGs),
            maxPerWallet: String(t.maxPerWallet ?? 1),
          }
        }
      }
      return next
    })
  }, [tasks])
  // Tasks whose draft differs from the persisted task — only those POST on save.
  const dirtyTasks = useMemo<{ id: string; updates: Record<string, number | null> }[]>(() => {
    return tasks
      .map((t) => {
        const d = taskDrafts[t.id]
        if (!d) return null
        const updates: Record<string, number | null> = {}
        const np = Number(d.rewardPoints)
        if (Number.isFinite(np) && np !== (t.rewardPoints ?? 0)) updates.rewardPoints = np
        const ng = d.rewardGs === '' ? null : Number(d.rewardGs)
        const currentGs = t.rewardGs == null ? null : t.rewardGs
        if (ng !== currentGs && (ng === null || Number.isFinite(ng))) updates.rewardGs = ng
        const nm = Number(d.maxPerWallet)
        if (Number.isInteger(nm) && nm !== (t.maxPerWallet ?? 1)) updates.maxPerWallet = nm
        return Object.keys(updates).length === 0 ? null : { id: t.id, updates }
      })
      .filter((x): x is { id: string; updates: Record<string, number | null> } => x !== null)
  }, [tasks, taskDrafts])

  // Inline link-validation. Only flag a non-empty value that doesn't parse
  // \u2014 an empty field is handled by the required-field check at submit time.
  const targetUrlCheck = useMemo(() => {
    if (!targetUrl.trim()) return null
    const r = validateHttpUrl(targetUrl)
    return r.ok ? null : r.reason
  }, [targetUrl])

  const bannerUrlCheck = useMemo(() => {
    if (!bannerUrl.trim()) return null
    // Skip the validator for relative upload paths we serve ourselves
    // (`/uploads/...`) \u2014 those are real but not absolute.
    if (bannerUrl.startsWith('/')) return null
    const r = validateHttpUrl(bannerUrl)
    return r.ok ? null : r.reason
  }, [bannerUrl])

  const dateRangeError = useMemo(() => {
    if (!startDate || !endDate) return null
    return new Date(startDate) > new Date(endDate)
      ? 'End time must be after the start time.'
      : null
  }, [startDate, endDate])

  // Current duration in whole days (rounded up). Null = can't compute yet.
  const durationDays = useMemo(() => daysBetween(startDate, endDate), [startDate, endDate])

  // "Run for N days" preset — anchors to the current start (or "now" if blank).
  const applyDurationDays = (days: number) => {
    const base = startDate ? new Date(startDate) : new Date()
    if (!startDate) setStartDate(formatDateForInput(base))
    const end = new Date(base.getTime() + days * 24 * 60 * 60 * 1000)
    setEndDate(formatDateForInput(end))
  }

  const previewUrl = bannerUrl.startsWith('http') || bannerUrl.startsWith('/') ? bannerUrl : ''
  const previewIsVideo = campaign.mediaType === 'video' || /\.(mp4|webm|ogv|mov)/i.test(bannerUrl)

  const upload = async (file: File) => {
    setUploading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('image', file)
      const res = await fetch('/api/uploads/image', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Upload failed')
      setBannerUrl(data.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const save = async () => {
    if (!ownerAddress) return setError('Connect your wallet to save changes.')
    if (!name.trim() || !targetUrl.trim()) return setError('Name and Target URL are required.')
    if (targetUrlCheck) return setError(`Landing URL: ${targetUrlCheck}`)
    if (bannerUrlCheck) return setError(`Creative URL: ${bannerUrlCheck}`)
    if (dateRangeError) return setError(dateRangeError)

    setIsSubmitting(true)
    setError(null)
    try {
      const popupSecsNum = Number(popupDurationSecs)
      if (!Number.isFinite(popupSecsNum) || popupSecsNum < 3 || popupSecsNum > 60) {
        throw new Error('Popup duration must be between 3 and 60 seconds.')
      }

      // Block any CTA draft that pays a positive G$ amount below the
      // network minimum. SovPoints-only edits (rewardGs cleared to null)
      // stay allowed.
      const badReward = dirtyTasks.find((t) => {
        const next = t.updates.rewardGs
        return typeof next === 'number' && next > 0 && next < MIN_CTA_REWARD_GS
      })
      if (badReward) {
        throw new Error(
          `Minimum G$ reward per CTA completion is ${MIN_CTA_REWARD_GS} G$. Bump the amount or clear it to make the task SovPoints-only.`
        )
      }

      const res = await fetch('/api/campaigns/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: ownerAddress,
          id: campaign.id,
          updates: {
            name,
            description,
            targetUrl,
            bannerUrl,
            cpc: Number(cpc),
            tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
            targetLocations: targetLocations.split(',').map((l) => l.trim()).filter(Boolean),
            startDate: startDate ? new Date(startDate).toISOString() : null,
            endDate: endDate ? new Date(endDate).toISOString() : null,
            popupDurationSecs: popupSecsNum,
          },
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to update campaign')

      // Push per-task reward edits in parallel. Any single failure surfaces
      // a non-fatal error \u2014 the main campaign save still succeeded.
      if (dirtyTasks.length > 0) {
        const results = await Promise.all(
          dirtyTasks.map((t) =>
            fetch('/api/tasks/update', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ wallet: ownerAddress, taskId: t.id, updates: t.updates }),
            }).then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) }))
          )
        )
        const failures = results.filter((r) => !r.ok)
        if (failures.length > 0) {
          throw new Error(`Saved campaign, but ${failures.length} CTA update(s) failed: ${failures[0].body?.error ?? 'unknown'}`)
        }
        await refreshTasks()
      }

      setSuccess('Saved. Creative changes will be re-reviewed by moderation.')
      setTimeout(() => { onSaved(); onClose() }, 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 flex w-full max-w-2xl max-h-[90vh] flex-col bg-white border border-[#2D2D2D] shadow-[6px_6px_0_0_#2D2D2D]">
        <header className="flex items-center justify-between border-b border-[#E5E5E5] px-5 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-[#888]">Edit campaign</p>
            <h3 className="truncate text-[15px] font-bold text-[#2D2D2D]">{campaign.name}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 px-2 py-1 text-[12px] text-[#666] hover:bg-[#F4F4F2]"
          >
            <AdvertiserIcon name="delete" className="h-3 w-3" />
            Close
          </button>
        </header>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          {previewUrl && (
            <div className="border border-[#E5E5E5] bg-[#EFEDE7] overflow-hidden" style={{ height: 120 }}>
              {previewIsVideo ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video src={previewUrl} className="h-full w-full object-contain" muted playsInline />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="Preview" className="h-full w-full object-contain" />
              )}
            </div>
          )}

          <Field label="Campaign name" required>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="My campaign" />
          </Field>

          <Field label="Description">
            <TextArea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description" />
          </Field>

          <Field
            label="Landing URL"
            required
            hint={targetUrlCheck ?? 'Where viewers go when they click the ad.'}
          >
            <TextInput
              type="url"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://yoursite.com"
              aria-invalid={targetUrlCheck ? true : undefined}
              className={targetUrlCheck ? 'border-[#B00020] focus:border-[#B00020]' : undefined}
            />
          </Field>

          <Field
            label="Creative URL"
            hint={bannerUrlCheck ?? 'Or upload a new file below.'}
          >
            <TextInput
              type="url"
              value={bannerUrl}
              onChange={(e) => setBannerUrl(e.target.value)}
              placeholder="https://cdn.example.com/banner.png"
              aria-invalid={bannerUrlCheck ? true : undefined}
              className={bannerUrlCheck ? 'border-[#B00020] focus:border-[#B00020]' : undefined}
            />
          </Field>

          <div>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/ogg,video/quicktime"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f) }}
              disabled={uploading}
              className="block w-full text-[12px] text-[#666]"
            />
            {uploading && <p className="mt-1 text-[11px] text-[#888]">Uploading\u2026</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="CPC (per click)">
              <TextInput
                type="number"
                value={cpc}
                onChange={(e) => setCpc(e.target.value)}
                min="0"
                step="0.001"
                placeholder="0.002"
              />
            </Field>
            <Field label="Tags" hint="Comma-separated">
              <TextInput value={tags} onChange={(e) => setTags(e.target.value)} placeholder="defi, web3, nft" />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Start date" hint="Required to publish on-chain.">
              <TextInput
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
            <Field
              label="End date"
              hint={dateRangeError ?? 'Must be after the start date.'}
            >
              <TextInput
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || undefined}
                aria-invalid={dateRangeError ? true : undefined}
                className={dateRangeError ? 'border-[#B00020] focus:border-[#B00020]' : undefined}
              />
            </Field>
          </div>

          {/* Quick duration presets — mirrors the create-campaign flow so an
              advertiser can extend / shorten a campaign with one click. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-[#888]">Run for</span>
            {[1, 3, 7, 14, 30].map((d) => {
              const isCurrent = durationDays === d
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => applyDurationDays(d)}
                  className={`border px-2 py-1 text-[11px] ${
                    isCurrent
                      ? 'border-[#2D2D2D] bg-[#2D2D2D] text-white'
                      : 'border-[#E5E5E5] bg-white text-[#2D2D2D] hover:bg-[#FAFAF8]'
                  }`}
                  aria-pressed={isCurrent}
                >
                  {d}d
                </button>
              )
            })}
            {durationDays && ![1, 3, 7, 14, 30].includes(durationDays) && (
              <span className="text-[11px] text-[#888]">· currently {durationDays}d</span>
            )}
          </div>

          <Field label="Target locations" hint="Comma-separated ISO codes">
            <TextInput value={targetLocations} onChange={(e) => setTargetLocations(e.target.value)} placeholder="US, EU, NG" />
          </Field>

          {/* Popup auto-close timeout (advertiser-controlled). Applies only
              to surfaces of kind 'popup' \u2014 banners/sidebars don't auto-close. */}
          <Field
            label="Popup duration"
            hint="How long a popup ad stays on screen before auto-closing (3\u201360s, default 10s)."
          >
            <div className="flex items-center gap-2">
              <TextInput
                type="number"
                value={popupDurationSecs}
                onChange={(e) => setPopupDurationSecs(e.target.value)}
                min={3}
                max={60}
                step={1}
                className="w-24"
              />
              <span className="text-[11px] text-[#666]">seconds</span>
              {[5, 10, 15, 20, 30].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setPopupDurationSecs(String(s))}
                  className={`border px-2 py-1 text-[11px] ${
                    Number(popupDurationSecs) === s
                      ? 'border-[#2D2D2D] bg-[#2D2D2D] text-white'
                      : 'border-[#E5E5E5] bg-white text-[#2D2D2D] hover:bg-[#FAFAF8]'
                  }`}
                  aria-pressed={Number(popupDurationSecs) === s}
                >
                  {s}s
                </button>
              ))}
            </div>
          </Field>

          {/* CTA reward editor \u2014 lets the advertiser bump per-task rewards
              (points + G$) and the per-wallet cap without leaving the modal.
              We only render the section when the campaign actually has tasks. */}
          {tasks.length > 0 && (
            <fieldset className="border border-[#E5E5E5] bg-[#FAFAF8] p-3">
              <legend className="px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#666]">
                CTA rewards \u00b7 {tasks.length}
              </legend>
              <p className="mb-2 text-[10px] text-[#888]">
                Bump rewards or tighten the per-wallet cap. Changes apply immediately to new completions; viewers who
                already finished the task keep the old payout.
              </p>
              <div className="space-y-2">
                {tasks.map((t) => {
                  const d = taskDrafts[t.id] ?? { rewardPoints: '0', rewardGs: '', maxPerWallet: '1' }
                  const dirty = dirtyTasks.some((x) => x.id === t.id)
                  return (
                    <div key={t.id} className={`border bg-white p-2 ${dirty ? 'border-[#2D2D2D]' : 'border-[#E5E5E5]'}`}>
                      <div className="mb-1.5 flex items-baseline justify-between gap-2">
                        <p className="truncate text-[12px] font-semibold text-[#2D2D2D]">{t.label}</p>
                        <p className="text-[10px] uppercase tracking-wider text-[#888]">
                          {t.kind}
                          {dirty && <span className="ml-1 text-[#B00020]">\u2022 unsaved</span>}
                        </p>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <label className="block">
                          <span className="block text-[10px] uppercase tracking-wider text-[#888]">Points</span>
                          <TextInput
                            type="number"
                            min={0}
                            step={1}
                            value={d.rewardPoints}
                            onChange={(e) => setTaskDrafts((prev) => ({ ...prev, [t.id]: { ...d, rewardPoints: e.target.value } }))}
                          />
                        </label>
                        <label className="block">
                          <span className="block text-[10px] uppercase tracking-wider text-[#888]">G$</span>
                          <TextInput
                            type="number"
                            min={0}
                            step={0.001}
                            placeholder={`0 or \u2265 ${MIN_CTA_REWARD_GS}`}
                            value={d.rewardGs}
                            onChange={(e) => setTaskDrafts((prev) => ({ ...prev, [t.id]: { ...d, rewardGs: e.target.value } }))}
                            aria-invalid={d.rewardGs !== '' && Number(d.rewardGs) > 0 && Number(d.rewardGs) < MIN_CTA_REWARD_GS ? true : undefined}
                          />
                          {d.rewardGs !== '' && Number(d.rewardGs) > 0 && Number(d.rewardGs) < MIN_CTA_REWARD_GS && (
                            <span className="mt-0.5 block text-[10px] font-medium text-[#B00020]">
                              Min {MIN_CTA_REWARD_GS} G$, or leave blank.
                            </span>
                          )}
                        </label>
                        <label className="block">
                          <span className="block text-[10px] uppercase tracking-wider text-[#888]">Max/wallet</span>
                          <TextInput
                            type="number"
                            min={1}
                            step={1}
                            value={d.maxPerWallet}
                            onChange={(e) => setTaskDrafts((prev) => ({ ...prev, [t.id]: { ...d, maxPerWallet: e.target.value } }))}
                          />
                        </label>
                      </div>
                    </div>
                  )
                })}
              </div>
            </fieldset>
          )}

          {error && <Alert tone="error" onDismiss={() => setError(null)}>{error}</Alert>}
          {success && <Alert tone="success">{success}</Alert>}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[#E5E5E5] bg-[#FAFAF8] px-5 py-3">
          <Button intent="ghost" onClick={onClose}>Cancel</Button>
          <Button
            intent="primary"
            disabled={isSubmitting || uploading || Boolean(targetUrlCheck) || Boolean(bannerUrlCheck) || Boolean(dateRangeError)}
            onClick={save}
          >
            {isSubmitting
              ? 'Saving…'
              : dirtyTasks.length > 0
                ? `Save changes · ${dirtyTasks.length} CTA${dirtyTasks.length === 1 ? '' : 's'}`
                : 'Save changes'}
          </Button>
        </footer>
      </div>
    </div>
  )
}
