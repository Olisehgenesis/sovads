'use client'

import { useState } from 'react'
import TestAdRenderer, { type TestAdData, type TestTask } from '@/components/ads/TestAdRenderer'
import { AD_SIZE_CATALOG, type AdPlacement, type AdSizeOption } from './types'

interface Props {
  ad: TestAdData
  tasks?: TestTask[]
  value?: string
  onChange?: (option: AdSizeOption) => void
}

/**
 * Browseable catalog of ad placements + sizes with live mock previews.
 */
export default function AdTypePicker({ ad, tasks = [], value, onChange }: Props) {
  const [filter, setFilter] = useState<AdPlacement | 'all'>('all')
  const items = filter === 'all' ? AD_SIZE_CATALOG : AD_SIZE_CATALOG.filter((o) => o.placement === filter)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1">
        {(['all', 'banner', 'sidebar', 'popup'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={[
              'border px-2.5 py-1 text-[12px] font-medium capitalize transition-colors',
              filter === f
                ? 'border-[#2D2D2D] bg-[#2D2D2D] text-white'
                : 'border-[#E5E5E5] bg-white text-[#444] hover:bg-[#F4F4F2]',
            ].join(' ')}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((opt) => {
          const selected = value === opt.id
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange?.(opt)}
              className={[
                'flex flex-col gap-2 border bg-white p-3 text-left transition-colors',
                selected ? 'border-[#2D2D2D] ring-1 ring-[#2D2D2D]' : 'border-[#E5E5E5] hover:border-[#999]',
              ].join(' ')}
            >
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-semibold text-[#2D2D2D]">{opt.label}</p>
                <span className="bg-[#F4F4F2] px-1.5 py-0.5 text-[11px] tabular-nums text-[#555]">
                  {opt.size}
                </span>
              </div>
              <div className="flex min-h-[100px] items-center justify-center overflow-hidden border border-[#EFEFEF] bg-[#FAFAF8] p-2">
                <div className="origin-center scale-[0.55] sm:scale-[0.65]">
                  <TestAdRenderer ad={ad} tasks={tasks} placement={opt.placement} size={opt.size} />
                </div>
              </div>
              <p className="text-[11px] text-[#666]">{opt.blurb}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
