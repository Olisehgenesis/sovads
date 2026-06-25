/**
 * GET /api/serve — type-aware unit serving endpoint.
 *
 * Returns either a BANNER (legacy Campaign) or a standalone CampaignTask
 * (POLL / FEEDBACK / SURVEY) depending on the slot's `kind` preference.
 *
 * Query:
 *   siteId      (required)
 *   kind        comma-separated allow-list: BANNER,POLL,FEEDBACK,SURVEY
 *               (default: BANNER)
 *   location    target geography
 *   placement   slot identifier from publisher config
 *   size        e.g. 300x250
 *   wallet      optional viewer wallet for tracking-token binding
 *   attached    `1`/`true` to include attached CTA tasks on BANNER responses
 *               and to keep serving banners whose token budget is exhausted
 *               (in that case `bannerClickActive=false`; viewers can still
 *               earn via the attached CTAs through the points fallback).
 *
 * Response (one of):
 *   { kind: 'BANNER',   ad:   {...renderer-safe campaign payload, trackingToken},
 *                       bannerClickActive?: boolean,
 *                       attachedTasks?: Array<PublicAttachedTask> }
 *   { kind: 'POLL',     task: {id, label, options, surface, display, rewardPoints, ...} }
 *   { kind: 'FEEDBACK', task: {id, label, feedback, surface, display, rewardPoints, ...} }
 *   { kind: 'SURVEY',   task: {id, label, totalSteps, questions, surface, display, rewardPoints, ...} }
 *   { kind: 'NONE'    }                       // nothing eligible
 *
 * Selection: uniform random across the eligible union of (banner-campaign, task)
 * candidates. Pricing/auction layer lives in Phase 11.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createTrackingToken } from '@/lib/tracking-token'
import {
  getCtaSpendByCampaignIds,
  hasRemainingBudget,
} from '@/lib/campaign-spend'
import type { TaskConfig, TaskKind } from '@/lib/tasks'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

const TASK_KINDS = ['POLL', 'FEEDBACK', 'SURVEY'] as const
type ServeTaskKind = (typeof TASK_KINDS)[number]
type ServeKind = 'BANNER' | ServeTaskKind

// Kinds we are willing to attach next to a banner. Keep this conservative —
// anything that needs more screen real-estate (FEEDBACK, SURVEY) or special
// host-side flows (STAKE_GS, CONTRACT_CALL, QUIZ) stays on the standalone path.
const ATTACHED_TASK_KINDS = ['VISIT_URL', 'SIGN_MESSAGE', 'POLL'] as const
type AttachedTaskKind = (typeof ATTACHED_TASK_KINDS)[number]
const MAX_ATTACHED_TASKS = 2

function parseAttachedFlag(raw: string | null): boolean {
  if (!raw) return false
  const v = raw.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

function parseKinds(raw: string | null): Set<ServeKind> {
  if (!raw) return new Set<ServeKind>(['BANNER'])
  const allowed = new Set<ServeKind>(['BANNER', ...TASK_KINDS])
  const out = new Set<ServeKind>()
  for (const part of raw.split(',')) {
    const k = part.trim().toUpperCase() as ServeKind
    if (allowed.has(k)) out.add(k)
  }
  if (out.size === 0) out.add('BANNER')
  return out
}

function normalizeHttpUrl(value: string): string {
  const trimmed = (value || '').trim()
  if (!trimmed) return trimmed
  if (trimmed.includes('://')) return trimmed
  if (trimmed.startsWith('localhost') || trimmed.startsWith('127.0.0.1')) {
    return `http://${trimmed}`
  }
  return `https://${trimmed}`
}

function inferMediaTypeFromUrl(url: string): 'image' | 'video' {
  const v = (url || '').toLowerCase()
  const videoExts = ['.mp4', '.webm', '.ogg', '.ogv', '.mov', '.m3u8']
  return videoExts.some((ext) => v.includes(ext)) ? 'video' : 'image'
}

// Strip server-only fields (verifier internals, AI plan, etc.) from a task before
// shipping it to the SDK. Returns a renderer-safe shape per kind.
function publicTaskShape(task: {
  id: string
  campaignId: string
  kind: string
  label: string
  description: string | null
  surface: string
  display: unknown
  rewardPoints: number
  rewardGs: number | null
  config: unknown
}) {
  const cfg = (task.config ?? {}) as TaskConfig
  const base = {
    id: task.id,
    campaignId: task.campaignId,
    kind: task.kind as TaskKind,
    label: task.label,
    description: task.description ?? null,
    surface: task.surface,
    display: task.display ?? null,
    rewardPoints: task.rewardPoints,
    rewardGs: task.rewardGs ?? 0,
  }
  if (task.kind === 'POLL') {
    return { ...base, options: cfg.options ?? [] }
  }
  if (task.kind === 'FEEDBACK') {
    return { ...base, feedback: cfg.feedback ?? { mode: 'rating_and_text' } }
  }
  if (task.kind === 'SURVEY') {
    const questions = cfg.questions ?? []
    return { ...base, totalSteps: questions.length, questions }
  }
  return base
}

// Renderer-safe shape for tasks that piggy-back onto a Banner (`surface='attached'`).
// Only ATTACHED_TASK_KINDS are returned; anything else is filtered out upstream.
function publicAttachedTaskShape(task: {
  id: string
  campaignId: string
  kind: string
  label: string
  description: string | null
  rewardPoints: number
  rewardGs: number | null
  config: unknown
}) {
  const cfg = (task.config ?? {}) as TaskConfig
  const base = {
    id: task.id,
    campaignId: task.campaignId,
    kind: task.kind as AttachedTaskKind,
    label: task.label,
    buttonLabel: typeof cfg.buttonLabel === 'string' && cfg.buttonLabel.trim() ? cfg.buttonLabel.trim() : null,
    description: task.description ?? null,
    rewardPoints: task.rewardPoints,
    rewardGs: task.rewardGs ?? 0,
  }
  if (task.kind === 'POLL') {
    return { ...base, options: cfg.options ?? [] }
  }
  if (task.kind === 'VISIT_URL') {
    return {
      ...base,
      url: typeof cfg.url === 'string' ? normalizeHttpUrl(cfg.url) : null,
      minDwellMs: typeof cfg.minDwellMs === 'number' && cfg.minDwellMs > 0 ? cfg.minDwellMs : 3000,
    }
  }
  if (task.kind === 'SIGN_MESSAGE') {
    return { ...base, signMessage: typeof cfg.signMessage === 'string' ? cfg.signMessage : null }
  }
  return base
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const siteId = searchParams.get('siteId')
    const kinds = parseKinds(searchParams.get('kind'))
    const location = searchParams.get('location')?.toLowerCase()
    const placement = searchParams.get('placement')?.trim().toLowerCase()
    const size = searchParams.get('size')?.trim()
    const wallet = searchParams.get('wallet')?.trim().toLowerCase()
    const attached = parseAttachedFlag(searchParams.get('attached'))

    if (!siteId) {
      return NextResponse.json({ error: 'siteId required' }, { status: 400, headers: corsHeaders })
    }

    // Resolve publisher / verification status (same logic as /api/ads)
    let publisherSite = null
    let publisher = null
    const referer = request.headers.get('referer')
    const isLocalhost = referer && (referer.includes('localhost') || referer.includes('127.0.0.1'))
    let isUnverifiedSite = siteId.startsWith('temp_') || !!isLocalhost

    if (!isUnverifiedSite) {
      publisherSite = await prisma.publisherSite.findFirst({ where: { siteId } })
      if (publisherSite) {
        publisher = await prisma.publisher.findFirst({ where: { id: publisherSite.publisherId } })
      }
    }
    if (!publisher) {
      publisher = await prisma.publisher.findFirst({
        where: { OR: [{ id: siteId }, { id: siteId.replace('site_', '') }, { domain: siteId }] },
      })
    }
    if (publisher && !publisher.verified) isUnverifiedSite = true
    if (!publisher && !isUnverifiedSite) isUnverifiedSite = true

    type Candidate =
      | {
          kind: 'BANNER'
          campaign: Awaited<ReturnType<typeof prisma.campaign.findMany>>[number]
          // When `attached=1` we still serve banners whose token budget is
          // exhausted, but flag them so the SDK suppresses click-tracking.
          bannerClickActive: boolean
        }
      | {
          kind: ServeTaskKind
          task: Awaited<ReturnType<typeof prisma.campaignTask.findMany>>[number]
        }

    const candidates: Candidate[] = []
    const now = new Date()

    // ---- BANNER candidates ----
    if (kinds.has('BANNER')) {
      const rawCampaigns = await prisma.campaign.findMany({
        where: { active: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
      const ctaSpendByCampaign = await getCtaSpendByCampaignIds(rawCampaigns.map((c) => c.id))
      for (const c of rawCampaigns) {
        const ctaSpent = ctaSpendByCampaign.get(c.id) ?? 0
        const bannerClickActive = hasRemainingBudget(c.budget, c.spent + ctaSpent)
        // Out-of-budget banners are normally skipped, but when the caller asked
        // for attached CTAs we still serve them — they earn via the points
        // fallback in /api/tasks/complete. Click-through is suppressed via
        // `bannerClickActive=false`.
        if (!bannerClickActive && !attached) continue
        if (location && c.targetLocations?.length) {
          const ok = c.targetLocations.some(
            (loc) => typeof loc === 'string' && loc.toLowerCase() === location
          )
          if (!ok) continue
        }
        candidates.push({ kind: 'BANNER', campaign: c, bannerClickActive })
      }
    }

    // ---- Standalone task candidates ----
    const wantedTaskKinds = (Array.from(kinds).filter((k) => k !== 'BANNER')) as ServeTaskKind[]
    if (wantedTaskKinds.length > 0) {
      const tasks = await prisma.campaignTask.findMany({
        where: {
          active: true,
          surface: 'standalone',
          kind: { in: wantedTaskKinds },
          OR: [{ startDate: null }, { startDate: { lte: now } }],
          AND: [{ OR: [{ endDate: null }, { endDate: { gte: now } }] }],
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })

      // Skip tasks whose parent campaign is inactive or out of budget
      const parentIds = Array.from(new Set(tasks.map((t) => t.campaignId)))
      if (parentIds.length > 0) {
        const parents = await prisma.campaign.findMany({
          where: { id: { in: parentIds } },
        })
        const ctaSpendByCampaign = await getCtaSpendByCampaignIds(parentIds)
        const parentById = new Map(parents.map((p) => [p.id, p]))
        for (const t of tasks) {
          const parent = parentById.get(t.campaignId)
          if (!parent || !parent.active) continue
          const ctaSpent = ctaSpendByCampaign.get(parent.id) ?? 0
          if (!hasRemainingBudget(parent.budget, parent.spent + ctaSpent)) continue
          candidates.push({ kind: t.kind as ServeTaskKind, task: t })
        }
      }
    }

    if (candidates.length === 0) {
      return NextResponse.json(
        { kind: 'NONE', siteId, isUnverified: isUnverifiedSite },
        { headers: corsHeaders }
      )
    }

    const chosen = candidates[Math.floor(Math.random() * candidates.length)]

    if (chosen.kind === 'BANNER') {
      const c = chosen.campaign
      const ad = {
        id: `ad_${c.id}`,
        campaignId: c.id,
        name: c.name,
        description: c.description ?? '',
        bannerUrl: normalizeHttpUrl(c.bannerUrl),
        targetUrl: normalizeHttpUrl(c.targetUrl),
        cpc: c.cpc.toString(),
        tags: c.tags ?? [],
        targetLocations: c.targetLocations ?? [],
        metadata: c.metadata ?? null,
        startDate: c.startDate ?? null,
        endDate: c.endDate ?? null,
        mediaType: c.mediaType ?? inferMediaTypeFromUrl(c.bannerUrl),
        placement: placement || undefined,
        size: size || undefined,
        isUnverified: isUnverifiedSite,
        trackingToken: createTrackingToken({
          adId: `ad_${c.id}`,
          campaignId: c.id,
          siteId,
          exp: Date.now() + 15 * 60 * 1000,
          placement: placement || undefined,
          size: size || undefined,
          walletAddress: wallet || undefined,
          isUnverified: isUnverifiedSite,
        }),
      }

      // Fetch up to MAX_ATTACHED_TASKS CTA tasks for this campaign (only when
      // the caller opted in with `?attached=1`). Filtered to safe kinds.
      let attachedTasks: ReturnType<typeof publicAttachedTaskShape>[] | undefined
      if (attached) {
        const rawAttached = await prisma.campaignTask.findMany({
          where: {
            campaignId: c.id,
            active: true,
            surface: 'attached',
            kind: { in: ATTACHED_TASK_KINDS as unknown as string[] },
            OR: [{ startDate: null }, { startDate: { lte: now } }],
            AND: [{ OR: [{ endDate: null }, { endDate: { gte: now } }] }],
          },
          orderBy: { createdAt: 'asc' },
          take: MAX_ATTACHED_TASKS,
        })
        attachedTasks = rawAttached.map(publicAttachedTaskShape)
      }

      return NextResponse.json(
        {
          kind: 'BANNER',
          siteId,
          isUnverified: isUnverifiedSite,
          ad,
          ...(attached
            ? {
                bannerClickActive: chosen.bannerClickActive,
                attachedTasks: attachedTasks ?? [],
              }
            : {}),
        },
        { headers: corsHeaders }
      )
    }

    // Standalone task
    const t = chosen.task
    return NextResponse.json(
      {
        kind: chosen.kind,
        siteId,
        isUnverified: isUnverifiedSite,
        task: publicTaskShape(t),
      },
      { headers: corsHeaders }
    )
  } catch (e) {
    console.error('[serve] error', e)
    const msg = e instanceof Error ? e.message : 'unknown error'
    return NextResponse.json(
      { error: 'internal_error', message: process.env.NODE_ENV === 'development' ? msg : undefined },
      { status: 500, headers: corsHeaders }
    )
  }
}
