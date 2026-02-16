/**
 * Chain configuration - Celo mainnet only (SovadGs, G$, treasury deployed there)
 */

export const CELO_MAINNET_CHAIN_ID = 42220

export const chainId = CELO_MAINNET_CHAIN_ID

/** SovAdsManager - set NEXT_PUBLIC_SOVADS_MANAGER_ADDRESS. Mainnet fallback: 0xcE580DfF039cA6b3516A496Bf55814Ce1d66F66a */
export const SOVADS_MANAGER_ADDRESS = process.env.NEXT_PUBLIC_SOVADS_MANAGER_ADDRESS || '0xcE580DfF039cA6b3516A496Bf55814Ce1d66F66a'
