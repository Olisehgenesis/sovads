import { cookieStorage, createStorage, http } from '@wagmi/core'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { celo, celoSepolia } from '@reown/appkit/networks'
import { isMainnet } from '@/lib/chain-config'

// Get projectId from https://dashboard.reown.com
export const projectId = process.env.NEXT_PUBLIC_PROJECT_ID || 'b56e18d47c72ab683b10814fe9495694' // Public projectId for localhost

if (!projectId) {
  throw new Error('Project ID is not defined')
}

// Celo mainnet first (SovadGs, G$, treasury) - set NEXT_PUBLIC_CHAIN=celo-sepolia for testnet
export const networks = isMainnet ? [celo, celoSepolia] : [celoSepolia, celo]
export const defaultNetwork = isMainnet ? celo : celoSepolia

// Set up the Wagmi Adapter (Config)
export const wagmiAdapter = new WagmiAdapter({
  storage: createStorage({
    storage: cookieStorage
  }),
  ssr: true,
  projectId,
  networks
})

export const config = wagmiAdapter.wagmiConfig
