'use client'

import { useMemo, useState } from 'react'
import {
  CTA_KINDS,
  CTA_VERIFIERS,
  DEFAULT_VERIFIER,
  type CtaKind,
  type CtaVerifier,
} from './types'
import { Alert, Button, Field, Select, TextArea, TextInput } from './ui'

export interface CtaFormPayload {
  kind: CtaKind
  label: string
  description?: string
  verifier: CtaVerifier
  rewardPoints?: number
  rewardGs?: number
  maxPerWallet?: number
  cooldownSecs?: number
  config?: Record<string, unknown>
  aiPrompt?: string
}

interface Props {
  initial?: Partial<CtaFormPayload>
  submitLabel?: string
  isSubmitting?: boolean
  onSubmit: (payload: CtaFormPayload) => void | Promise<void>
  onCancel?: () => void
}

const KIND_DESCRIPTIONS: Record<CtaKind, string> = {
  VISIT_URL: 'Visit a URL and dwell for at least N ms.',
  SOCIAL_FOLLOW: 'Follow a social handle (verified off-chain).',
  QUIZ: 'Answer a question with the exact expected text.',
  STAKE_GS: 'Stake G$ above a minimum amount (on-chain).',
  CONTRACT_CALL: 'Trigger a specific contract event.',
  SIGN_MESSAGE: 'Sign a predefined message with the connected wallet.',
}

const num = (v: string) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

export default function CtaForm({
  initial,
  submitLabel = 'Create CTA',
  isSubmitting = false,
  onSubmit,
  onCancel,
}: Props) {
  const initialKind = (initial?.kind as CtaKind) ?? 'VISIT_URL'
  const [kind, setKind] = useState<CtaKind>(initialKind)
  const [verifier, setVerifier] = useState<CtaVerifier>(
    (initial?.verifier as CtaVerifier) ?? DEFAULT_VERIFIER[initialKind]
  )
  const [label, setLabel] = useState(initial?.label ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [rewardPoints, setRewardPoints] = useState(String(initial?.rewardPoints ?? ''))
  const [rewardGs, setRewardGs] = useState(String(initial?.rewardGs ?? ''))
  const [maxPerWallet, setMaxPerWallet] = useState(String(initial?.maxPerWallet ?? '1'))
  const [cooldownSecs, setCooldownSecs] = useState(String(initial?.cooldownSecs ?? ''))

  const cfg = (initial?.config ?? {}) as Record<string, unknown>
  const [url, setUrl] = useState(String(cfg.url ?? ''))
  const [minDwellMs, setMinDwellMs] = useState(String(cfg.minDwellMs ?? '3000'))
  const [expectedAnswer, setExpectedAnswer] = useState(String(cfg.expectedAnswer ?? ''))
  const [signMessage, setSignMessage] = useState(String(cfg.message ?? ''))
  const [minAmount, setMinAmount] = useState(String(cfg.minAmount ?? ''))
  const [targetContract, setTargetContract] = useState(String(cfg.targetContract ?? ''))
  const [eventSig, setEventSig] = useState(String(cfg.eventSig ?? ''))
  const [aiPrompt, setAiPrompt] = useState(initial?.aiPrompt ?? '')

  const [error, setError] = useState<string | null>(null)

  const onKindChange = (k: CtaKind) => {
    setKind(k)
    setVerifier(DEFAULT_VERIFIER[k])
  }

  const isAiPlan = verifier === 'AI_PLAN'

  const buildConfig = useMemo(() => (): Record<string, unknown> => {
    switch (kind) {
      case 'VISIT_URL': return { url, minDwellMs: num(minDwellMs) ?? 3000 }
      case 'SOCIAL_FOLLOW': return { url }
      case 'QUIZ': return { expectedAnswer }
      case 'SIGN_MESSAGE': return { message: signMessage }
      case 'STAKE_GS': return { minAmount: num(minAmount) ?? 0 }
      case 'CONTRACT_CALL': return { targetContract, eventSig }
      default: return {}
    }
  }, [kind, url, minDwellMs, expectedAnswer, signMessage, minAmount, targetContract, eventSig])

  const handleSubmit = async () => {
    setError(null)
    if (!label.trim()) return setError('Label is required.')
    if (isAiPlan && !aiPrompt.trim()) return setError('AI_PLAN verifier requires a prompt.')

    const payload: CtaFormPayload = {
      kind,
      label: label.trim(),
      description: description.trim() || undefined,
      verifier,
      rewardPoints: num(rewardPoints),
      rewardGs: num(rewardGs),
      maxPerWallet: num(maxPerWallet),
      cooldownSecs: num(cooldownSecs),
      config: buildConfig(),
      aiPrompt: isAiPlan ? aiPrompt.trim() : undefined,
    }

    try {
      await onSubmit(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed')
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Kind" required hint={KIND_DESCRIPTIONS[kind]}>
          <Select value={kind} onChange={(e) => onKindChange(e.target.value as CtaKind)}>
            {CTA_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </Select>
        </Field>
        <Field label="Verifier" required hint={`Default for ${kind}: ${DEFAULT_VERIFIER[kind]}`}>
          <Select value={verifier} onChange={(e) => setVerifier(e.target.value as CtaVerifier)}>
            {CTA_VERIFIERS.map((v) => <option key={v} value={v}>{v}</option>)}
          </Select>
        </Field>
      </div>

      <Field label="Label" required>
        <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Visit our launch page" />
      </Field>

      <Field label="Description">
        <TextArea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional helper text shown alongside the CTA."
        />
      </Field>

      <fieldset className="space-y-3 border border-[#E5E5E5] bg-[#FAFAF8] p-3">
        <legend className="px-1 text-[11px] font-semibold text-[#666]">Verification config</legend>
        {(kind === 'VISIT_URL' || kind === 'SOCIAL_FOLLOW') && (
          <>
            <TextInput
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={kind === 'VISIT_URL' ? 'https://example.com/landing' : 'https://x.com/handle'}
            />
            {kind === 'VISIT_URL' && (
              <TextInput
                type="number"
                value={minDwellMs}
                onChange={(e) => setMinDwellMs(e.target.value)}
                placeholder="Min dwell (ms)"
              />
            )}
          </>
        )}
        {kind === 'QUIZ' && (
          <TextInput value={expectedAnswer} onChange={(e) => setExpectedAnswer(e.target.value)} placeholder="Expected answer (exact match)" />
        )}
        {kind === 'SIGN_MESSAGE' && (
          <TextArea rows={2} value={signMessage} onChange={(e) => setSignMessage(e.target.value)} placeholder="Message the user must sign exactly" />
        )}
        {kind === 'STAKE_GS' && (
          <TextInput type="number" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} placeholder="Minimum stake (G$)" />
        )}
        {kind === 'CONTRACT_CALL' && (
          <>
            <TextInput value={targetContract} onChange={(e) => setTargetContract(e.target.value)} placeholder="Target contract 0x…" />
            <TextInput value={eventSig} onChange={(e) => setEventSig(e.target.value)} placeholder="Event signature e.g. Transfer(address,address,uint256)" />
          </>
        )}
        {isAiPlan && (
          <TextArea
            rows={3}
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="Describe what a successful completion looks like. The LLM will draft a verification plan."
          />
        )}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Reward points">
          <TextInput type="number" value={rewardPoints} onChange={(e) => setRewardPoints(e.target.value)} placeholder="10" />
        </Field>
        <Field label="Reward G$">
          <TextInput type="number" value={rewardGs} onChange={(e) => setRewardGs(e.target.value)} placeholder="0.5" />
        </Field>
        <Field label="Max per wallet">
          <TextInput type="number" value={maxPerWallet} onChange={(e) => setMaxPerWallet(e.target.value)} placeholder="1" />
        </Field>
        <Field label="Cooldown (s)">
          <TextInput type="number" value={cooldownSecs} onChange={(e) => setCooldownSecs(e.target.value)} placeholder="0" />
        </Field>
      </div>

      {error && <Alert tone="error" onDismiss={() => setError(null)}>{error}</Alert>}

      <div className="flex flex-wrap gap-2">
        <Button intent="primary" disabled={isSubmitting} onClick={handleSubmit}>
          {isSubmitting ? 'Saving…' : submitLabel}
        </Button>
        {onCancel && (
          <Button intent="ghost" disabled={isSubmitting} onClick={onCancel}>Cancel</Button>
        )}
      </div>
    </div>
  )
}
