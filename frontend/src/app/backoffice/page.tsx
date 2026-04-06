'use client'

import AdminDashboard from '@/components/admin/AdminDashboard'
import { useAccount } from 'wagmi'
import { isWalletAdmin } from '@/lib/admin'

export default function BackofficePage() {
  const { address, isConnected } = useAccount()
  const isAdmin = isWalletAdmin(address)

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[#111] text-white flex items-center justify-center">
        <h1 className="text-xl font-black">Please connect your wallet to access Back Office</h1>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#111] text-white flex items-center justify-center flex-col gap-4 p-6 text-center">
        <h1 className="text-4xl font-black text-red-500 uppercase">UNAUTHORIZED</h1>
        <p className="text-sm text-[#ccc]">Your wallet is not configured as an admin in ENV.ADMIN_WALLETS.</p>
        <p className="text-xs text-[#888]">Current wallet: {address}</p>
      </div>
    )
  }

  return <AdminDashboard />
}
