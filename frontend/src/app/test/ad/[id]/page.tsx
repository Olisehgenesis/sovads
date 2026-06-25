'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { useAccount } from 'wagmi'
import TestAdRenderer, { type TestPlacement } from '@/components/ads/TestAdRenderer'

interface Campaign {
  id: string
  name: string
  description?: string
  bannerUrl: string
  targetUrl: string
  mediaType?: 'image' | 'video'
  status: string
  verificationStatus?: string | null
  onChainId?: number
  advertiserWallet?: string | null
  tasks?: Array<{
    id: string
    kind: string
    label: string
    description?: string | null
    verifier: string
    rewardPoints?: number
    rewardGs?: number | null
    contractAllowlist?: string[]
  }>
}

const ALL_PLACEMENTS: TestPlacement[] = ['banner', 'sidebar', 'popup']

export default function TestAdPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const { address } = useAccount()

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activePlacement, setActivePlacement] = useState<TestPlacement>('banner')
  const [bannerSize, setBannerSize] = useState<string>('728x90')

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    fetch(`/api/campaigns/detail?id=${encodeURIComponent(id)}&include=tasks`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || 'Failed to load')
        if (!cancelled) setCampaign(data.campaign)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const isOwner = useMemo(() => {
    if (!campaign?.advertiserWallet || !address) return false
    return campaign.advertiserWallet.toLowerCase() === address.toLowerCase()
  }, [campaign, address])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F3F0] p-8">
        <p className="text-[12px] font-black uppercase tracking-widest text-[#666666]">Loading…</p>
      </div>
    )
  }
  if (error || !campaign) {
    return (
      <div className="min-h-screen bg-[#F5F3F0] p-8">
        <div className="border-2 border-black bg-[#fef2f2] p-6 max-w-xl">
          <p className="text-[12px] font-black uppercase text-[#ef4444]">{error || 'Not found'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F5F3F0] py-8 px-4">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#666666]">Test Ad</p>
            <h1 className="text-[26px] font-black uppercase tracking-tight text-[#141414]">{campaign.name}</h1>
            <div className="flex gap-2 mt-2">
              <StatusPill label={campaign.status} />
              {campaign.verificationStatus && <StatusPill label={`mod: ${campaign.verificationStatus}`} />}
              {campaign.onChainId != null && <StatusPill label={`on-chain #${campaign.onChainId}`} />}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!address && (
              <span className="text-[10px] font-black uppercase text-[#ef4444]">Connect wallet to test CTAs</span>
            )}
            {address && !isOwner && (
              <span className="text-[10px] font-black uppercase text-[#ef4444]">Not owner — read only</span>
            )}
            <a
              href="/advertiser"
              className="border-2 border-black px-3 py-1.5 text-[10px] font-black uppercase tracking-wider bg-white hover:bg-[#e8e6e3]"
            >
              ← Dashboard
            </a>
          </div>
        </div>

        {/* Placement switcher */}
        <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="border-b-2 border-black px-4 py-3 flex items-center gap-3 flex-wrap">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#666666]">Placement:</p>
            {ALL_PLACEMENTS.map((p) => (
              <button
                key={p}
                onClick={() => setActivePlacement(p)}
                className={[
                  'border-2 border-black px-3 py-1 text-[10px] font-black uppercase tracking-wider',
                  activePlacement === p ? 'bg-black text-white' : 'bg-white hover:bg-[#F5F3F0]',
                ].join(' ')}
              >
                {p}
              </button>
            ))}
            {activePlacement === 'banner' && (
              <>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] ml-2">Size:</span>
                {['320x50', '728x90', '970x250'].map((s) => (
                  <button
                    key={s}
                    onClick={() => setBannerSize(s)}
                    className={[
                      'border-2 border-black px-2 py-1 text-[10px] font-black uppercase tracking-wider',
                      bannerSize === s ? 'bg-black text-white' : 'bg-white hover:bg-[#F5F3F0]',
                    ].join(' ')}
                  >
                    {s}
                  </button>
                ))}
              </>
            )}
          </div>

          <div className="p-8 bg-[#F5F3F0] flex items-center justify-center min-h-[280px]">
            <TestAdRenderer
              ad={{
                name: campaign.name,
                description: campaign.description,
                bannerUrl: campaign.bannerUrl,
                targetUrl: campaign.targetUrl,
                mediaType: campaign.mediaType,
              }}
              tasks={campaign.tasks?.map((t) => ({
                id: t.id,
                kind: t.kind,
                label: t.label,
                verifier: t.verifier,
                rewardPoints: t.rewardPoints,
                rewardGs: t.rewardGs,
              }))}
              placement={activePlacement}
              size={activePlacement === 'banner' ? bannerSize : undefined}
            />
          </div>
        </div>

        {/* CTAs panel */}
        <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="border-b-2 border-black px-4 py-3 flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#666666]">
              CTAs ({campaign.tasks?.length ?? 0})
            </p>
          </div>
          <div className="divide-y-2 divide-black">
            {(!campaign.tasks || campaign.tasks.length === 0) && (
              <div className="p-6 text-[12px] text-[#666666]">
                No CTAs attached. Add some from the campaign editor.
              </div>
            )}
            {campaign.tasks?.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                ownerWallet={isOwner ? address : null}
                campaignId={campaign.id}
              />
            ))}
          </div>
        </div>

        <p className="text-[10px] text-[#999999] text-center">
          Test renders use your draft data — they do not log impressions, do not pay G$, and are not visible to publishers.
        </p>
      </div>
    </div>
  )
}

function StatusPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center border-2 border-black px-2 py-0.5 text-[9px] font-black uppercase tracking-widest bg-white">
      {label}
    </span>
  )
}

function TaskRow({
  task,
  ownerWallet,
  campaignId,
}: {
  task: NonNullable<Campaign['tasks']>[number]
  ownerWallet: string | null | undefined
  campaignId: string
}) {
  const [open, setOpen] = useState(false)
  const [sampleWallet, setSampleWallet] = useState('')
  const [sampleTxHash, setSampleTxHash] = useState('')
  const [sampleAnswer, setSampleAnswer] = useState('')
  const [sampleSignature, setSampleSignature] = useState('')
  const [sampleMessage, setSampleMessage] = useState('')
  const [sampleDwell, setSampleDwell] = useState('')
  const [sampleExternalRef, setSampleExternalRef] = useState('')
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<unknown>(null)
  const [testError, setTestError] = useState<string | null>(null)

  const runTest = async () => {
    if (!ownerWallet) return
    setTesting(true)
    setTestError(null)
    setResult(null)
    try {
      const res = await fetch('/api/tasks/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task.id,
          wallet: ownerWallet,
          sample: {
            wallet: sampleWallet || undefined,
            txHash: sampleTxHash || undefined,
            signature: sampleSignature || undefined,
            message: sampleMessage || undefined,
            answer: sampleAnswer || undefined,
            dwellMs: sampleDwell ? Number(sampleDwell) : undefined,
            externalRef: sampleExternalRef || undefined,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      setResult(data)
    } catch (e) {
      setTestError(e instanceof Error ? e.message : 'Test failed')
    } finally {
      setTesting(false)
    }
  }

  // Suppress unused-var lint while keeping the prop available for future routing.
  void campaignId

  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusPill label={task.kind} />
            <StatusPill label={`verifier: ${task.verifier}`} />
            {task.rewardPoints != null && <StatusPill label={`${task.rewardPoints} pts`} />}
            {task.rewardGs != null && <StatusPill label={`${task.rewardGs} G$`} />}
          </div>
          <p className="text-[13px] font-black uppercase tracking-tight text-black mt-2">{task.label}</p>
          {task.description && <p className="text-[11px] text-[#666666] mt-1">{task.description}</p>}
        </div>
        <button
          type="button"
          disabled={!ownerWallet}
          onClick={() => setOpen((o) => !o)}
          className="border-2 border-black bg-black text-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider hover:bg-[#222222] disabled:opacity-40"
        >
          {open ? 'Hide test' : 'Test CTA'}
        </button>
      </div>

      {open && (
        <div className="mt-4 border-2 border-black bg-[#F5F3F0] p-4 space-y-3">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#666666]">Sample inputs</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SampleInput label="Wallet" value={sampleWallet} onChange={setSampleWallet} placeholder="0x…" />
            <SampleInput label="Tx hash" value={sampleTxHash} onChange={setSampleTxHash} placeholder="0x…" />
            <SampleInput label="Signature" value={sampleSignature} onChange={setSampleSignature} placeholder="0x…" />
            <SampleInput label="Message" value={sampleMessage} onChange={setSampleMessage} />
            <SampleInput label="Answer (quiz)" value={sampleAnswer} onChange={setSampleAnswer} />
            <SampleInput label="Dwell ms" value={sampleDwell} onChange={setSampleDwell} placeholder="3000" />
            <SampleInput label="External ref" value={sampleExternalRef} onChange={setSampleExternalRef} />
          </div>
          <button
            type="button"
            onClick={runTest}
            disabled={testing || !ownerWallet}
            className="border-2 border-black bg-black text-white px-4 py-2 text-[10px] font-black uppercase tracking-wider hover:bg-[#222222] disabled:opacity-40"
          >
            {testing ? 'Running…' : 'Run dry-run verify'}
          </button>
          {testError && (
            <div className="border-2 border-black bg-[#fef2f2] px-3 py-2">
              <p className="text-[11px] font-black uppercase text-[#ef4444]">{testError}</p>
            </div>
          )}
          {result != null && (
            <pre className="bg-white border-2 border-black p-3 text-[10px] font-mono whitespace-pre-wrap break-all max-h-96 overflow-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

function SampleInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="block text-[9px] font-black uppercase tracking-[0.2em] text-[#666666] mb-1">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border-2 border-black px-2 py-1.5 text-[12px] font-mono bg-white focus:outline-none"
      />
    </label>
  )
}
