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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-md p-8 z-10">
        <h3 className="text-2xl font-heading mb-4 uppercase">Add Funds to {campaign.name}</h3>
        <p className="text-sm font-bold text-black mb-6 uppercase tracking-tight">Top up vault using {tokenSymbol}</p>

        <div className="flex gap-4 items-center mb-6">
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="flex-1"
            placeholder={`Amount (${tokenSymbol})`}
          />
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn btn-outline text-xs">Cancel</button>
          <button
            onClick={handleConfirm}
            disabled={isProcessing || !amount}
            className="btn btn-primary text-xs"
          >
            {isProcessing ? 'Processing' : 'Confirm'}
          </button>
        </div>

        {msgError && <div className="mt-4 p-2 border-2 border-black bg-red-100 text-xs font-bold uppercase">{msgError}</div>}
        {msgSuccess && <div className="mt-4 p-2 border-2 border-black bg-green-100 text-xs font-bold uppercase">{msgSuccess}</div>}
      </div>
    </div>
  )
}
