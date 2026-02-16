"use client"

import { useState } from 'react'
import { useAds } from '@/hooks/useAds'
import { getTokenSymbol } from '@/lib/tokens'

interface Campaign {
  id: string
  name: string
  onChainId?: number
  tokenAddress?: string
}

interface Props {
  open: boolean
  campaign: Campaign | null
  onClose: () => void
  onSuccess?: () => void
}

export default function TopUpModal({ open, campaign, onClose, onSuccess }: Props) {
  const { topUpCampaign } = useAds()
  const [amount, setAmount] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [msgError, setMsgError] = useState<string | null>(null)
  const [msgSuccess, setMsgSuccess] = useState<string | null>(null)

  if (!open || !campaign) return null

  const tokenSymbol = getTokenSymbol(campaign.tokenAddress)

  const handleConfirm = async () => {
    if (!campaign || !campaign.onChainId || !campaign.tokenAddress) return
    setIsProcessing(true)
    setMsgError(null)
    setMsgSuccess(null)
    try {
      const txHash = await topUpCampaign(Number(campaign.onChainId), amount, campaign.tokenAddress)
      setMsgSuccess(txHash ? `Transaction sent: ${txHash}` : 'Funded successfully')
      setAmount('')
      onSuccess?.()
    } catch (err) {
      setMsgError(err instanceof Error ? err.message : 'Top-up failed')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white dark:bg-[#0b1220] rounded-lg w-full max-w-md p-6 z-10">
        <h3 className="text-lg font-semibold mb-3">Add Funds to {campaign.name}</h3>
        <p className="text-sm text-[var(--text-secondary)] mb-4">Top up the campaign vault using {tokenSymbol}</p>

        <div className="flex gap-2 items-center mb-4">
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="flex-1 bg-input border border-border rounded-md px-3 py-2 text-sm"
            placeholder={`Amount (${tokenSymbol})`}
          />
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-outline px-4">Cancel</button>
          <button
            onClick={handleConfirm}
            disabled={isProcessing || !amount}
            className="btn btn-primary px-4"
          >
            {isProcessing ? 'Processing...' : 'Confirm Top-up'}
          </button>
        </div>

        {msgError && <div className="mt-3 text-sm text-destructive">{msgError}</div>}
        {msgSuccess && <div className="mt-3 text-sm text-[var(--accent-primary-solid)]">{msgSuccess}</div>}
      </div>
    </div>
  )
}
