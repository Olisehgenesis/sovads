/**
 * Chain configuration - Celo mainnet only (SovadGs, G$, treasury deployed there)
 */

export const CELO_MAINNET_CHAIN_ID = 42220

export const chainId = CELO_MAINNET_CHAIN_ID

/** SovAdsManager - set NEXT_PUBLIC_SOVADS_MANAGER_ADDRESS. Mainnet fallback: 0xcE580DfF039cA6b3516A496Bf55814Ce1d66F66a */
export const SOVADS_MANAGER_ADDRESS = process.env.NEXT_PUBLIC_SOVADS_MANAGER_ADDRESS || '0xcE580DfF039cA6b3516A496Bf55814Ce1d66F66a'

/** SovAdsStreaming - new superfluid based contract */
export const SOVADS_STREAMING_ADDRESS = process.env.NEXT_PUBLIC_SOVADS_STREAMING_ADDRESS || '0xFb76103FC70702413cEa55805089106D0626823f'

/** GoodDollar (G$) - SuperToken address */
export const GOODDOLLAR_ADDRESS = process.env.NEXT_PUBLIC_GOODDOLLAR_ADDRESS || '0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A'
