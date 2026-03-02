'use client'

import { useEffect } from 'react'
import { useAccount } from 'wagmi'
import { getSovAdsClient } from '@/lib/sovads-client'

/**
 * SDKIdentityHelper
 * 
 * This component listens for wallet connection changes via wagmi
 * and synchronizes the connected wallet address with the SovAds SDK.
 * This ensures accurate attribution for the "Hybrid Identity" system.
 */
export function SDKIdentityHelper() {
    const { address, isConnected } = useAccount()

    useEffect(() => {
        const client = getSovAdsClient()
        if (!client) return

        if (isConnected && address) {
            if (typeof client.identify === 'function') {
                client.identify(address)
            } else {
                // Fallback for older SDK versions or if types are missing
                (client as any).identify?.(address)
            }
        }
    }, [address, isConnected])

    // This component doesn't render anything
    return null
}
