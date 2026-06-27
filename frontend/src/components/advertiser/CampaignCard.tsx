'use client'

import { getTokenSymbol } from '@/lib/tokens'
import AdvertiserIcon from './AdvertiserIcon'
import { StatusBadge, Button, formatNumber, formatPct, getCampaignStatusDisplay, computeBudgetUsage } from './ui'
import type { Campaign } from './types'

interface Props {
  campaign: Campaign
  onPreview?: (c: Campaign) => void
  onStats?: (c: Campaign) => void
  onFund?: (c: Campaign) => void
  onEdit?: (c: Campaign) => void
  onPublish?: (c: Campaign) => void
  onDiscard?: (c: Campaign) => void
}

/**
 * Compact card view of a campaign. Used as an alternative to the table.
 * No hard shadow — the card sits on the cream background calmly.
 */
export default function CampaignCard({ campaign, onPreview, onStats, onFund, onEdit, onPublish, onDiscard }: Props) {
  const tokenSymbol = getTokenSymbol(campaign.tokenAddress)
  const usage = computeBudgetUsage(campaign.budget, campaign.spent)
  const budgetExhausted = usage.isOver || (campaign.budget > 0 && campaign.spent >= campaign.budget)
  const { label: statusLabel, tone } = getCampaignStatusDisplay(campaign)
  const isDraft = campaign.status === 'draft'

  return (
    <article className="flex flex-col border border-[#E5E5E5] bg-white">
      <div className="aspect-[16/8] overflow-hidden border-b border-[#E5E5E5] bg-[#EFEDE7]">
        {campaign.mediaType === 'video' ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video src={campaign.bannerUrl} className="h-full w-full object-cover" muted playsInline />
        ) : campaign.bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={campaign.bannerUrl} alt={campaign.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[#555]">
            <AdvertiserIcon name="campaign" className="h-8 w-8" />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <header className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-[#2D2D2D]">{campaign.name}</p>
            <p className="line-clamp-1 text-[12px] text-[#666]">{campaign.description || '—'}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <StatusBadge tone={tone}>{statusLabel}</StatusBadge>
            {budgetExhausted && <StatusBadge tone="warning">Out of budget</StatusBadge>}
          </div>
        </header>

        <dl className="grid grid-cols-3 gap-0 border border-[#EFEFEF] bg-[#FAFAF8] text-center">
          <Stat label={`${tokenSymbol} budget`} value={formatNumber(campaign.budget)} />
          <Stat label="Spent" value={formatNumber(campaign.spent)} bordered />
          <Stat label="Used" value={formatPct(usage.labelPct)} />
        </dl>

        {budgetExhausted && (
          <p className="-mt-1 text-[10px] font-semibold uppercase tracking-wide text-[#8A1F1F]">
            Budget exhausted — viewers now earn SovPoints instead of {tokenSymbol}. Fund to resume payouts.
          </p>
        )}

        {(campaign.ctaSpent != null && campaign.ctaSpent > 0) && (
          <p className="text-[10px] text-[#888]">
            Clicks {formatNumber(campaign.clickSpent ?? 0)} {tokenSymbol} · CTAs {formatNumber(campaign.ctaSpent)} {tokenSymbol}
          </p>
        )}

        <div className="h-1.5 w-full bg-[#EFEFEF]">
          <div
            className={`h-full ${usage.isOver ? 'bg-[#8A1F1F]' : 'bg-[#2D2D2D]'}`}
            style={{ width: `${usage.barPct}%` }}
          />
        </div>

        <p className="text-[11px] text-[#888]">
          CPC {campaign.cpc} {tokenSymbol}
          {campaign.onChainId != null && <> · ID #{campaign.onChainId}</>}
        </p>

        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          {/* Drafts get a dedicated Preview + Publish + Discard set; Stats /
           * Fund don't apply until the campaign is on-chain. */}
          {isDraft ? (
            <>
              {onPreview && (
                <Button size="sm" intent="ghost" onClick={() => onPreview(campaign)}>Preview</Button>
              )}
              {onEdit && (
                <Button size="sm" intent="secondary" onClick={() => onEdit(campaign)}>Edit</Button>
              )}
              {onDiscard && (
                <Button size="sm" intent="ghost" onClick={() => onDiscard(campaign)}>Discard</Button>
              )}
              {onPublish && (
                <Button size="sm" intent="primary" onClick={() => onPublish(campaign)}>Publish</Button>
              )}
            </>
          ) : (
            <>
              {onPreview && (
                <Button size="sm" intent="ghost" onClick={() => onPreview(campaign)}>Preview</Button>
              )}
              {onStats && (
                <Button size="sm" intent="ghost" onClick={() => onStats(campaign)}>Stats</Button>
              )}
              {onEdit && (
                <Button size="sm" intent="secondary" onClick={() => onEdit(campaign)}>Edit</Button>
              )}
              {onFund && campaign.onChainId != null && (
                <Button size="sm" intent="primary" onClick={() => onFund(campaign)}>Fund</Button>
              )}
            </>
          )}
        </div>
      </div>
    </article>
  )
}

function Stat({ label, value, bordered }: { label: string; value: string; bordered?: boolean }) {
  return (
    <div className={`py-2 ${bordered ? 'border-x border-[#EFEFEF]' : ''}`}>
      <p className="text-[12px] font-semibold tabular-nums text-[#2D2D2D]">{value}</p>
      <p className="mt-0.5 text-[10px] text-[#888]">{label}</p>
    </div>
  )
}
