/**
 * Chain configuration - Celo mainnet by default (SovadGs, G$, treasury deployed there)
 * Set NEXT_PUBLIC_CHAIN=celo-sepolia for testnet
 */

export const CELO_MAINNET_CHAIN_ID = 42220
export const CELO_SEPOLIA_CHAIN_ID = 11142220

export const isMainnet = (process.env.NEXT_PUBLIC_CHAIN || 'celo') === 'celo'

export const chainId = isMainnet ? CELO_MAINNET_CHAIN_ID : CELO_SEPOLIA_CHAIN_ID

/** SovAdsManager - set NEXT_PUBLIC_SOVADS_MANAGER_ADDRESS. Sepolia fallback: 0x3eCE3a48818efF703204eC9B60f00d476923f5B5 */
export const SOVADS_MANAGER_ADDRESS =
  process.env.NEXT_PUBLIC_SOVADS_MANAGER_ADDRESS || '0x3eCE3a48818efF703204eC9B60f00d476923f5B5'
