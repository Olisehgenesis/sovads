'use client'

import { useState } from 'react'
import { getTokenSymbol } from '@/lib/tokens'
import AdvertiserIcon from './AdvertiserIcon'
import { StatusBadge, Button, formatNumber, formatPct, getCampaignStatusDisplay } from './ui'
import type { Campaign } from './types'

type Action = 'preview' | 'stats' | 'fund' | 'pause' | 'edit' | 'extend' | 'publish' | 'discard'

interface Props {
  campaigns: Campaign[]
  onAction: (action: Action, campaign: Campaign) => void
  isProcessing?: boolean
}

/**
 * Dense, scannable table view. The default for >5 campaigns.
 *
 * Row actions live behind a `⋯` menu so the row stays readable; only the
 * single most-relevant action (Fund vs Resume) surfaces as a button.
 */
export default function CampaignTable({ campaigns, onAction, isProcessing }: Props) {
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  return (
    <div className="overflow-x-auto border border-[#E5E5E5]">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-[#E5E5E5] bg-[#FAFAF8] text-[11px] font-semibold uppercase tracking-wide text-[#666666]">
            <Th className="w-[36%]">Campaign</Th>
            <Th>Status</Th>
            <Th align="right">Budget</Th>
            <Th align="right">Spent</Th>
            <Th align="right">Used</Th>
            <Th align="right">CPC</Th>
            <Th align="right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c, i) => {
            const tokenSymbol = getTokenSymbol(c.tokenAddress)
            const usedPct = c.budget > 0 ? Math.min(100, (c.spent / c.budget) * 100) : 0
            const budgetExhausted = c.budget > 0 && c.spent >= c.budget
            const { label: statusLabel, tone } = getCampaignStatusDisplay(c)
            const isDraft = c.status === 'draft'
            const canFund = c.onChainId != null
            const canPause = c.onChainId != null
            return (
              <tr
                key={c.id}
                className={`border-b border-[#EFEFEF] last:border-b-0 ${i % 2 === 1 ? 'bg-[#FCFCFB]' : 'bg-white'} hover:bg-[#F4F4F2]`}
              >
                <Td>
                  <button
                    type="button"
                    onClick={() => onAction('preview', c)}
                    className="flex items-center gap-3 text-left"
                  >
                    <div className="h-9 w-9 flex-shrink-0 overflow-hidden border border-[#E5E5E5] bg-[#EFEDE7]">
                      {c.bannerUrl ? (
                        c.mediaType === 'video' ? (
                          // eslint-disable-next-line jsx-a11y/media-has-caption
                          <video src={c.bannerUrl} className="h-full w-full object-cover" muted playsInline />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.bannerUrl} alt="" className="h-full w-full object-cover" />
                        )
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[#555]">
                          <AdvertiserIcon name="campaign" className="h-4 w-4" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[#2D2D2D]">{c.name}</p>
                      <p className="truncate text-[11px] text-[#888]">
                        {c.onChainId != null ? `#${c.onChainId} · ` : ''}
                        {c.mediaType === 'video' ? 'Video' : 'Image'}
                      </p>
                    </div>
                  </button>
                </Td>
                <Td>
                  <div className="flex flex-wrap items-center gap-1">
                    <StatusBadge tone={tone}>{statusLabel}</StatusBadge>
                    {budgetExhausted && (
                      <StatusBadge tone="warning">Out of budget</StatusBadge>
                    )}
                  </div>
                </Td>
                <Td align="right" className="tabular-nums text-[#2D2D2D]">
                  {formatNumber(c.budget)} <span className="text-[#999]">{tokenSymbol}</span>
                </Td>
                <Td align="right" className="tabular-nums text-[#2D2D2D]">
                  <span
                    title={
                      c.ctaSpent != null || c.clickSpent != null
                        ? `Clicks: ${formatNumber(c.clickSpent ?? 0)} ${tokenSymbol}\nCTAs:   ${formatNumber(c.ctaSpent ?? 0)} ${tokenSymbol}`
                        : undefined
                    }
                  >
                    {formatNumber(c.spent)}
                    {c.ctaSpent != null && c.ctaSpent > 0 && (
                      <span className="ml-1 text-[10px] font-normal text-[#888]">
                        ({formatNumber(c.clickSpent ?? 0)}+{formatNumber(c.ctaSpent)})
                      </span>
                    )}
                  </span>
                </Td>
                <Td align="right">
                  <div className="inline-flex items-center gap-2">
                    <span className="tabular-nums text-[#666]">{formatPct(usedPct)}</span>
                    <span className="h-1.5 w-14 bg-[#EFEFEF]">
                      <span className="block h-full bg-[#2D2D2D]" style={{ width: `${usedPct}%` }} />
                    </span>
                  </div>
                </Td>
                <Td align="right" className="tabular-nums text-[#666]">
                  {c.cpc}
                </Td>
                <Td align="right">
                  <div className="relative inline-flex items-center gap-1">
                    {/* Drafts have nothing to fund or report on yet, so we
                     * swap the inline buttons for a Preview + Publish pair.
                     * Edit / Discard sit in the ⋯ menu so the row stays
                     * scannable. */}
                    {isDraft ? (
                      <>
                        <Button size="sm" intent="ghost" onClick={() => onAction('preview', c)}>
                          Preview
                        </Button>
                        <Button size="sm" intent="primary" onClick={() => onAction('publish', c)}>
                          Publish
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" intent="ghost" onClick={() => onAction('stats', c)}>
                          Stats
                        </Button>
                        {canFund ? (
                          <Button size="sm" intent="primary" onClick={() => onAction('fund', c)}>
                            Fund
                          </Button>
                        ) : null}
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => setOpenMenu(openMenu === c.id ? null : c.id)}
                      className="inline-flex h-7 w-7 items-center justify-center border border-[#E5E5E5] text-[#666] hover:bg-[#F4F4F2]"
                      aria-label="More actions"
                    >
                      ⋯
                    </button>
                    {openMenu === c.id && (
                      <>
                        <button
                          type="button"
                          aria-hidden
                          className="fixed inset-0 z-10 cursor-default"
                          onClick={() => setOpenMenu(null)}
                        />
                        <div className="absolute right-0 top-full z-20 mt-1 min-w-[170px] border border-[#2D2D2D] bg-white shadow-[2px_2px_0_0_#2D2D2D]">
                          {isDraft ? (
                            <>
                              <MenuItem onClick={() => { setOpenMenu(null); onAction('edit', c) }}>Edit details</MenuItem>
                              <MenuItem onClick={() => { setOpenMenu(null); onAction('preview', c) }}>Preview ad</MenuItem>
                              <MenuItem onClick={() => { setOpenMenu(null); onAction('discard', c) }}>Discard draft</MenuItem>
                            </>
                          ) : (
                            <>
                              {canPause && (
                                <MenuItem
                                  disabled={isProcessing}
                                  onClick={() => {
                                    setOpenMenu(null)
                                    onAction('pause', c)
                                  }}
                                >
                                  {c.paused ? 'Resume campaign' : 'Pause campaign'}
                                </MenuItem>
                              )}
                              <MenuItem onClick={() => { setOpenMenu(null); onAction('edit', c) }}>Edit details</MenuItem>
                              {canFund && (
                                <MenuItem onClick={() => { setOpenMenu(null); onAction('extend', c) }}>
                                  Extend duration
                                </MenuItem>
                              )}
                              <MenuItem onClick={() => { setOpenMenu(null); onAction('preview', c) }}>Preview ad</MenuItem>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </Td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children, align = 'left', className = '' }: { children: React.ReactNode; align?: 'left' | 'right'; className?: string }) {
  return (
    <th className={`px-3 py-2.5 ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}>{children}</th>
  )
}

function Td({ children, align = 'left', className = '' }: { children: React.ReactNode; align?: 'left' | 'right'; className?: string }) {
  return <td className={`px-3 py-2.5 align-middle ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}>{children}</td>
}

function MenuItem({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="block w-full px-3 py-2 text-left text-[12px] text-[#2D2D2D] hover:bg-[#F4F4F2] disabled:opacity-50"
    >
      {children}
    </button>
  )
}
