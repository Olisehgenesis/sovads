'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAccount } from 'wagmi'

import WalletButton from '@/components/WalletButton'
import { useAdvertiserCampaigns } from '@/hooks/useAdvertiserCampaigns'
import { useCampaignTasks } from '@/hooks/useCampaignTasks'
import {
  Alert,
  Button,
  EmptyState,
  Section,
  Skeleton,
  StatusBadge,
} from '@/components/advertiser/ui'
import CtaForm, { type CtaFormPayload } from '@/components/advertiser/CtaForm'
import AdTypePicker from '@/components/advertiser/AdTypePicker'
import { AD_SIZE_CATALOG, type AdSizeOption } from '@/components/advertiser/types'

/**
 * Cross-campaign CTA workspace. URL: `/advertiser/ctas?campaignId=…`.
 */
export default function AdvertiserCtasPage() {
  return (
    <Suspense fallback={null}>
      <CtaWorkspace />
    </Suspense>
  )
}

function CtaWorkspace() {
  const { address, isConnected } = useAccount()
  const router = useRouter()
  const params = useSearchParams()
  const initialCampaignId = params.get('campaignId')

  const { campaigns, isLoading: isLoadingCampaigns } = useAdvertiserCampaigns(address ?? undefined)
  const [selectedId, setSelectedId] = useState<string | null>(initialCampaignId)

  useEffect(() => {
    if (!selectedId && campaigns.length > 0) setSelectedId(campaigns[0].id)
  }, [campaigns, selectedId])

  useEffect(() => {
    if (selectedId && selectedId !== initialCampaignId) {
      router.replace(`/advertiser/ctas?campaignId=${encodeURIComponent(selectedId)}`)
    }
  }, [selectedId, initialCampaignId, router])

  const selectedCampaign = campaigns.find((c) => c.id === selectedId) ?? null
  const { tasks, isLoading: isLoadingTasks, error: tasksError, createTask, refresh } = useCampaignTasks(
    selectedId,
    address ?? undefined
  )

  const [creating, setCreating] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [showForm, setShowForm] = useState(false)

  const [pickedSize, setPickedSize] = useState<AdSizeOption>(AD_SIZE_CATALOG[0])

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[#F5F3F0] flex items-center justify-center p-6">
        <div className="w-full max-w-md border border-[#2D2D2D] bg-white p-8 shadow-[6px_6px_0_0_#2D2D2D] text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#888]">CTAs</p>
          <h1 className="mt-1 text-[20px] font-bold tracking-tight text-[#2D2D2D]">Connect to manage CTAs</h1>
          <div className="mt-4"><WalletButton /></div>
        </div>
      </div>
    )
  }

  const handleCreate = async (payload: CtaFormPayload) => {
    setCreating(true)
    setFeedback(null)
    try {
      await createTask(payload)
      setFeedback({ tone: 'success', text: `CTA "${payload.label}" created.` })
      setShowForm(false)
    } catch (err) {
      setFeedback({ tone: 'error', text: err instanceof Error ? err.message : 'Create failed' })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F5F3F0]">
      {/* Top bar */}
      <div className="border-b border-[#E5E5E5] bg-white">
        <div className="mx-auto flex max-w-screen-xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#888]">Advertiser</p>
            <h1 className="truncate text-[15px] font-bold text-[#2D2D2D]">CTAs &amp; ad types</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/advertiser"
              className="inline-flex items-center gap-1.5 border border-[#2D2D2D] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#2D2D2D] hover:bg-[#F4F4F2]"
            >
              ← Dashboard
            </Link>
            <Link
              href="/create-campaign"
              className="inline-flex items-center gap-1.5 border border-[#2D2D2D] bg-[#2D2D2D] px-3 py-1.5 text-[12px] font-semibold text-white shadow-[2px_2px_0_0_#2D2D2D] hover:bg-[#1F1F1F]"
            >
              New campaign
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-screen-xl space-y-5 px-4 py-6">
        <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          {/* Campaign picker */}
          <Section title="My campaigns" description="Pick one">
            {isLoadingCampaigns ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : campaigns.length === 0 ? (
              <p className="text-[13px] text-[#666]">No campaigns yet. Create one first.</p>
            ) : (
              <ul className="space-y-1">
                {campaigns.map((c) => {
                  const isActive = c.id === selectedId
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(c.id)}
                        className={[
                          'flex w-full flex-col gap-0.5 border px-3 py-2 text-left transition-colors',
                          isActive
                            ? 'border-[#2D2D2D] bg-[#2D2D2D] text-white'
                            : 'border-[#E5E5E5] bg-white text-[#2D2D2D] hover:bg-[#F4F4F2]',
                        ].join(' ')}
                      >
                        <p className="truncate text-[13px] font-semibold">{c.name}</p>
                        <p className={`text-[11px] ${isActive ? 'text-[#cccccc]' : 'text-[#888]'}`}>
                          {c.active ? (c.paused ? 'Paused' : 'Active') : 'Inactive'}
                          {c.onChainId != null ? ` · #${c.onChainId}` : ''}
                        </p>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>

          {/* Workspace */}
          <div className="space-y-5">
            {!selectedCampaign ? (
              <Section title="Select a campaign">
                <p className="text-[13px] text-[#666]">Pick a campaign on the left to manage its CTAs.</p>
              </Section>
            ) : (
              <>
                <Section
                  title={selectedCampaign.name}
                  description="Calls-to-action attached to this campaign"
                  actions={
                    <Button intent={showForm ? 'ghost' : 'primary'} size="sm" onClick={() => setShowForm((v) => !v)}>
                      {showForm ? 'Close form' : 'New CTA'}
                    </Button>
                  }
                >
                  {feedback && (
                    <div className="mb-3">
                      <Alert tone={feedback.tone} onDismiss={() => setFeedback(null)}>{feedback.text}</Alert>
                    </div>
                  )}

                  {showForm && (
                    <div className="mb-5 border border-[#E5E5E5] bg-[#FAFAF8] p-4">
                      <CtaForm
                        submitLabel="Create CTA"
                        isSubmitting={creating}
                        onSubmit={handleCreate}
                        onCancel={() => setShowForm(false)}
                      />
                    </div>
                  )}

                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#666]">
                    Existing CTAs ({tasks.length})
                  </p>
                  {tasksError && <Alert tone="error">{tasksError}</Alert>}
                  {isLoadingTasks ? (
                    <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                  ) : tasks.length === 0 ? (
                    <EmptyState title="No CTAs yet" description="Click “New CTA” to add the first one." />
                  ) : (
                    <ul className="divide-y divide-[#EFEFEF] border border-[#E5E5E5]">
                      {tasks.map((t) => (
                        <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 bg-white p-3">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold text-[#2D2D2D]">{t.label}</p>
                            <p className="text-[11px] text-[#666]">
                              {String(t.kind)} · {String(t.verifier)}
                              {t.rewardPoints ? ` · ${t.rewardPoints} pts` : ''}
                              {t.rewardGs ? ` · ${t.rewardGs} G$` : ''}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <StatusBadge tone={t.verifier === 'AI_PLAN' ? 'warning' : 'neutral'}>{String(t.verifier)}</StatusBadge>
                            <Link
                              href={`/test/ad/${encodeURIComponent(selectedCampaign.id)}`}
                              className="inline-flex items-center gap-1.5 border border-[#E5E5E5] bg-white px-2 py-1 text-[11px] font-semibold text-[#2D2D2D] hover:bg-[#F4F4F2]"
                            >
                              Test
                            </Link>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-3">
                    <Button intent="ghost" size="sm" onClick={() => void refresh()}>Refresh</Button>
                  </div>
                </Section>

                <Section
                  title="Ad type & placement preview"
                  description="See how this campaign will render in each placement size"
                  actions={
                    <span className="border border-[#E5E5E5] bg-white px-2 py-1 text-[11px] text-[#444]">
                      {pickedSize.label} · {pickedSize.size}
                    </span>
                  }
                >
                  <AdTypePicker
                    ad={{
                      name: selectedCampaign.name,
                      description: selectedCampaign.description,
                      bannerUrl: selectedCampaign.bannerUrl,
                      targetUrl: selectedCampaign.targetUrl,
                      mediaType: selectedCampaign.mediaType,
                    }}
                    tasks={tasks.map((t) => ({
                      id: t.id,
                      kind: String(t.kind),
                      label: t.label,
                      verifier: String(t.verifier),
                      rewardPoints: t.rewardPoints,
                      rewardGs: t.rewardGs,
                    }))}
                    value={pickedSize.id}
                    onChange={setPickedSize}
                  />
                </Section>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
