'use client'

import { useCallback, useEffect, useState } from 'react'
import type { CampaignTask } from '@/components/advertiser/types'

interface CreateTaskInput {
  kind: string
  label: string
  description?: string
  verifier: string
  config?: Record<string, unknown>
  rewardPoints?: number
  rewardGs?: number
  budgetGs?: number
  maxPerWallet?: number
  cooldownSecs?: number
  startDate?: string
  endDate?: string
  aiPrompt?: string
  contractAllowlist?: string[]
  aiModel?: string
}

/**
 * CRUD-ish hook for CTAs (tasks) attached to a single campaign.
 *
 * All mutations require `wallet` because the backend (`/api/tasks/create`,
 * `/api/tasks/test`) does owner-auth by comparing the wallet to the campaign
 * advertiser's wallet.
 */
export function useCampaignTasks(campaignId: string | null, wallet: string | undefined) {
  const [tasks, setTasks] = useState<CampaignTask[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (id: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaigns/detail?id=${encodeURIComponent(id)}&include=tasks`)
      if (!res.ok) throw new Error('Failed to load CTAs')
      const data = await res.json()
      setTasks((data.tasks ?? []) as CampaignTask[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load CTAs')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (campaignId) void load(campaignId)
    else setTasks([])
  }, [campaignId, load])

  /** Creates a CTA via /api/tasks/create. Returns the new task or throws. */
  const createTask = useCallback(
    async (input: CreateTaskInput): Promise<CampaignTask> => {
      if (!campaignId) throw new Error('No campaign selected')
      if (!wallet) throw new Error('Connect your wallet')
      const res = await fetch('/api/tasks/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, wallet, ...input }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to create CTA')
      // refresh local list
      await load(campaignId)
      return data.task as CampaignTask
    },
    [campaignId, wallet, load]
  )

  /** Dry-run a CTA verification via /api/tasks/test. */
  const testTask = useCallback(
    async (taskId: string, sample: Record<string, unknown>) => {
      if (!wallet) throw new Error('Connect your wallet')
      const res = await fetch('/api/tasks/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, wallet, sample }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Test failed')
      return data
    },
    [wallet]
  )

  return {
    tasks,
    isLoading,
    error,
    refresh: () => (campaignId ? load(campaignId) : Promise.resolve()),
    createTask,
    testTask,
  }
}
