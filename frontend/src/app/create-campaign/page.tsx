'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { useAppKit } from '@reown/appkit/react'
import { formatUnits } from 'viem'
import { useStreamingAds } from '../../hooks/useStreamingAds'
import { GOODDOLLAR_ADDRESS, chainId } from '@/lib/chain-config'
import { getTokenInfo, getTokenLabel } from '@/lib/tokens'
import { CtaPreview } from '@/components/advertiser/CtaPreview'
import { toStreamingEmbed } from '@/lib/sdk'
import { validateHttpUrl } from '@/lib/url-validation'
import { MIN_BUDGET_GS, MIN_CTA_REWARD_GS } from '@/lib/campaign-limits'

const ERC20_BALANCE_ABI = [{
  name: 'balanceOf',
  type: 'function',
  stateMutability: 'view',
  inputs: [{ name: 'owner', type: 'address' }],
  outputs: [{ type: 'uint256' }],
}] as const

// Phase 9: autosave key. We persist the in-progress form to localStorage so a
// refresh, a tab switch into wallet, or a browser crash doesn't lose progress.
// Bumping DRAFT_SCHEMA_VERSION invalidates older saved drafts; do this when
// the shape of `formData` / `CtaDraft` changes in a breaking way.
//
// v2: POLL/QUIZ now carry a single question + colored options instead of
// the old `pollQuestions: {q,a}[]` array. Old drafts are dropped on load.
const DRAFT_LS_KEY = 'sovads:create-campaign:draft:v2'
const DRAFT_SCHEMA_VERSION = 2
// Debounce window for localStorage writes. 600 ms keeps the IO cheap during
// continuous typing while still feeling instant — most users pause longer
// than that between fields.
const AUTOSAVE_DEBOUNCE_MS = 600

/* ────────────────────────────────────────────────────────────────────────── */
/* Form model                                                                 */
/* ────────────────────────────────────────────────────────────────────────── */

interface CampaignFormData {
  name: string
  description: string
  bannerUrl: string
  targetUrl: string
  budget: string
  cpc: string
  tokenAddress: string
  tags: string
  targetLocations: string
  metadata: string
  mediaType: 'image' | 'video'
}

const CTA_KINDS = ['VISIT_URL', 'SOCIAL_FOLLOW', 'POLL', 'QUIZ', 'STAKE_GS', 'CONTRACT_CALL', 'SIGN_MESSAGE'] as const
const CTA_VERIFIERS = ['MANUAL', 'NA', 'ORACLE', 'SELF_SIGNED', 'STAKE_PROOF', 'ONCHAIN_EVENT', 'WEBHOOK', 'AI_PLAN'] as const
type CtaKind = typeof CTA_KINDS[number]
type CtaVerifier = typeof CTA_VERIFIERS[number]

// Plain-English labels for the action-type dropdown. The internal enum stays
// SCREAMING_SNAKE so the server contract doesn't change; only the option
// text the advertiser sees is rewritten.
const CTA_KIND_LABEL: Record<CtaKind, string> = {
  VISIT_URL: 'Visit a link',
  SOCIAL_FOLLOW: 'Follow on social',
  POLL: 'Quick poll',
  QUIZ: 'Quick quiz',
  STAKE_GS: 'Stake G$',
  SIGN_MESSAGE: 'Sign a message',
  CONTRACT_CALL: 'On-chain action (advanced)',
}

// Same idea for the verifier dropdown. Most are protocol plumbing the
// advertiser shouldn't have to think about; we keep the labels readable for
// the rare moment a power user opens the Advanced disclosure.
const CTA_VERIFIER_LABEL: Record<CtaVerifier, string> = {
  MANUAL: 'Trust the click (recommended)',
  NA: 'No verification',
  ORACLE: 'Oracle-verified',
  SELF_SIGNED: 'User signs a proof',
  STAKE_PROOF: 'Verified stake on-chain',
  ONCHAIN_EVENT: 'Watch contract event',
  WEBHOOK: 'External webhook',
  AI_PLAN: 'AI-checked plan',
}

// The CTA types that show up in the dropdown by default. CONTRACT_CALL is
// power-user surface area (requires a contract address + event topic), so
// it's gated behind the "Show advanced types" toggle in the CTA section.
const BASIC_CTA_KINDS: CtaKind[] = ['VISIT_URL', 'SOCIAL_FOLLOW', 'POLL', 'QUIZ', 'STAKE_GS', 'SIGN_MESSAGE']
const ADVANCED_CTA_KINDS: CtaKind[] = ['CONTRACT_CALL']

const DEFAULT_VERIFIER: Record<CtaKind, CtaVerifier> = {
  VISIT_URL: 'MANUAL',
  SOCIAL_FOLLOW: 'MANUAL',
  POLL: 'ORACLE',
  QUIZ: 'ORACLE',
  STAKE_GS: 'MANUAL',
  CONTRACT_CALL: 'MANUAL',
  SIGN_MESSAGE: 'MANUAL',
}

interface CtaDraft {
  uid: string
  kind: CtaKind
  label: string
  description: string
  buttonLabel: string
  verifier: CtaVerifier
  rewardPoints: string
  rewardGs: string
  maxPerWallet: string
  cooldownSecs: string
  url: string
  minDwellMs: string
  signMessage: string
  minAmount: string
  targetContract: string
  eventSig: string
  aiPrompt: string
  contractAllowlist: string
  // POLL / QUIZ shared editor model. The CTA `label` doubles as the
  // question header rendered by the iframe / SDK, so we only need an
  // option list here. For QUIZ exactly one option is marked `correct`;
  // for POLL `correct` is irrelevant (any choice earns).
  pollOptions: { id: string; label: string; correct?: boolean }[]
  collapsed: boolean
}

// Per-question colored option cap. 5 is the hard upper bound the renderer
// supports (2x3 grid with the last tile spanning); below 2 there's no
// meaningful choice. Keep these in sync with the renderer in r/unit.
const MAX_POLL_OPTIONS = 5
const MIN_POLL_OPTIONS = 2

// Short stable id for an option. Stored with the task so analytics survive
// option-label edits; the renderer keys tiles by it.
const newPollOptionId = () =>
  'opt_' + Math.random().toString(36).slice(2, 8)

// Tag / Geo presets. Free-text was tripping up non-technical advertisers
// ("what should I even put here?"), so the targeting fields are now chip-
// select dropdowns backed by these option lists. Both stay open to custom
// values via the "+ Add" affordance — campaigns can target niches we
// haven't predicted. Keep these lists in sync with publisher discovery /
// matching logic in the backend.
const TAG_OPTIONS = [
  'DeFi',
  'NFTs',
  'Gaming',
  'DAO',
  'Wallet',
  'Bridge',
  'Stablecoin',
  'L2',
  'Privacy',
  'AI',
  'Social',
  'Education',
  'Real-world assets',
  'Identity',
] as const
const GEO_OPTIONS = [
  'Global',
  'North America',
  'Europe',
  'Latin America',
  'Africa',
  'Asia',
  'Oceania',
  'US',
  'UK',
  'Germany',
  'France',
  'Nigeria',
  'Kenya',
  'Brazil',
  'India',
  'Indonesia',
  'Philippines',
] as const

// Starter templates surface the most common campaign shapes so advertisers
// don't start from a blank screen. Each template only seeds copy + targeting
// + CTA presets — pricing/dates/budget stay user-controlled because they
// depend on the advertiser's own constraints. `id` is the dropdown key; we
// also use it as a click analytic hint.
type CampaignTemplate = {
  id: string
  label: string
  emoji: string
  description: string
  data: {
    name?: string
    description?: string
    targetUrl?: string
    tags?: string
    targetLocations?: string
  }
  ctas?: { kind: CtaKind; label: string; description?: string; buttonLabel?: string; url?: string; rewardPoints?: string; rewardGs?: string; maxPerWallet?: string }[]
}
const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    id: 'product-launch',
    label: 'Product launch',
    emoji: '🚀',
    description: 'Drive sign-ups and a follow on socials for a new release.',
    data: {
      name: 'Launching <product>',
      description: 'Be one of the first to try our new <product>.',
      tags: 'DeFi, Wallet',
      targetLocations: 'Global',
    },
    ctas: [
      { kind: 'VISIT_URL', label: 'Try it now', buttonLabel: 'Open the app', rewardPoints: '10', maxPerWallet: '1' },
      { kind: 'SOCIAL_FOLLOW', label: 'Follow us on X', buttonLabel: 'Follow', rewardPoints: '5', maxPerWallet: '1' },
    ],
  },
  {
    id: 'community-poll',
    label: 'Community poll',
    emoji: '🗳️',
    description: 'Ask viewers a quick question and reward thoughtful responses.',
    data: {
      name: 'Quick poll: <topic>',
      description: 'Help us shape <topic>. Two questions, 30 seconds.',
      tags: 'DAO, Social',
      targetLocations: 'Global',
    },
    ctas: [
      { kind: 'QUIZ', label: 'Answer the poll', buttonLabel: 'Start', rewardPoints: '15', rewardGs: '0.5', maxPerWallet: '1' },
    ],
  },
  {
    id: 'token-airdrop',
    label: 'Airdrop / reward',
    emoji: '🎁',
    description: 'Reward viewers for staking or signing a message.',
    data: {
      name: '<brand> rewards',
      description: 'Earn G$ for engaging with <brand>.',
      tags: 'DeFi, Stablecoin',
      targetLocations: 'Global',
    },
    ctas: [
      { kind: 'STAKE_GS', label: 'Stake to qualify', buttonLabel: 'Stake', rewardPoints: '25', rewardGs: '1', maxPerWallet: '1' },
      { kind: 'SIGN_MESSAGE', label: 'Confirm participation', buttonLabel: 'Sign', rewardPoints: '5', maxPerWallet: '1' },
    ],
  },
  {
    id: 'awareness',
    label: 'Awareness',
    emoji: '📣',
    description: 'Pure reach: an image + a landing URL, no CTAs.',
    data: {
      name: 'Meet <brand>',
      description: '<brand> in one sentence.',
      tags: 'Social, Education',
      targetLocations: 'Global',
    },
    ctas: [],
  },
]

// Parse a comma-separated tag/geo string into trimmed unique values. Used
// both on render (to display chips) and when migrating templates. The form
// payload stays the same comma-separated shape that the API already accepts.
function parseCsvList(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  )
}
function joinCsvList(values: string[]): string {
  return values.join(', ')
}

const newCtaDraft = (kind: CtaKind = 'VISIT_URL'): CtaDraft => ({
  uid: Math.random().toString(36).slice(2, 10),
  kind,
  label: '',
  description: '',
  buttonLabel: '',
  verifier: DEFAULT_VERIFIER[kind],
  rewardPoints: '10',
  rewardGs: '',
  maxPerWallet: '1',
  cooldownSecs: '0',
  url: '',
  // Default min-dwell for VISIT_URL / SOCIAL_FOLLOW: 60 000 ms = 1 minute.
  // Hidden from the advertiser UI — normal users don't need to tune this in
  // milliseconds. Power-user override can live behind an admin tool later.
  minDwellMs: '60000',
  signMessage: '',
  minAmount: '',
  targetContract: '',
  eventSig: '',
  aiPrompt: '',
  contractAllowlist: '',
  // POLL / QUIZ default seed: two blank option rows so the editor opens
  // with a meaningful skeleton (the renderer needs >= 2 options).
  pollOptions:
    kind === 'POLL' || kind === 'QUIZ'
      ? [
          { id: newPollOptionId(), label: '' },
          { id: newPollOptionId(), label: '' },
        ]
      : [],
  collapsed: false,
})

function buildCtaConfig(c: CtaDraft): Record<string, unknown> {
  const cfg: Record<string, unknown> = {}
  if (c.buttonLabel.trim()) cfg.buttonLabel = c.buttonLabel.trim()
  if (c.kind === 'VISIT_URL' || c.kind === 'SOCIAL_FOLLOW') {
    if (c.url) cfg.url = c.url
    if (c.minDwellMs) cfg.minDwellMs = Number(c.minDwellMs)
  }
  if (c.kind === 'POLL' || c.kind === 'QUIZ') {
    const opts = c.pollOptions
      .slice(0, MAX_POLL_OPTIONS)
      .map((o) => ({
        id: o.id || newPollOptionId(),
        label: o.label.trim(),
        // Persist the correct flag for QUIZ; POLL ignores it server-side.
        ...(c.kind === 'QUIZ' && o.correct ? { correct: true } : {}),
      }))
      .filter((o) => o.label)
    if (opts.length > 0) {
      cfg.options = opts
      // QUIZ keeps `expectedAnswer` populated for back-compat with the
      // legacy text-match verifier path. The new optionId path takes
      // precedence server-side when both are present.
      if (c.kind === 'QUIZ') {
        const correct = opts.find((o) => 'correct' in o && o.correct)
        if (correct) cfg.expectedAnswer = correct.label
      }
    }
  }
  if (c.kind === 'SIGN_MESSAGE' && c.signMessage) cfg.signMessage = c.signMessage
  if (c.kind === 'STAKE_GS' && c.minAmount) cfg.minAmount = Number(c.minAmount)
  if (c.kind === 'CONTRACT_CALL') {
    if (c.targetContract) cfg.targetContract = c.targetContract
    if (c.eventSig) cfg.eventSig = c.eventSig
  }
  return cfg
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Tiny primitives (charcoal calm)                                            */
/* ────────────────────────────────────────────────────────────────────────── */

const LABEL = 'mb-1.5 block text-[11px] font-medium uppercase tracking-[0.1em] text-[#666]'
const INPUT = 'w-full border border-[#E5E5E5] bg-white px-3 py-2 text-[13px] text-[#2D2D2D] outline-none focus:border-[#2D2D2D]'
const TEXTAREA = INPUT + ' resize-none'
const SELECT = INPUT + ' appearance-none'

function Section({
  id,
  title,
  sub,
  children,
}: {
  id: string
  title: string
  sub?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-20 border border-[#E5E5E5] bg-white">
      <header className="border-b border-[#E5E5E5] px-6 py-4">
        <h2 className="text-[15px] font-semibold text-[#2D2D2D]">{title}</h2>
        {sub && <p className="mt-0.5 text-[12px] text-[#888]">{sub}</p>}
      </header>
      <div className="space-y-5 p-6">{children}</div>
    </section>
  )
}

// Phase 9: tiny relative-time helper for the restore-draft banner. Native
// Intl.RelativeTimeFormat handles localization but rounds awkwardly for the
// "a few seconds ago" case, so we shortcut the small intervals manually.
function formatRelativeTime(ts: number): string {
  if (!ts) return 'just now'
  const diff = Date.now() - ts
  if (diff < 60_000) return 'a few seconds ago'
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} h ago`
  return `${Math.round(diff / 86_400_000)} d ago`
}

function PrimaryBtn(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = '', ...rest } = props
  return (
    <button
      {...rest}
      className={`bg-[#2D2D2D] px-4 py-2 text-[12px] font-medium text-white hover:bg-[#1A1A1A] disabled:opacity-40 ${className}`}
    />
  )
}

function SecondaryBtn(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = '', ...rest } = props
  return (
    <button
      {...rest}
      className={`border border-[#E5E5E5] bg-white px-4 py-2 text-[12px] font-medium text-[#2D2D2D] hover:bg-[#FAFAF8] disabled:opacity-40 ${className}`}
    />
  )
}

// Multi-select chip control used by the Tags + Geo fields. We render the
// canonical option list as toggleable chips, plus any "custom" values the
// advertiser typed that aren't in `options` (so legacy / template-seeded
// values render correctly). A small inline input on the right lets them add
// new custom values; pressing Enter or comma commits. Selection state is
// passed in/out as `string[]` and the parent is responsible for serializing
// to its preferred storage shape (we keep CSV in formData to avoid touching
// the API contract).
function ChipSelect({
  id,
  options,
  value,
  onChange,
  placeholder,
}: {
  id: string
  options: readonly string[]
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
}) {
  const [draft, setDraft] = useState('')
  const selected = new Set(value.map((v) => v.toLowerCase()))
  const customValues = value.filter((v) => !options.some((o) => o.toLowerCase() === v.toLowerCase()))
  const toggle = (opt: string) => {
    const isSel = selected.has(opt.toLowerCase())
    if (isSel) {
      onChange(value.filter((v) => v.toLowerCase() !== opt.toLowerCase()))
    } else {
      onChange([...value, opt])
    }
  }
  const addCustom = () => {
    const cleaned = draft.trim().replace(/,+$/, '').trim()
    if (!cleaned) return
    // Accept comma-separated bulk paste
    const parts = cleaned
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const next = [...value]
    for (const p of parts) {
      if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p)
    }
    onChange(next)
    setDraft('')
  }
  return (
    <div id={id} className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const isSel = selected.has(opt.toLowerCase())
          return (
            <button
              type="button"
              key={opt}
              onClick={() => toggle(opt)}
              aria-pressed={isSel}
              className={`border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                isSel
                  ? 'border-[#2D2D2D] bg-[#2D2D2D] text-white'
                  : 'border-[#E5E5E5] bg-white text-[#2D2D2D] hover:bg-[#FAFAF8]'
              }`}
            >
              {opt}
            </button>
          )
        })}
        {customValues.map((opt) => (
          <button
            type="button"
            key={`custom-${opt}`}
            onClick={() => toggle(opt)}
            aria-pressed
            className="inline-flex items-center gap-1 border border-[#2D2D2D] bg-[#2D2D2D] px-2.5 py-1 text-[11px] font-medium text-white"
            title="Remove"
          >
            <span>{opt}</span>
            <span aria-hidden className="opacity-70">×</span>
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              addCustom()
            } else if (e.key === 'Backspace' && !draft && value.length) {
              // Quick undo for the last chip when the input is empty.
              onChange(value.slice(0, -1))
            }
          }}
          placeholder={placeholder || 'Add custom… (Enter to commit)'}
          className="flex-1 border border-[#E5E5E5] bg-white px-3 py-1.5 text-[12px] text-[#2D2D2D] placeholder:text-[#999] focus:border-[#2D2D2D] focus:outline-none"
        />
        {draft.trim() && (
          <button
            type="button"
            onClick={addCustom}
            className="border border-[#E5E5E5] bg-white px-3 py-1.5 text-[11px] font-medium text-[#2D2D2D] hover:bg-[#FAFAF8]"
          >
            Add
          </button>
        )}
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Page                                                                       */
/* ────────────────────────────────────────────────────────────────────────── */

export default function CreateCampaign() {
  const { address } = useAccount()
  const { createStreamingCampaign, isLoading, error } = useStreamingAds()

  const { data: gdollarBalanceRaw } = useReadContract({
    address: GOODDOLLAR_ADDRESS as `0x${string}`,
    abi: ERC20_BALANCE_ABI,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    chainId,
    query: { enabled: !!address, refetchInterval: 15_000 },
  })
  const gdollarBalance =
    gdollarBalanceRaw != null
      ? parseFloat(formatUnits(gdollarBalanceRaw as bigint, 18)).toFixed(4)
      : null

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
          cpc: params.get('cpc') || '2',
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
      cpc: '2',
      tokenAddress: GOODDOLLAR_ADDRESS,
      tags: '',
      targetLocations: '',
      metadata: '',
      mediaType: 'image',
    }
  })

  // Single datetime-local pair + preset duration
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')

  // Phase 3: smart defaults. First-time advertisers don't know what start / end
  // values are "normal" — most pick the current minute and a month out. Pre-fill
  // those so the form is launch-ready as soon as a name + budget are entered.
  // Done in useEffect (not useState init) so the server-rendered HTML and the
  // hydrated client agree; otherwise `new Date()` would produce different
  // values on each side and trigger a hydration warning.
  useEffect(() => {
    if (startAt || endAt) return
    const pad = (n: number) => String(n).padStart(2, '0')
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    const now = new Date()
    const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    setStartAt(fmt(now))
    setEndAt(fmt(end))
    // run once on mount; we deliberately don't want this to re-fire when the
    // advertiser later clears the inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [ctaDrafts, setCtaDrafts] = useState<CtaDraft[]>([])
  const [submitMode, setSubmitMode] = useState<'draft' | 'publish' | null>(null)
  const [ctaErrors, setCtaErrors] = useState<{ label: string; error: string }[]>([])
  const [bannerPreview, setBannerPreview] = useState('')
  // Deferred upload: keep the picked File in memory; only upload during submit
  // so cancelled drafts don't leave orphan blobs on the server.
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  // Phase 7: track *where* the most recent submit error came from so the error
  // banner can offer a "Jump to the field" link instead of just telling users
  // something is wrong and making them scroll.
  const [submitErrorAnchor, setSubmitErrorAnchor] = useState<{
    sectionId?: string
    fieldId?: string
  } | null>(null)
  const [success, setSuccess] = useState(false)
  const [showAdvancedCtaKinds, setShowAdvancedCtaKinds] = useState(false)

  // Phase 9: AppKit wallet modal opener used by the inline "Connect wallet"
  // button in the submit row. Calling open() with no args shows the standard
  // connect view; we don't pass `view: 'Connect'` so users who are mid-flow
  // (e.g. wrong network) see the right screen automatically.
  const { open: openAppKit } = useAppKit()

  // Phase 9: a ref-based submit lock. State updates are async, so a fast
  // double-click on "Launch campaign" used to fire two POSTs / two on-chain
  // transactions before isSubmitting toggled. The ref flips synchronously
  // inside handleSubmit's first line and gates everything below it.
  const submitLock = useRef(false)

  // Phase 9: restore-draft prompt. We don't auto-overwrite the form on mount
  // because a clone-from-URL or a deliberate fresh start would clobber the
  // user's intent. Instead we surface a small banner asking what they want.
  const [restoredDraft, setRestoredDraft] = useState<{
    formData: CampaignFormData
    startAt: string
    endAt: string
    ctaDrafts: CtaDraft[]
    savedAt: number
  } | null>(null)
  // Tracks whether the user has interacted with the form. Used to gate the
  // beforeunload prompt so a freshly-loaded page doesn't block navigation.
  const [isDirty, setIsDirty] = useState(false)

  const selectedTokenInfo =
    getTokenInfo(formData.tokenAddress) || { symbol: 'TOKEN', name: 'Token', decimals: 18, address: '' }

  // Phase 9: restore-on-mount. Read a saved draft into `restoredDraft`; we do
  // NOT auto-apply it because the user might have hit /create-campaign on
  // purpose to start fresh, and silently clobbering inputs is a bad surprise.
  // A clone-from-URL takes precedence — those campaigns already pre-fill
  // through the formData initializer, so we skip the restore prompt entirely.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const isClone = new URLSearchParams(window.location.search).get('clone') === 'true'
      if (isClone) return
      const raw = window.localStorage.getItem(DRAFT_LS_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as {
        v?: number
        formData?: CampaignFormData
        startAt?: string
        endAt?: string
        ctaDrafts?: CtaDraft[]
        savedAt?: number
      }
      if (parsed.v !== DRAFT_SCHEMA_VERSION) return
      if (!parsed.formData) return
      // Don't offer to restore a draft that's effectively empty.
      const looksEmpty =
        !parsed.formData.name?.trim() &&
        !parsed.formData.description?.trim() &&
        !parsed.formData.budget?.trim() &&
        (!parsed.ctaDrafts || parsed.ctaDrafts.length === 0)
      if (looksEmpty) return
      // Defend against older drafts that pre-date the pollOptions field by
      // back-filling a fresh two-option seed for POLL / QUIZ kinds. v1 drafts
      // are already filtered out by the schema-version check above, so this
      // branch only covers v2 drafts saved before pollOptions stabilised.
      const seed = () => [
        { id: newPollOptionId(), label: '' },
        { id: newPollOptionId(), label: '' },
      ]
      const migratedCtas: CtaDraft[] = (parsed.ctaDrafts || []).map((c) => ({
        ...c,
        pollOptions:
          Array.isArray(c.pollOptions) && c.pollOptions.length >= MIN_POLL_OPTIONS
            ? c.pollOptions.slice(0, MAX_POLL_OPTIONS).map((o) => ({
                id: o.id || newPollOptionId(),
                label: o.label || '',
                ...(o.correct ? { correct: true } : {}),
              }))
            : c.kind === 'POLL' || c.kind === 'QUIZ'
              ? seed()
              : [],
      }))
      setRestoredDraft({
        formData: parsed.formData,
        startAt: parsed.startAt || '',
        endAt: parsed.endAt || '',
        ctaDrafts: migratedCtas,
        savedAt: parsed.savedAt || 0,
      })
    } catch {
      // Corrupt JSON or storage blocked — silently ignore; new drafts will
      // overwrite the bad value on the next autosave.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Phase 9: debounced autosave. Writes a snapshot of the live form on every
  // change, batched through a 600ms timer so rapid typing doesn't hammer
  // localStorage. `isDirty` is what flips the beforeunload prompt below.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handle = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          DRAFT_LS_KEY,
          JSON.stringify({
            v: DRAFT_SCHEMA_VERSION,
            formData,
            startAt,
            endAt,
            ctaDrafts,
            savedAt: Date.now(),
          }),
        )
      } catch {
        // Quota exceeded or storage disabled — non-fatal.
      }
    }, AUTOSAVE_DEBOUNCE_MS)
    return () => window.clearTimeout(handle)
  }, [formData, startAt, endAt, ctaDrafts])

  // Phase 9: beforeunload guard. Only fires when the user has actively edited
  // something; we don't trap pristine page loads or post-success states.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!isDirty || success) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Most modern browsers ignore the custom message but still display the
      // native prompt as long as returnValue is set.
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty, success])

  const setNow = () => {
    const pad = (n: number) => String(n).padStart(2, '0')
    const d = new Date()
    const v = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    setStartAt(v)
  }
  const setDurationDays = (days: number) => {
    const base = startAt ? new Date(startAt) : new Date()
    if (!startAt) {
      const pad = (n: number) => String(n).padStart(2, '0')
      const v = `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}T${pad(base.getHours())}:${pad(base.getMinutes())}`
      setStartAt(v)
    }
    const end = new Date(base.getTime() + days * 24 * 60 * 60 * 1000)
    const pad = (n: number) => String(n).padStart(2, '0')
    setEndAt(
      `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}T${pad(end.getHours())}:${pad(end.getMinutes())}`,
    )
  }

  // Live spend estimate: clicks at fixed CPC, impressions at $0.0002 / tokenUsd
  // Display-only — backend uses lib/impression-pricing.ts as the source of truth.
  const G_USD_FALLBACK = 0.000116
  const IMPRESSION_USD = 0.0002
  // Phase 6: budget rules of thumb. Below these thresholds the advertiser will
  // almost certainly burn through their pool before getting useful data, so we
  // surface a friendly warning instead of letting them launch blindly.
  const MIN_RECOMMENDED_CLICKS = 5
  const MIN_RECOMMENDED_IMPRESSIONS = 500

  // Phase 9: floor value for the schedule pickers. We snapshot it once on
  // mount; native browser pickers don't auto-update an open dropdown when the
  // attribute changes anyway, so a live clock would be cosmetic.
  const nowLocal = useMemo(() => {
    if (typeof window === 'undefined') return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    const d = new Date()
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }, [])
  const estimate = useMemo(() => {
    const budget = parseFloat(formData.budget || '0')
    const cpc = parseFloat(formData.cpc || '0')
    if (!budget || budget <= 0) return null
    const impressionCost = IMPRESSION_USD / G_USD_FALLBACK // ≈ 1.72 G$
    const maxClicks = cpc > 0 ? Math.floor(budget / cpc) : 0
    const maxImpressions = impressionCost > 0 ? Math.floor(budget / impressionCost) : 0
    const days =
      startAt && endAt ? Math.max(1, Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 86400000)) : null
    // Phase 6: a few derived signals advertisers actually care about. Daily spend
    // turns "30 G$ over 30 days" into "1 G$/day" — much easier to reason about.
    // The health rating drives the colour + label on the spend card.
    const dailySpend = days ? budget / days : null
    const warnings: string[] = []
    if (maxClicks < MIN_RECOMMENDED_CLICKS) {
      warnings.push(
        `At ${cpc} G$ per click, this budget covers fewer than ${MIN_RECOMMENDED_CLICKS} clicks — consider topping up.`,
      )
    }
    if (maxImpressions < MIN_RECOMMENDED_IMPRESSIONS) {
      warnings.push(
        `Under ${MIN_RECOMMENDED_IMPRESSIONS.toLocaleString()} impressions — most campaigns need more reach to learn what works.`,
      )
    }
    if (days != null && days > 90) {
      warnings.push(
        'Running longer than 90 days. Shorter campaigns let you test and iterate faster.',
      )
    }
    const level: 'high' | 'medium' | 'low' =
      warnings.length >= 2 ? 'low' : warnings.length === 1 ? 'medium' : 'high'
    return { maxClicks, maxImpressions, impressionCost, days, dailySpend, warnings, level }
  }, [formData.budget, formData.cpc, startAt, endAt])

  // Phase 4: the previous slug used `Math.random() * 100`, which left only 100
  // unique ids per day — collisions inside a single advertiser's account were a
  // matter of when, not if. Replace with a date prefix + 6 random hex chars
  // derived from crypto when available (browser + recent Node), with a Math.random
  // fallback that still produces ~16M permutations. The slug is used as the
  // human-readable id stored in on-chain metadata; the DB id is still server-
  // assigned via the create-campaign API.
  const generateCampaignId = () => {
    const now = new Date()
    const yy = String(now.getFullYear()).slice(2)
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    let rand = ''
    try {
      const cryptoObj: Crypto | undefined =
        typeof globalThis !== 'undefined' ? (globalThis as { crypto?: Crypto }).crypto : undefined
      if (cryptoObj?.getRandomValues) {
        const bytes = new Uint8Array(3)
        cryptoObj.getRandomValues(bytes)
        rand = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
      }
    } catch {
      // ignored; fall through to Math.random
    }
    if (!rand) {
      rand = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')
    }
    return `sovads-${yy}${month}${day}-${rand}`
  }

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    // Phase 9: mark dirty on first user-driven change so the autosave +
    // beforeunload effects start tracking.
    if (!isDirty) setIsDirty(true)
  }

  // Starter-template handler. We only overwrite fields the template explicitly
  // ships with — never the dates, budget, or pricing the advertiser may have
  // already set. CTAs are a full replacement because mixing template CTAs
  // with the empty default row gets messy; if the advertiser already
  // hand-built CTAs we confirm before clobbering.
  const applyTemplate = (tplId: string) => {
    const tpl = CAMPAIGN_TEMPLATES.find((t) => t.id === tplId)
    if (!tpl) return
    const hasUserCtas = ctaDrafts.some((c) => c.label.trim() || c.description.trim() || c.url.trim())
    if (hasUserCtas) {
      const ok = typeof window !== 'undefined'
        ? window.confirm('Applying this template will replace the CTAs you\'ve already filled in. Continue?')
        : true
      if (!ok) return
    }
    setFormData((prev) => ({ ...prev, ...tpl.data }))
    if (tpl.ctas) {
      setCtaDrafts(
        tpl.ctas.map((c) => ({
          ...newCtaDraft(c.kind),
          ...c,
          // newCtaDraft already seeds the right pollOptions shape based on
          // kind; the spread above intentionally doesn't carry option data
          // because templates don't ship per-option labels.
        })),
      )
    }
    setIsDirty(true)
  }

  // Phase 7: validation now returns a structured payload so the UI can scroll
  // to the offending field, focus it, and tell the advertiser where to look in
  // human language. Messages are rewritten to read like a helpful coworker
  // rather than a server error stack.
  type ValidationFailure = { message: string; sectionId?: string; fieldId?: string }
  const validateForm = (mode: 'draft' | 'publish' = 'publish'): ValidationFailure | null => {
    if (!formData.name.trim())
      return {
        message: 'Give your campaign a name so you can find it later.',
        sectionId: 'details',
        fieldId: 'name',
      }
    if (!formData.description.trim())
      return {
        message: 'Add a short description — it shows up under the ad in the preview.',
        sectionId: 'details',
        fieldId: 'description',
      }
    if (!formData.bannerUrl.trim() && !pendingFile)
      return {
        message: 'Upload an image / video or paste a URL — viewers need something to look at.',
        sectionId: 'details',
      }
    if (!formData.targetUrl.trim())
      return {
        message: 'Where should clicks send viewers? Add a landing URL.',
        sectionId: 'details',
        fieldId: 'targetUrl',
      }
    if (!formData.budget || parseFloat(formData.budget) < 0.0001)
      return {
        message: 'Add a budget — even 1 G$ is enough to start testing.',
        sectionId: 'budget',
        fieldId: 'budget',
      }
    // Network-wide minimum kicks in only at publish time. Drafts can be
    // saved at any amount so the advertiser can keep iterating.
    if (mode === 'publish' && parseFloat(formData.budget) < MIN_BUDGET_GS)
      return {
        message: `Minimum publish budget is ${MIN_BUDGET_GS.toLocaleString()} G$ — you have ${parseFloat(formData.budget).toLocaleString()} G$. Save as a draft if you're not ready to go live.`,
        sectionId: 'budget',
        fieldId: 'budget',
      }
    if (!formData.tokenAddress)
      return {
        message: 'Pick a payment token (only G$ is supported right now).',
        sectionId: 'budget',
      }
    if (!startAt)
      return { message: 'Pick a start time.', sectionId: 'schedule' }
    if (!endAt)
      return { message: 'Pick an end time.', sectionId: 'schedule' }
    // Phase 9: reject schedules in the past. The native `min` attribute will
    // catch most cases via the picker, but a user can paste a date directly.
    // Allow a 60-second buffer so a draft saved at T-30s doesn't bounce.
    if (new Date(startAt).getTime() < Date.now() - 60_000)
      return {
        message: 'Start time is in the past. Pick a future moment so the campaign can actually run.',
        sectionId: 'schedule',
      }
    if (new Date(startAt) > new Date(endAt))
      return {
        message: 'End time needs to be after the start time.',
        sectionId: 'schedule',
      }
    try {
      new URL(formData.targetUrl)
    } catch {
      try {
        new URL(`https://${formData.targetUrl}`)
      } catch {
        return {
          message: "That landing URL doesn't look right — try a full URL like https://example.com.",
          sectionId: 'details',
          fieldId: 'targetUrl',
        }
      }
    }

    // CTA links — every VISIT_URL / SOCIAL_FOLLOW draft must point to a real
    // http(s) URL. Empty URL on those kinds is a hard error because the SDK
    // has nowhere to send the viewer when they click the CTA.
    for (const cta of ctaDrafts) {
      if (cta.kind !== 'VISIT_URL' && cta.kind !== 'SOCIAL_FOLLOW') continue
      const url = cta.url.trim()
      if (!url) {
        return {
          message: `CTA “${cta.label || cta.kind}” needs a URL to send viewers to.`,
          sectionId: 'ctas',
        }
      }
      const check = validateHttpUrl(url)
      if (!check.ok) {
        return {
          message: `CTA “${cta.label || cta.kind}” — ${check.reason}`,
          sectionId: 'ctas',
        }
      }
    }

    // CTA payout floor — if the advertiser is paying G$ for a CTA, the
    // amount has to clear the network minimum. SovPoint-only tasks
    // (rewardGs blank / 0) are unaffected. Enforced only when publishing.
    if (mode === 'publish') {
      for (const cta of ctaDrafts) {
        const raw = (cta.rewardGs ?? '').trim()
        if (!raw) continue
        const amount = Number(raw)
        if (!Number.isFinite(amount) || amount <= 0) continue
        if (amount < MIN_CTA_REWARD_GS) {
          return {
            message: `CTA “${cta.label || cta.kind}” pays ${amount} G$ — minimum is ${MIN_CTA_REWARD_GS} G$ per completion. Bump the reward or remove the G$ payout (SovPoints-only is always allowed).`,
            sectionId: 'ctas',
          }
        }
      }
    }
    return null
  }

  const handleSubmit = async (mode: 'draft' | 'publish') => {
    // Phase 9: synchronous submit lock. State (isSubmitting) updates on the
    // next render, but a fast double-click fires before that — the ref flips
    // immediately and blocks the second invocation entirely.
    if (submitLock.current) return
    if (!address) {
      setSubmitError('Please connect your wallet')
      setSubmitErrorAnchor(null)
      return
    }
    const validationError = validateForm(mode)
    if (validationError) {
      setSubmitError(validationError.message)
      setSubmitErrorAnchor({
        sectionId: validationError.sectionId,
        fieldId: validationError.fieldId,
      })
      // Phase 7: jump the user to the offending field. Prefer the input itself
      // (so they can start typing), then fall back to the section anchor.
      if (typeof window !== 'undefined') {
        const target =
          (validationError.fieldId && document.getElementById(validationError.fieldId)) ||
          (validationError.sectionId && document.getElementById(validationError.sectionId))
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' })
          if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
            // Slight delay so the smooth-scroll completes before we steal focus.
            window.setTimeout(() => target.focus({ preventScroll: true }), 350)
          }
        }
      }
      return
    }

    submitLock.current = true
    setIsSubmitting(true)
    setSubmitMode(mode)
    setSubmitError(null)
    setSubmitErrorAnchor(null)
    setCtaErrors([])

    try {
      // 0. Upload the picked file (if any) NOW — deferred until submit so a
      //    cancelled draft doesn't leave orphans on the server.
      let bannerUrl = formData.bannerUrl
      let mediaType = formData.mediaType
      if (pendingFile) {
        const form = new FormData()
        form.append('image', pendingFile)
        const res = await fetch('/api/uploads/image', { method: 'POST', body: form })
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}))
          throw new Error(errorData.error || 'Upload failed')
        }
        const data = await res.json()
        bannerUrl = data.url
        mediaType = data.mediaType === 'video' ? 'video' : 'image'
        // Persist on the form so the success screen & retry use the uploaded URL.
        setFormData((prev) => ({ ...prev, bannerUrl, mediaType }))
        if (bannerPreview.startsWith('blob:')) URL.revokeObjectURL(bannerPreview)
        setBannerPreview(bannerUrl)
        setPendingFile(null)
      }

      const campaignIdStr = generateCampaignId()
      const startIso = new Date(startAt).toISOString()
      const endIso = new Date(endAt).toISOString()
      const normalizedTargetUrl = /^(https?:)?\/\//i.test(formData.targetUrl)
        ? formData.targetUrl
        : `https://${formData.targetUrl}`

      let txHash: string | undefined
      let onChainId: number | undefined
      if (mode === 'publish') {
        const onChainMetadata = JSON.stringify({
          id: campaignIdStr,
          name: formData.name,
          description: formData.description,
          bannerUrl,
          targetUrl: normalizedTargetUrl,
          cpc: formData.cpc,
          startDate: startIso,
          endDate: endIso,
          createdAt: new Date().toISOString(),
        })
        const durationSeconds = Math.max(
          1,
          Math.floor((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000),
        )
        const result = await createStreamingCampaign(formData.budget, durationSeconds, onChainMetadata)
        txHash = result.hash
        onChainId = result.id as number | undefined
      }

      const parsedTags = formData.tags.split(',').map((t) => t.trim()).filter(Boolean)
      const parsedLocations = formData.targetLocations.split(',').map((l) => l.trim()).filter(Boolean)

      let metadataObject: Record<string, unknown> | undefined
      if (formData.metadata.trim()) {
        try {
          metadataObject = JSON.parse(formData.metadata)
        } catch {
          setSubmitError('Metadata must be valid JSON')
          setIsSubmitting(false)
          setSubmitMode(null)
          return
        }
      }

      const resp = await fetch('/api/campaigns/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: address,
          campaignData: {
            ...formData,
            bannerUrl,
            mediaType,
            tags: parsedTags,
            targetLocations: parsedLocations,
            metadata: metadataObject,
          },
          transactionHash: txHash,
          contractCampaignId: mode === 'publish' ? campaignIdStr : undefined,
          onChainId,
          startDate: startIso,
          endDate: endIso,
          targetUrl: normalizedTargetUrl,
        }),
      })
      const respData = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(respData?.error || respData?.details || 'Failed to save campaign')

      const newCampaignId: string | undefined = respData?.campaign?.id
      if (!newCampaignId) throw new Error('Campaign creation returned no id')

      if (ctaDrafts.length > 0) {
        const errors: { label: string; error: string }[] = []
        for (const c of ctaDrafts) {
          if (!c.label.trim()) continue
          try {
            const taskResp = await fetch('/api/tasks/create', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                campaignId: newCampaignId,
                wallet: address,
                kind: c.kind,
                label: c.label,
                description: c.description || undefined,
                verifier: c.verifier,
                config: buildCtaConfig(c),
                rewardPoints: c.rewardPoints ? Number(c.rewardPoints) : 0,
                rewardGs: c.rewardGs ? Number(c.rewardGs) : undefined,
                maxPerWallet: c.maxPerWallet ? Number(c.maxPerWallet) : 1,
                cooldownSecs: c.cooldownSecs ? Number(c.cooldownSecs) : 0,
                aiPrompt: c.verifier === 'AI_PLAN' ? c.aiPrompt : undefined,
                contractAllowlist:
                  c.verifier === 'AI_PLAN'
                    ? c.contractAllowlist.split(',').map((a) => a.trim()).filter(Boolean)
                    : undefined,
              }),
            })
            if (!taskResp.ok) {
              const taskErr = await taskResp.json().catch(() => ({}))
              errors.push({ label: c.label, error: taskErr?.error || `HTTP ${taskResp.status}` })
            }
          } catch (taskErr) {
            errors.push({
              label: c.label,
              error: taskErr instanceof Error ? taskErr.message : 'failed',
            })
          }
        }
        setCtaErrors(errors)
      }

      setSuccess(true)
      // Phase 9: clear the saved draft now that it's been committed to the
      // database (and possibly on-chain). The autosave effect would re-save
      // a stale snapshot otherwise once `success` re-renders.
      if (typeof window !== 'undefined') {
        try { window.localStorage.removeItem(DRAFT_LS_KEY) } catch { /* non-fatal */ }
      }
      setIsDirty(false)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create campaign')
    } finally {
      setIsSubmitting(false)
      setSubmitMode(null)
      // Phase 9: release the synchronous lock so the user can retry after a
      // failure. On success we still release it — useless on the success
      // screen but harmless if React keeps the component mounted.
      submitLock.current = false
    }
  }

  /* ── Success screen ──────────────────────────────────────────────────── */
  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F3F0] p-6">
        <div className="w-full max-w-md border border-[#E5E5E5] bg-white p-10 text-center">
          <div className="mx-auto mb-6 inline-flex h-12 w-12 items-center justify-center bg-[#2D2D2D] text-2xl text-white">
            ✓
          </div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[#888]">Done</p>
          <h1 className="mb-3 text-[20px] font-semibold text-[#2D2D2D]">Campaign created</h1>
          <p className="mb-8 text-[13px] leading-5 text-[#666]">
            {submitMode === 'publish'
              ? 'Your campaign is live and will start serving at the scheduled time.'
              : 'Your draft is saved. Launch it from the dashboard when ready.'}
          </p>
          {ctaErrors.length > 0 && (
            <div className="mb-6 border border-[#E5E5E5] bg-[#FAFAF8] p-3 text-left">
              <p className="mb-1 text-[11px] font-medium text-[#2D2D2D]">Some CTAs failed:</p>
              <ul className="space-y-0.5 text-[11px] text-[#666]">
                {ctaErrors.map((e, i) => (
                  <li key={i}>
                    <span className="text-[#2D2D2D]">{e.label}</span> — {e.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <PrimaryBtn
              onClick={() => {
                setSuccess(false)
              }}
            >
              Create another
            </PrimaryBtn>
            <a
              href="/advertiser"
              className="border border-[#E5E5E5] bg-white px-4 py-2 text-center text-[12px] font-medium text-[#2D2D2D] hover:bg-[#FAFAF8]"
            >
              Back to dashboard
            </a>
          </div>
        </div>
      </div>
    )
  }

  /* ── Form ────────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-[#F5F3F0] py-10 px-4">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#888]">Advertiser</p>
            <h1 className="text-[22px] font-semibold text-[#2D2D2D]">New campaign</h1>
            {/* Phase 8: a single-line orientation sentence so first-time
             * advertisers know what they're committing to before scrolling. */}
            <p className="mt-1 text-[12px] text-[#666]">
              Most campaigns take about a minute. You can save a draft any time and launch later.
            </p>
          </div>
          <SecondaryBtn
            onClick={() => {
              if (typeof window !== 'undefined') window.history.back()
            }}
          >
            ← Back
          </SecondaryBtn>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          {/* Form column */}
          <form
            onSubmit={(e) => e.preventDefault()}
            // Phase 9: a single form-level dirty detector. Native input/change
            // events bubble from every <input>, <textarea>, and <select> in
            // the tree (including the file picker and the buttons that add or
            // remove CTAs trigger downstream changes), so this catches all
            // user-driven mutations without us instrumenting each setter.
            onInput={() => { if (!isDirty) setIsDirty(true) }}
            onChange={() => { if (!isDirty) setIsDirty(true) }}
            // Phase 9: Cmd/Ctrl+Enter from anywhere inside the form launches
            // the campaign — a familiar shortcut from messaging apps.
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault()
                void handleSubmit('publish')
              }
            }}
            className="space-y-6"
          >
            {/* Phase 9: restore-draft banner. Only renders when the mount-time
             * effect found a saved draft worth offering. We show the relative
             * time so the user can decide whether the snapshot is recent
             * enough to be worth keeping. */}
            {restoredDraft && (
              <div className="flex flex-col gap-3 border border-[#2D2D2D] bg-[#FFFCEF] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-[12px] text-[#2D2D2D]">
                  <p className="font-medium">You have an unsaved draft from a previous session.</p>
                  <p className="mt-0.5 text-[11px] text-[#666]">
                    Saved {formatRelativeTime(restoredDraft.savedAt)}.
                    {restoredDraft.formData.name ? ` Campaign: "${restoredDraft.formData.name}".` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      // Apply the saved snapshot wholesale. The autosave
                      // effect will rewrite it almost immediately, so the
                      // user can keep editing without losing anything.
                      setFormData(restoredDraft.formData)
                      if (restoredDraft.startAt) setStartAt(restoredDraft.startAt)
                      if (restoredDraft.endAt) setEndAt(restoredDraft.endAt)
                      setCtaDrafts(restoredDraft.ctaDrafts)
                      setRestoredDraft(null)
                      setIsDirty(true)
                    }}
                    className="border border-[#2D2D2D] bg-[#2D2D2D] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[#1A1A1A]"
                  >
                    Restore draft
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      // Hard-discard: wipe localStorage so the next page load
                      // starts clean. Without this the banner would re-appear.
                      if (typeof window !== 'undefined') {
                        try { window.localStorage.removeItem(DRAFT_LS_KEY) } catch { /* non-fatal */ }
                      }
                      setRestoredDraft(null)
                    }}
                    className="border border-[#E5E5E5] bg-white px-3 py-1.5 text-[11px] font-medium text-[#2D2D2D] hover:bg-[#FAFAF8]"
                  >
                    Start fresh
                  </button>
                </div>
              </div>
            )}
            {/* Details */}
            <Section id="details" title="Campaign details" sub="What the ad is and where it sends viewers.">
              {/* Starter templates. Hidden once the advertiser has typed a
               * name so we don't keep nagging mid-edit. Clicking a template
               * pre-fills copy, tags, geo, and CTAs — pricing/dates/budget
               * remain user-controlled. */}
              {!formData.name.trim() && (
                <div className="border border-dashed border-[#E5E5E5] bg-[#FAFAF8] p-3">
                  <div className="mb-2 flex items-baseline justify-between">
                    <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#666]">
                      Start from a template
                    </p>
                    <p className="text-[10px] text-[#888]">Optional — pre-fills copy & CTAs</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {CAMPAIGN_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => applyTemplate(tpl.id)}
                        className="group flex max-w-[220px] flex-col items-start gap-0.5 border border-[#E5E5E5] bg-white px-3 py-2 text-left transition-colors hover:border-[#2D2D2D] hover:bg-[#FAFAF8]"
                        title={tpl.description}
                      >
                        <span className="text-[12px] font-medium text-[#2D2D2D]">
                          <span className="mr-1.5">{tpl.emoji}</span>
                          {tpl.label}
                        </span>
                        <span className="text-[10px] leading-snug text-[#888]">{tpl.description}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label htmlFor="name" className={LABEL}>Name</label>
                <input id="name" name="name" value={formData.name} onChange={handleInputChange} className={INPUT} placeholder="My campaign" required />
              </div>
              <div>
                <label htmlFor="description" className={LABEL}>Description</label>
                <textarea id="description" name="description" value={formData.description} onChange={handleInputChange} rows={3} className={TEXTAREA} placeholder="One sentence describing the offer" required />
              </div>
              <div>
                <label className={LABEL}>Creative (image, GIF, or video)</label>
                <p className="-mt-0.5 mb-2 text-[11px] text-[#888]">
                  Recommended 1200×600 (2:1). Image, GIF, or MP4 under 2 MB.
                </p>
                <input
                  type="file"
                  accept="image/*,video/*,.gif"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    setSubmitError(null)
                    // Revoke previous blob URL if any
                    if (bannerPreview.startsWith('blob:')) URL.revokeObjectURL(bannerPreview)
                    const localUrl = URL.createObjectURL(file)
                    const isVideo = file.type.startsWith('video/')
                    setPendingFile(file)
                    setBannerPreview(localUrl)
                    // Clear any previously typed URL so submit knows to upload the file
                    setFormData((prev) => ({
                      ...prev,
                      bannerUrl: '',
                      mediaType: isVideo ? 'video' : 'image',
                    }))
                  }}
                  className="block w-full cursor-pointer border border-[#E5E5E5] bg-white px-3 py-2 text-[12px] text-[#2D2D2D] file:mr-3 file:cursor-pointer file:border-0 file:bg-[#2D2D2D] file:px-3 file:py-1 file:text-[11px] file:font-medium file:text-white"
                />
                {pendingFile && (
                  <p className="mt-2 text-[11px] text-[#888]">
                    Selected <span className="text-[#2D2D2D]">{pendingFile.name}</span> ({Math.round(pendingFile.size / 1024)} KB) — uploads when you save or publish.
                    {' '}
                    <button
                      type="button"
                      onClick={() => {
                        if (bannerPreview.startsWith('blob:')) URL.revokeObjectURL(bannerPreview)
                        setPendingFile(null)
                        setBannerPreview('')
                      }}
                      className="underline hover:text-[#2D2D2D]"
                    >
                      Remove
                    </button>
                  </p>
                )}

                <div className="my-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-[#888]">
                  <span className="h-px flex-1 bg-[#E5E5E5]" /> or paste a URL <span className="h-px flex-1 bg-[#E5E5E5]" />
                </div>

                {/* Once a URL is present (or a file is staged), the media-
                 * type select is redundant — we auto-detect from the URL
                 * extension / streaming provider — and the helper text below
                 * is just noise. We collapse both, and surface an inline "×"
                 * clear control inside the URL input so the advertiser can
                 * undo and bring the full picker back. */}
                <div className="relative flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="url"
                      value={formData.bannerUrl}
                      onChange={(e) => {
                        const url = e.target.value
                        // Streaming platform URLs (YouTube/Vimeo/TikTok) render as
                        // iframes by the SDK — treat as 'video' for type purposes.
                        const isStreaming = !!toStreamingEmbed(url)
                        const isVideo = isStreaming || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)
                        if (pendingFile) {
                          if (bannerPreview.startsWith('blob:')) URL.revokeObjectURL(bannerPreview)
                          setPendingFile(null)
                        }
                        setFormData((prev) => ({
                          ...prev,
                          bannerUrl: url,
                          mediaType: isVideo ? 'video' : 'image',
                        }))
                        setBannerPreview(url)
                      }}
                      placeholder="https://cdn.example.com/banner.png"
                      className={`${INPUT} ${formData.bannerUrl ? 'pr-9' : ''}`}
                    />
                    {formData.bannerUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setFormData((prev) => ({ ...prev, bannerUrl: '', mediaType: 'image' }))
                          // Only clear the preview if it wasn't a blob from a
                          // pending file (the file branch owns that lifecycle).
                          if (!pendingFile) setBannerPreview('')
                        }}
                        aria-label="Clear URL"
                        title="Clear URL"
                        className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center text-[14px] leading-none text-[#888] hover:bg-[#FAFAF8] hover:text-[#2D2D2D]"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  {/* Hide the type-of-media chooser once we have a value; we
                   * already auto-detected the right one and surface it via
                   * the streaming-embed callout / preview below. */}
                  {!formData.bannerUrl && !pendingFile && (
                    <select
                      value={formData.mediaType}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, mediaType: e.target.value as 'image' | 'video' }))
                      }
                      className={`${SELECT} w-28`}
                    >
                      <option value="image">Image</option>
                      <option value="video">Video</option>
                    </select>
                  )}
                </div>
                {toStreamingEmbed(formData.bannerUrl) && (
                  <p className="mt-2 border border-[#E5E5E5] bg-[#FAFAF8] px-3 py-2 text-[11px] text-[#666]">
                    Detected a <strong className="font-semibold text-[#2D2D2D]">{toStreamingEmbed(formData.bannerUrl)!.provider}</strong>{' '}
                    link — we’ll embed it via iframe at render time.
                  </p>
                )}
                {!formData.bannerUrl && !pendingFile && (
                  <p className="mt-1 text-[11px] text-[#888]">
                    Direct file (image, GIF, MP4, WebM) or a YouTube / Vimeo / TikTok URL. We auto-detect format.
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="targetUrl" className={LABEL}>Landing URL</label>
                <input id="targetUrl" name="targetUrl" type="url" value={formData.targetUrl} onChange={handleInputChange} className={INPUT} placeholder="https://example.com" required />
              </div>
              {/* Phase 2: Tags + Geo are nice-to-have but most advertisers
               * launch their first campaign without them. Tuck them behind
               * a disclosure so the basic form fits on one screen. */}
              <details className="group border border-[#E5E5E5] bg-[#FAFAF8] px-4 py-3">
                <summary className="cursor-pointer list-none text-[11px] font-medium uppercase tracking-[0.1em] text-[#666] group-open:text-[#2D2D2D]">
                  <span className="inline-flex items-center gap-2">
                    <span className="transition-transform group-open:rotate-90">›</span>
                    Targeting (optional)
                  </span>
                  <span className="ml-2 text-[10px] normal-case tracking-normal text-[#888]">
                    Tags &amp; geo &mdash; helps publishers match your ad
                  </span>
                </summary>
                <div className="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="tags" className={LABEL}>Tags</label>
                    <ChipSelect
                      id="tags"
                      options={TAG_OPTIONS}
                      value={parseCsvList(formData.tags)}
                      onChange={(next) => {
                        setFormData((prev) => ({ ...prev, tags: joinCsvList(next) }))
                        setIsDirty(true)
                      }}
                      placeholder="Add custom tag…"
                    />
                  </div>
                  <div>
                    <label htmlFor="targetLocations" className={LABEL}>Geo</label>
                    <ChipSelect
                      id="targetLocations"
                      options={GEO_OPTIONS}
                      value={parseCsvList(formData.targetLocations)}
                      onChange={(next) => {
                        setFormData((prev) => ({ ...prev, targetLocations: joinCsvList(next) }))
                        setIsDirty(true)
                      }}
                      placeholder="Add custom region…"
                    />
                  </div>
                </div>
              </details>
            </Section>

            {/* Budget */}
            <Section id="budget" title="Budget" sub="One pool covers impressions, clicks, and CTAs.">
              {/* Phase 2: the protocol only accepts G$ today. Showing a single-
               * option dropdown made the UI feel mid-construction; render the
               * pick as a fixed badge instead. The hidden input keeps the form
               * payload identical for the API. */}
              <div>
                <label className={LABEL}>Payment token</label>
                <div className="flex items-center gap-2 border border-[#E5E5E5] bg-[#FAFAF8] px-3 py-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#2D2D2D] text-[10px] font-semibold text-white">G$</span>
                  <span className="text-[12px] text-[#2D2D2D]">{getTokenLabel(formData.tokenAddress) || 'GoodDollar'}</span>
                  <span className="ml-auto text-[10px] uppercase tracking-[0.1em] text-[#888]">More tokens soon</span>
                </div>
                <input type="hidden" name="tokenAddress" value={formData.tokenAddress} />
              </div>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="budget" className={LABEL}>
                    Budget ({selectedTokenInfo.symbol})
                    {gdollarBalance !== null && (
                      <span className="ml-2 text-[10px] normal-case tracking-normal text-[#888]">
                        Balance: <span className="text-[#2D2D2D]">{gdollarBalance} G$</span>
                      </span>
                    )}
                  </label>
                  <input id="budget" name="budget" type="number" step="0.0001" min="0.0001" max={gdollarBalance ?? undefined} value={formData.budget} onChange={handleInputChange} className={INPUT} placeholder="1.0" required />
                  <p className="mt-1 text-[10px] text-[#888]">
                    Minimum to publish on-chain: <span className="font-semibold text-[#2D2D2D]">{MIN_BUDGET_GS.toLocaleString()} G$</span>. Smaller amounts can still be saved as a draft.
                  </p>
                </div>
                <div>
                  <label htmlFor="cpc" className={LABEL}>Pay per click ({selectedTokenInfo.symbol})</label>
                  {/* Editable CPC. We keep `2` as the suggested default (set
                   * in the form initializer + Phase 0 fallback), but the
                   * advertiser can bid higher to win more impressions or
                   * lower to stretch the budget. Server still treats this as
                   * authoritative — see /api/campaigns/create. */}
                  <input
                    id="cpc"
                    name="cpc"
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    value={formData.cpc}
                    onChange={handleInputChange}
                    className={INPUT}
                    placeholder="2"
                    required
                  />
                </div>
              </div>
              {estimate && (
                <div
                  className={`border p-3 ${
                    estimate.level === 'low'
                      ? 'border-[#E5C9C9] bg-[#FDF6F4]'
                      : estimate.level === 'medium'
                        ? 'border-[#E5DAC5] bg-[#FDFAF4]'
                        : 'border-[#E5E5E5] bg-[#FAFAF8]'
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#666]">Estimate</p>
                    <span
                      className={`text-[10px] uppercase tracking-[0.1em] ${
                        estimate.level === 'low'
                          ? 'text-[#A14242]'
                          : estimate.level === 'medium'
                            ? 'text-[#9C6E2A]'
                            : 'text-[#2D2D2D]'
                      }`}
                    >
                      {estimate.level === 'low'
                        ? 'Budget looks tight'
                        : estimate.level === 'medium'
                          ? 'Workable'
                          : 'Healthy'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-[12px] text-[#2D2D2D]">
                    <div>
                      <p className="tabular-nums">{estimate.maxImpressions.toLocaleString()}</p>
                      <p className="text-[10px] text-[#888]">
                        max impressions (~{estimate.impressionCost.toFixed(3)} {selectedTokenInfo.symbol} each)
                      </p>
                    </div>
                    <div>
                      <p className="tabular-nums">{estimate.maxClicks.toLocaleString()}</p>
                      <p className="text-[10px] text-[#888]">
                        max clicks @ {formData.cpc} {selectedTokenInfo.symbol}
                      </p>
                    </div>
                  </div>
                  {/* Phase 6: spell out the per-day spend so advertisers can decide
                      whether the run rate matches their cash flow. */}
                  {estimate.dailySpend != null && estimate.days != null && (
                    <p className="mt-2 text-[10px] text-[#888]">
                      ~{estimate.dailySpend.toFixed(estimate.dailySpend >= 10 ? 0 : 2)} {selectedTokenInfo.symbol}/day over {estimate.days} day{estimate.days === 1 ? '' : 's'}.
                    </p>
                  )}
                  {/* Phase 6: per-warning bullets. We surface them inline rather
                      than blocking submit; advertisers should be able to launch
                      a small test campaign without fighting the form. */}
                  {estimate.warnings.length > 0 && (
                    <ul className="mt-2 space-y-1 text-[10.5px] text-[#7a4a4a]">
                      {estimate.warnings.map((w, i) => (
                        <li key={i} className="flex gap-1.5">
                          <span aria-hidden="true">&bull;</span>
                          <span>{w}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </Section>

            {/* Schedule */}
            <Section id="schedule" title="Schedule" sub="Defaults to a 30-day window starting now &mdash; tweak if you need.">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <label className={LABEL}>Start</label>
                  {/* Phase 9: `min` blocks past dates via the native picker.
                   * `nowLocal` snapshots at mount; it's not real-time, but the
                   * one-minute drift is the kind of edge a follow-up server
                   * validation should catch anyway. */}
                  <input
                    type="datetime-local"
                    value={startAt}
                    min={nowLocal}
                    onChange={(e) => setStartAt(e.target.value)}
                    className={INPUT}
                    required
                  />
                </div>
                <div>
                  <label className={LABEL}>End</label>
                  {/* Phase 9: end must be at least `startAt` + 1 minute. We
                   * derive it from the live startAt so adjusting the start
                   * also shifts the floor on the end picker. */}
                  <input
                    type="datetime-local"
                    value={endAt}
                    min={startAt || nowLocal}
                    onChange={(e) => setEndAt(e.target.value)}
                    className={INPUT}
                    required
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" onClick={setNow} className="border border-[#E5E5E5] bg-white px-2 py-1 text-[11px] text-[#2D2D2D] hover:bg-[#FAFAF8]">Reset start to now</button>
                <span className="text-[11px] text-[#888]">Run for</span>
                {[1, 3, 7, 14, 30].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDurationDays(d)}
                    className="border border-[#E5E5E5] bg-white px-2 py-1 text-[11px] text-[#2D2D2D] hover:bg-[#FAFAF8]"
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </Section>

            {/* CTAs */}
            <Section
              id="ctas"
              title="Bonus actions"
              sub="Reward viewers for visiting a link, following you, or other on-chain actions. Optional."
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-[#666]">{ctaDrafts.length} configured</p>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-[11px] text-[#666]">
                    <input
                      type="checkbox"
                      checked={showAdvancedCtaKinds}
                      onChange={(e) => setShowAdvancedCtaKinds(e.target.checked)}
                      className="h-3 w-3 accent-[#2D2D2D]"
                    />
                    Show advanced types
                  </label>
                  <SecondaryBtn type="button" onClick={() => setCtaDrafts((prev) => [...prev, newCtaDraft()])}>
                    + Add action
                  </SecondaryBtn>
                </div>
              </div>

              {ctaDrafts.length === 0 && (
                // Phase 8: a friendlier empty state with concrete examples so
                // new advertisers understand what a "bonus action" is without
                // having to add one and click through every field type.
                <div className="border border-dashed border-[#E5E5E5] bg-[#FAFAF8] p-5 text-center text-[12px] text-[#666]">
                  <p className="font-medium text-[#2D2D2D]">No bonus actions yet</p>
                  <p className="mt-1 text-[11px] text-[#888]">
                    Optional: reward viewers for visiting a link, following you on socials, or completing a quick poll.
                  </p>
                  <button
                    type="button"
                    onClick={() => setCtaDrafts((prev) => [...prev, newCtaDraft()])}
                    className="mt-3 inline-flex items-center gap-1 border border-[#2D2D2D] bg-white px-3 py-1.5 text-[11px] font-medium text-[#2D2D2D] hover:bg-white"
                  >
                    + Add your first action
                  </button>
                </div>
              )}

              <div className="space-y-3">
                {ctaDrafts.map((c, idx) => {
                  const collapsed = c.collapsed && c.label.trim().length > 0
                  if (collapsed) {
                    return (
                      <div key={c.uid} className="flex items-center justify-between border border-[#E5E5E5] bg-white px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-[12px] text-[#2D2D2D]">
                            <span className="font-medium">{c.label}</span>
                            <span className="text-[#888]"> · {c.kind} · {c.rewardPoints || 0} pts{c.rewardGs ? ` · ${c.rewardGs} G$` : ''}</span>
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button type="button" onClick={() => setCtaDrafts((prev) => prev.map((x) => (x.uid === c.uid ? { ...x, collapsed: false } : x)))} className="text-[11px] text-[#2D2D2D] hover:underline">
                            Edit
                          </button>
                          <span className="text-[#ccc]">·</span>
                          <button type="button" onClick={() => setCtaDrafts((prev) => prev.filter((x) => x.uid !== c.uid))} className="text-[11px] text-[#999] hover:text-[#2D2D2D] hover:underline">
                            Remove
                          </button>
                        </div>
                      </div>
                    )
                  }
                  return (
                    <div key={c.uid} className="border border-[#E5E5E5] bg-white">
                      <header className="flex items-center justify-between border-b border-[#E5E5E5] bg-[#FAFAF8] px-3 py-2">
                        <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#666]">Action #{idx + 1}</p>
                        <div className="flex gap-3">
                          {c.label.trim() && (
                            <button type="button" onClick={() => setCtaDrafts((prev) => prev.map((x) => (x.uid === c.uid ? { ...x, collapsed: true } : x)))} className="text-[11px] text-[#2D2D2D] hover:underline">
                              Collapse
                            </button>
                          )}
                          <button type="button" onClick={() => setCtaDrafts((prev) => prev.filter((x) => x.uid !== c.uid))} className="text-[11px] text-[#999] hover:text-[#2D2D2D] hover:underline">
                            Remove
                          </button>
                        </div>
                      </header>
                      <div className="space-y-3 p-3">
                        <label className="block">
                          <span className={LABEL}>Action type</span>
                          {/* Phase 1: the dropdown lists plain-English options. Only
                           * "basic" types appear by default; CONTRACT_CALL only
                           * surfaces when the user opts into advanced types. */}
                          <select
                            value={c.kind}
                            onChange={(e) => {
                              const kind = e.target.value as CtaKind
                              setCtaDrafts((prev) => prev.map((x) => {
                                if (x.uid !== c.uid) return x
                                // When switching INTO a poll/quiz, make sure
                                // there are at least two option rows to type
                                // into. We DON'T drop pollOptions when
                                // switching OUT so the user can toggle
                                // between POLL and QUIZ without losing work.
                                const needsOptions = kind === 'POLL' || kind === 'QUIZ'
                                const pollOptions =
                                  needsOptions && x.pollOptions.length < MIN_POLL_OPTIONS
                                    ? [
                                        { id: newPollOptionId(), label: '' },
                                        { id: newPollOptionId(), label: '' },
                                      ]
                                    : x.pollOptions
                                return { ...x, kind, verifier: DEFAULT_VERIFIER[kind], pollOptions }
                              }))
                            }}
                            className={SELECT}
                          >
                            {BASIC_CTA_KINDS.map((k) => (
                              <option key={k} value={k}>{CTA_KIND_LABEL[k]}</option>
                            ))}
                            {(showAdvancedCtaKinds || ADVANCED_CTA_KINDS.includes(c.kind)) && ADVANCED_CTA_KINDS.map((k) => (
                              <option key={k} value={k}>{CTA_KIND_LABEL[k]}</option>
                            ))}
                          </select>
                        </label>

                        <label className="block">
                          <span className={LABEL}>Label</span>
                          <input value={c.label} onChange={(e) => setCtaDrafts((prev) => prev.map((x) => (x.uid === c.uid ? { ...x, label: e.target.value } : x)))} className={INPUT} placeholder="e.g. Visit our docs" />
                        </label>
                        <label className="block">
                          <span className={LABEL}>Description</span>
                          <input value={c.description} onChange={(e) => setCtaDrafts((prev) => prev.map((x) => (x.uid === c.uid ? { ...x, description: e.target.value } : x)))} className={INPUT} />
                        </label>

                        {(c.kind === 'VISIT_URL' || c.kind === 'SOCIAL_FOLLOW') && (() => {
                          // Live URL validation: only flag once the user has
                          // actually typed something — don't shout at an empty
                          // field while they're still filling the form.
                          const trimmed = c.url.trim()
                          const check = trimmed ? validateHttpUrl(trimmed) : null
                          const invalid = check && !check.ok
                          return (
                            <label className="block">
                              <span className={LABEL}>URL</span>
                              <input
                                type="url"
                                value={c.url}
                                onChange={(e) => setCtaDrafts((prev) => prev.map((x) => (x.uid === c.uid ? { ...x, url: e.target.value } : x)))}
                                className={`${INPUT} ${invalid ? 'border-[#B00020] focus:border-[#B00020]' : ''}`}
                                placeholder="https://example.com"
                                aria-invalid={invalid ? true : undefined}
                              />
                              {invalid && (
                                <span className="mt-1 block text-[10px] font-medium text-[#B00020]">{check!.reason}</span>
                              )}
                            </label>
                          )
                        })()}
                        {(c.kind === 'POLL' || c.kind === 'QUIZ') && (() => {
                          // Editor for the colored option tiles. Question text
                          // lives in the CTA `label` field above — that's what
                          // the iframe renderer paints as the card header. Here
                          // we only collect the 2–5 options.
                          //
                          // QUIZ additionally requires exactly one option to be
                          // marked correct; the radio in the leading column
                          // enforces that with native single-select behaviour.
                          const TILE_BG = ['#e21b3c', '#1368ce', '#d89e00', '#26890c', '#864cbf']
                          const TILE_FG = ['#fff', '#fff', '#1c1300', '#fff', '#fff']
                          const setOptions = (next: { id: string; label: string; correct?: boolean }[]) =>
                            setCtaDrafts((prev) => prev.map((x) => (x.uid === c.uid ? { ...x, pollOptions: next } : x)))
                          const correctCount = c.pollOptions.filter((o) => o.correct).length
                          const missingCorrect = c.kind === 'QUIZ' && correctCount === 0
                          const filledCount = c.pollOptions.filter((o) => o.label.trim()).length
                          return (
                            <div className="space-y-2">
                              <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#666]">
                                {c.kind === 'QUIZ' ? 'Quiz options' : 'Poll options'}
                                <span className="ml-1.5 text-[10px] normal-case tracking-normal text-[#888]">
                                  ({filledCount}/{MAX_POLL_OPTIONS} · min {MIN_POLL_OPTIONS})
                                </span>
                              </p>
                              <p className="text-[10px] leading-4 text-[#888]">
                                {c.kind === 'QUIZ'
                                  ? 'Pick the one correct option. Wrong answers don’t earn the reward.'
                                  : 'Every option earns the same reward — use this for demographics or audience polls.'}
                              </p>
                              {c.pollOptions.map((opt, oIdx) => (
                                <div key={opt.id} className="flex items-stretch gap-2">
                                  {/* Color swatch — mirrors the renderer's tile palette
                                       so the advertiser sees the exact same hue order. */}
                                  <div
                                    aria-hidden
                                    className="flex w-9 shrink-0 items-center justify-center text-[11px] font-bold"
                                    style={{ background: TILE_BG[oIdx % 5], color: TILE_FG[oIdx % 5] }}
                                    title={`Tile color #${oIdx + 1}`}
                                  >
                                    {oIdx + 1}
                                  </div>
                                  <input
                                    value={opt.label}
                                    onChange={(e) => {
                                      const v = e.target.value
                                      setOptions(c.pollOptions.map((p, i) => (i === oIdx ? { ...p, label: v } : p)))
                                    }}
                                    placeholder={`Option ${oIdx + 1}`}
                                    maxLength={60}
                                    className={`${INPUT} flex-1`}
                                  />
                                  {c.kind === 'QUIZ' && (
                                    <label
                                      className="flex shrink-0 cursor-pointer items-center gap-1.5 border border-[#E5E5E5] bg-white px-2 text-[10px] font-medium text-[#666] hover:bg-[#FAFAF8]"
                                      title="Mark as the correct answer"
                                    >
                                      <input
                                        type="radio"
                                        name={`cta-correct-${c.uid}`}
                                        checked={!!opt.correct}
                                        onChange={() =>
                                          setOptions(
                                            c.pollOptions.map((p, i) => ({
                                              ...p,
                                              correct: i === oIdx ? true : false,
                                            })),
                                          )
                                        }
                                        className="accent-[#26890c]"
                                      />
                                      Correct
                                    </label>
                                  )}
                                  {c.pollOptions.length > MIN_POLL_OPTIONS && (
                                    <button
                                      type="button"
                                      onClick={() => setOptions(c.pollOptions.filter((_, i) => i !== oIdx))}
                                      className="shrink-0 border border-[#E5E5E5] bg-white px-2 text-[11px] text-[#999] hover:bg-[#FAFAF8] hover:text-[#2D2D2D]"
                                      aria-label={`Remove option ${oIdx + 1}`}
                                    >
                                      −
                                    </button>
                                  )}
                                </div>
                              ))}
                              <div className="flex flex-wrap items-center gap-2">
                                {c.pollOptions.length < MAX_POLL_OPTIONS && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setOptions([
                                        ...c.pollOptions,
                                        { id: newPollOptionId(), label: '' },
                                      ])
                                    }
                                    className="border border-[#E5E5E5] bg-white px-2 py-1 text-[11px] text-[#2D2D2D] hover:bg-[#FAFAF8]"
                                  >
                                    + Add option
                                  </button>
                                )}
                                {c.pollOptions.length >= MAX_POLL_OPTIONS && (
                                  <span className="text-[10px] text-[#888]">
                                    Max {MAX_POLL_OPTIONS} options. The renderer can’t show more cleanly.
                                  </span>
                                )}
                                {missingCorrect && (
                                  <span className="text-[10px] font-medium text-[#B00020]">
                                    Pick the correct option before launching.
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        })()}
                        {c.kind === 'SIGN_MESSAGE' && (
                          <label className="block">
                            <span className={LABEL}>Message to sign</span>
                            <input value={c.signMessage} onChange={(e) => setCtaDrafts((prev) => prev.map((x) => (x.uid === c.uid ? { ...x, signMessage: e.target.value } : x)))} className={INPUT} />
                          </label>
                        )}
                        {c.kind === 'STAKE_GS' && (
                          <label className="block">
                            <span className={LABEL}>Stake amount (G$)</span>
                            <input value={c.minAmount} onChange={(e) => setCtaDrafts((prev) => prev.map((x) => (x.uid === c.uid ? { ...x, minAmount: e.target.value } : x)))} className={INPUT} />
                          </label>
                        )}
                        {c.kind === 'CONTRACT_CALL' && (
                          <div className="border border-dashed border-[#E5E5E5] bg-[#FAFAF8] p-3 space-y-3">
                            <p className="text-[10px] uppercase tracking-[0.12em] text-[#888]">
                              Advanced &mdash; requires a deployed contract
                            </p>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <label className="block">
                                <span className={LABEL}>Contract address</span>
                                <input value={c.targetContract} onChange={(e) => setCtaDrafts((prev) => prev.map((x) => (x.uid === c.uid ? { ...x, targetContract: e.target.value } : x)))} className={`${INPUT} font-mono`} placeholder="0x..." />
                              </label>
                              <label className="block">
                                <span className={LABEL}>Contract event (topic0)</span>
                                <input value={c.eventSig} onChange={(e) => setCtaDrafts((prev) => prev.map((x) => (x.uid === c.uid ? { ...x, eventSig: e.target.value } : x)))} className={`${INPUT} font-mono`} placeholder="0x..." />
                              </label>
                            </div>
                          </div>
                        )}

                        {/* Phase 1: per-card Advanced disclosure. Hides Verifier
                         * and AI_PLAN configuration from the default UI; power
                         * users can still open it. Defaults remain MANUAL. */}
                        <details className="group border-t border-[#E5E5E5] pt-3">
                          <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-[0.1em] text-[#888] hover:text-[#2D2D2D]">
                            Advanced verification
                          </summary>
                          <div className="mt-3 space-y-3">
                            <label className="block">
                              <span className={LABEL}>Verifier</span>
                              <select
                                value={c.verifier}
                                onChange={(e) => setCtaDrafts((prev) => prev.map((x) => (x.uid === c.uid ? { ...x, verifier: e.target.value as CtaVerifier } : x)))}
                                className={SELECT}
                              >
                                {CTA_VERIFIERS.map((v) => (
                                  <option key={v} value={v}>{CTA_VERIFIER_LABEL[v]}</option>
                                ))}
                              </select>
                            </label>
                            {c.verifier === 'AI_PLAN' && (
                              <div className="border border-[#E5E5E5] bg-[#FAFAF8] p-3 space-y-2">
                                <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#666]">AI plan</p>
                                <label className="block">
                                  <span className={LABEL}>Success criteria prompt</span>
                                  <textarea value={c.aiPrompt} onChange={(e) => setCtaDrafts((prev) => prev.map((x) => (x.uid === c.uid ? { ...x, aiPrompt: e.target.value } : x)))} rows={3} className={TEXTAREA} placeholder="e.g. user holds at least 100 of token 0x… and has called approve(...) in the last hour" />
                                </label>
                                <label className="block">
                                  <span className={LABEL}>Allowed contracts (comma-separated)</span>
                                  <input value={c.contractAllowlist} onChange={(e) => setCtaDrafts((prev) => prev.map((x) => (x.uid === c.uid ? { ...x, contractAllowlist: e.target.value } : x)))} className={`${INPUT} font-mono`} placeholder="0xabc..., 0xdef..." />
                                </label>
                              </div>
                            )}
                          </div>
                        </details>

                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <label className="block">
                            <span className={LABEL}>Points</span>
                            <input value={c.rewardPoints} onChange={(e) => setCtaDrafts((prev) => prev.map((x) => (x.uid === c.uid ? { ...x, rewardPoints: e.target.value } : x)))} className={INPUT} />
                          </label>
                          <label className="block">
                            <span className={LABEL}>Reward G$</span>
                            <input
                              type="number"
                              min={0}
                              step={0.001}
                              value={c.rewardGs}
                              onChange={(e) => setCtaDrafts((prev) => prev.map((x) => (x.uid === c.uid ? { ...x, rewardGs: e.target.value } : x)))}
                              className={`${INPUT} ${
                                c.rewardGs && Number(c.rewardGs) > 0 && Number(c.rewardGs) < MIN_CTA_REWARD_GS
                                  ? 'border-[#B00020] focus:border-[#B00020]'
                                  : ''
                              }`}
                              placeholder={`0 or \u2265 ${MIN_CTA_REWARD_GS}`}
                              aria-invalid={c.rewardGs && Number(c.rewardGs) > 0 && Number(c.rewardGs) < MIN_CTA_REWARD_GS ? true : undefined}
                            />
                            {c.rewardGs && Number(c.rewardGs) > 0 && Number(c.rewardGs) < MIN_CTA_REWARD_GS && (
                              <span className="mt-1 block text-[10px] font-medium text-[#B00020]">
                                Min G$ payout is {MIN_CTA_REWARD_GS}. Leave blank for SovPoints-only.
                              </span>
                            )}
                          </label>
                          <label className="block">
                            <span className={LABEL}>Max / wallet</span>
                            <input value={c.maxPerWallet} onChange={(e) => setCtaDrafts((prev) => prev.map((x) => (x.uid === c.uid ? { ...x, maxPerWallet: e.target.value } : x)))} className={INPUT} />
                          </label>
                          <label className="block">
                            <span className={LABEL}>Cooldown (s)</span>
                            <input value={c.cooldownSecs} onChange={(e) => setCtaDrafts((prev) => prev.map((x) => (x.uid === c.uid ? { ...x, cooldownSecs: e.target.value } : x)))} className={INPUT} />
                          </label>
                        </div>
                        {/* Phase 9: reward sanity warnings. Surfaced inline so
                         * advertisers learn why a configuration is risky as
                         * they type, not at submit time. We don't block the
                         * launch; these are nudges, not errors. */}
                        {(() => {
                          const rewardGs = parseFloat(c.rewardGs || '0')
                          const maxPerWallet = parseFloat(c.maxPerWallet || '0')
                          const campaignCpc = parseFloat(formData.cpc || '0')
                          const campaignBudget = parseFloat(formData.budget || '0')
                          const tips: string[] = []
                          if (rewardGs > 0 && campaignCpc > 0 && rewardGs > campaignCpc) {
                            tips.push(
                              `Reward (${rewardGs} G$) is higher than your CPC (${campaignCpc} G$) — you'll lose G$ on every completion.`,
                            )
                          }
                          if (rewardGs > 0 && campaignBudget > 0 && maxPerWallet > 0 && rewardGs * maxPerWallet > campaignBudget) {
                            tips.push(
                              `One wallet alone could earn ${(rewardGs * maxPerWallet).toFixed(2)} G$ — more than your whole budget.`,
                            )
                          }
                          if (rewardGs > 0 && maxPerWallet > 0 && rewardGs * maxPerWallet * 10 > campaignBudget && campaignBudget > 0) {
                            // Soft warning: 10 wallets at the max would exhaust the pot.
                            tips.push(
                              `Heads up: ~${Math.floor(campaignBudget / (rewardGs * maxPerWallet)).toLocaleString()} wallets can fully claim this action before the pool runs out.`,
                            )
                          }
                          if (tips.length === 0) return null
                          return (
                            <ul className="space-y-1 border border-[#E5DAC5] bg-[#FDFAF4] p-2 text-[10.5px] text-[#7a5a2a]">
                              {tips.map((t, i) => (
                                <li key={i} className="flex gap-1.5">
                                  <span aria-hidden="true">&bull;</span>
                                  <span>{t}</span>
                                </li>
                              ))}
                            </ul>
                          )
                        })()}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Section>

            {/* Phase 1: the "custom metadata (JSON)" block was advertiser-
             * facing protocol surface area. Removed from the UI; the form
             * model still carries `metadata: ''` so the existing POST path
             * keeps working (server treats empty as undefined). Power users
             * can edit metadata through the admin tool. */}

            {/* Errors + submit */}
            {(error || submitError) && (
              <div
                role="alert"
                aria-live="assertive"
                className="border border-[#E5E5E5] bg-[#FFF8F7] px-4 py-3 text-[12px] text-[#B42318]"
              >
                <p className="leading-relaxed">{error || submitError}</p>
                {submitErrorAnchor?.sectionId && (
                  <a
                    href={`#${submitErrorAnchor.fieldId || submitErrorAnchor.sectionId}`}
                    onClick={(e) => {
                      // Phase 7: anchor-link jumps to the section; we add a
                      // small click handler so input fields also receive focus,
                      // not just scroll into view.
                      const id = submitErrorAnchor.fieldId || submitErrorAnchor.sectionId
                      if (!id) return
                      const t = document.getElementById(id)
                      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) {
                        e.preventDefault()
                        t.scrollIntoView({ behavior: 'smooth', block: 'center' })
                        window.setTimeout(() => t.focus({ preventScroll: true }), 350)
                      }
                    }}
                    className="mt-1 inline-block text-[11px] font-medium text-[#B42318] underline hover:no-underline"
                  >
                    Jump to that field →
                  </a>
                )}
              </div>
            )}

            <div className="flex flex-col-reverse items-stretch gap-3 border border-[#2D2D2D] bg-white p-4 shadow-[4px_4px_0_0_rgba(45,45,45,0.92)] sm:flex-row sm:items-center sm:justify-between">
              {!address ? (
                // Phase 9: instead of a dead-end "Connect wallet first" line,
                // give the advertiser the connect button right where they are.
                // The Save Draft / Launch buttons stay disabled until address
                // is set; this avoids a "where do I click?" stall.
                <div className="flex flex-col gap-1">
                  <span className="text-[12px] font-medium text-[#2D2D2D]">
                    Connect a wallet to launch
                  </span>
                  <button
                    type="button"
                    onClick={() => openAppKit()}
                    className="self-start border border-[#2D2D2D] bg-[#2D2D2D] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[#1A1A1A]"
                  >
                    Connect wallet
                  </button>
                </div>
              ) : (
                <span className="text-[11px] text-[#666]">
                  Drafts stay editable. Launching locks your budget on-chain.{' '}
                  <span className="hidden sm:inline text-[#999]">
                    (&#8984; or Ctrl + Enter to launch)
                  </span>
                </span>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => handleSubmit('draft')}
                  disabled={isSubmitting || isLoading || !address}
                  className="border border-[#2D2D2D] bg-white px-5 py-2.5 text-[13px] font-semibold uppercase tracking-wide text-[#2D2D2D] transition-all hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-[4px_4px_0_0_rgba(45,45,45,0.92)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-none"
                >
                  {isSubmitting && submitMode === 'draft' ? 'Saving…' : 'Save draft'}
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmit('publish')}
                  disabled={isSubmitting || isLoading || !address}
                  className="border border-[#2D2D2D] bg-[#2D2D2D] px-5 py-2.5 text-[13px] font-semibold uppercase tracking-wide text-white shadow-[4px_4px_0_0_rgba(45,45,45,0.92)] transition-all hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-[6px_6px_0_0_rgba(45,45,45,0.92)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0_0_rgba(45,45,45,0.92)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[4px_4px_0_0_rgba(45,45,45,0.92)]"
                >
                  {isSubmitting && submitMode === 'publish' ? 'Launching…' : 'Launch campaign'}
                </button>
              </div>
            </div>
          </form>

          {/* Sticky preview rail */}
          <aside id="live-preview" className="lg:sticky lg:top-6 lg:self-start">
            <div className="space-y-4">
              {/* TOC */}
              <nav className="border border-[#E5E5E5] bg-white p-3">
                <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-[#888]">On this page</p>
                <ul className="space-y-1 text-[12px]">
                  {[
                    ['details', 'Campaign details'],
                    ['budget', 'Budget'],
                    ['schedule', 'Schedule'],
                    ['ctas', 'Calls to action'],
                  ].map(([id, label]) => (
                    <li key={id}>
                      <a href={`#${id}`} className="block px-2 py-1 text-[#2D2D2D] hover:bg-[#FAFAF8]">
                        {label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>

              {/* Live preview */}
              <div className="border border-[#E5E5E5] bg-white">
                <header className="border-b border-[#E5E5E5] px-3 py-2">
                  <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#888]">Preview</p>
                </header>
                <div className="p-3">
                  <div className="overflow-hidden border border-[#E5E5E5]">
                    {/* POLL / QUIZ overlay sits inside this aspect box; we set
                        position:relative so the SDK panel\u2019s position:absolute
                        anchors to the banner image. Empty state = flat cream
                        background (theme `--background`), no placeholder icon
                        or copy \u2014 the empty box itself is the affordance. Once
                        an image is mounted it covers the whole box. */}
                    <div className="relative aspect-[16/8] bg-[#F5F3F0]">
                      {(() => {
                        if (!bannerPreview) {
                          // Intentionally empty: cream surface only. The
                          // upload affordance lives in the form above, no
                          // need to repeat it inside the preview rail.
                          return null
                        }
                        // Streaming URL \u2192 mirror the SDK's iframe path so the
                        // advertiser sees exactly what viewers will see.
                        const embed = toStreamingEmbed(bannerPreview)
                        if (embed) {
                          return (
                            <iframe
                              src={embed.embedUrl}
                              title={`${embed.provider} preview`}
                              className="h-full w-full"
                              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share"
                              allowFullScreen
                              referrerPolicy="strict-origin-when-cross-origin"
                            />
                          )
                        }
                        if (formData.mediaType === 'video') {
                          return (
                            // eslint-disable-next-line jsx-a11y/media-has-caption
                            <video src={bannerPreview} className="h-full w-full object-cover" muted playsInline />
                          )
                        }
                        return (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={bannerPreview} alt="" className="h-full w-full object-cover" />
                        )
                      })()}
                      {/* First POLL/QUIZ CTA renders as a Kahoot-style tile
                          grid overlaying the bottom of the banner. The
                          banner image is still clickable wherever the
                          gradient is transparent. */}
                      {(() => {
                        const overlayCta = ctaDrafts.find(
                          (c) => c.label.trim() && (c.kind === 'POLL' || c.kind === 'QUIZ'),
                        )
                        if (!overlayCta) return null
                        return (
                          <CtaPreview
                            key={`overlay-${overlayCta.uid}`}
                            kind={overlayCta.kind}
                            label={overlayCta.label}
                            buttonLabel={overlayCta.buttonLabel}
                            description={overlayCta.description}
                            rewardPoints={Number(overlayCta.rewardPoints) || 0}
                            rewardGs={overlayCta.rewardGs ? Number(overlayCta.rewardGs) : null}
                            options={overlayCta.pollOptions
                              .filter((o) => o.label.trim())
                              .map((o) => ({ id: o.id, label: o.label.trim() }))}
                            overlay
                          />
                        )
                      })()}
                    </div>
                    {/* Banner footer (name / description / URL). For POLL or
                        QUIZ overlays the question + reward chip are already
                        painted on top of the banner, so we shrink the footer
                        to title + URL only (description is redundant with
                        the on-banner question). URL is only shown when the
                        advertiser has actually typed one; protocol stripped
                        so it reads like a domain. */}
                    {(() => {
                      const overlayActive = ctaDrafts.some(
                        (c) => c.label.trim() && (c.kind === 'POLL' || c.kind === 'QUIZ'),
                      )
                      // Display form: drop the protocol + trailing slash so
                      // \"https://example.com/\" reads as \"example.com\". Falls
                      // back to '' when empty, which we then hide entirely.
                      const prettyUrl = (formData.targetUrl || '')
                        .trim()
                        .replace(/^https?:\/\//i, '')
                        .replace(/\/+$/, '')
                      const trimmedName = (formData.name || '').trim()
                      if (overlayActive) {
                        // Nothing to show? Skip the footer entirely so the
                        // preview card ends at the banner.
                        if (!trimmedName && !prettyUrl) return null
                        return (
                          <div className="flex items-center justify-between gap-3 px-3 py-2">
                            {trimmedName && (
                              <p className="truncate text-[12px] font-semibold text-[#2D2D2D]">
                                {trimmedName}
                              </p>
                            )}
                            {prettyUrl && (
                              <p className="truncate text-[11px] text-[#888]">{prettyUrl}</p>
                            )}
                          </div>
                        )
                      }
                      return (
                        <div className="p-3">
                          <p className="truncate text-[13px] font-semibold text-[#2D2D2D]">
                            {trimmedName || 'Campaign name'}
                          </p>
                          <p className="line-clamp-2 text-[12px] text-[#666]">
                            {formData.description || 'Description shows here.'}
                          </p>
                          {prettyUrl && (
                            <p className="mt-2 truncate text-[11px] text-[#888]">{prettyUrl}</p>
                          )}
                        </div>
                      )
                    })()}
                  </div>

                  {/* CTA chips for non-overlay kinds (VISIT_URL / SIGN_MESSAGE
                      / unsupported). POLL / QUIZ are rendered over the banner
                      above, so we exclude them here to avoid duplication. */}
                  {ctaDrafts.filter((c) => c.label.trim() && c.kind !== 'POLL' && c.kind !== 'QUIZ').length > 0 && (
                    <div className="mt-3 space-y-2">
                      {ctaDrafts
                        .filter((c) => c.label.trim() && c.kind !== 'POLL' && c.kind !== 'QUIZ')
                        .map((c) => (
                          <CtaPreview
                            key={c.uid}
                            kind={c.kind}
                            label={c.label}
                            buttonLabel={c.buttonLabel}
                            description={c.description}
                            rewardPoints={Number(c.rewardPoints) || 0}
                            rewardGs={c.rewardGs ? Number(c.rewardGs) : null}
                          />
                        ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Live numbers — separate card so the preview above stays focused
                  on what the viewer sees (banner + CTAs), and the spend numbers
                  get their own block. */}
              <div className="border border-[#E5E5E5] bg-white">
                <header className="border-b border-[#E5E5E5] px-3 py-2">
                  <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#888]">Spend</p>
                </header>
                <div className="grid grid-cols-2 text-center">
                  <div className="border-r border-[#E5E5E5] py-3">
                    <p className="text-[14px] font-semibold tabular-nums text-[#2D2D2D]">
                      {formData.budget ? `${formData.budget}` : '—'}
                    </p>
                    <p className="mt-0.5 text-[10px] text-[#888]">{selectedTokenInfo.symbol} budget</p>
                  </div>
                  <div className="py-3">
                    <p className="text-[14px] font-semibold tabular-nums text-[#2D2D2D]">
                      {estimate ? estimate.maxImpressions.toLocaleString() : '—'}
                    </p>
                    <p className="mt-0.5 text-[10px] text-[#888]">max impressions</p>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Phase 5: mobile-only "Preview" FAB. On lg+ the right rail is always
       * visible (sticky), but on phones the preview lives below the form,
       * out of sight. This floating button anchors users back to #live-preview
       * so the live ad is never more than one tap away. */}
      <a
        href="#live-preview"
        className="fixed bottom-4 right-4 z-30 inline-flex items-center gap-1.5 border border-[#2D2D2D] bg-white px-4 py-2 text-[12px] font-medium text-[#2D2D2D] shadow-[3px_3px_0_0_rgba(45,45,45,0.92)] hover:bg-[#FAFAF8] lg:hidden"
        aria-label="Jump to live ad preview"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        Preview
      </a>
    </div>
  )
}
