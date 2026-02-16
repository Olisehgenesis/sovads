/**
 * Supported tokens for topup - send to treasury 0x8aE67ce409dA16e71Cda5f71465e563Fe2060b92
 * Celo mainnet
 */

export const TREASURY_ADDRESS = '0x8aE67ce409dA16e71Cda5f71465e563Fe2060b92' as const

/** G$ conversion rates (for display/tables) */
export const GS_RATES = {
  /** 1 G$ = $0.0001 USD */
  GS_TO_USD: 0.0001,
  /** 1 G$ = 0.001329 CELO */
  GS_TO_CELO: 0.001329,
  /** 1 USDC ($1) = 10,000 G$ */
  USDC_TO_GS: 10_000,
  /** For contracts: 1e16 G$ raw per 1 USDC raw unit */
  USDC_RAW_TO_GS_RAW: BigInt('10000000000000000')
} as const

export const ERC20_TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ type: 'bool' }]
  }
] as const

/** Tokens that can be exchanged for G$. 1 USDC/cUSD/USDT ($1) = 10,000 G$ */
export const SUPPORTED_EXCHANGE_TOKENS = [
  {
    symbol: 'cUSD',
    name: 'Celo Dollar',
    address: '0x765DE816845861e75A25fCA122bb6898B8B1282a' as const,
    decimals: 18,
    /** 1 cUSD ($1) = 10,000 G$ */
    gsPerUnit: 10_000
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    address: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C' as const,
    decimals: 6,
    /** 1 USDC ($1) = 10,000 G$ */
    gsPerUnit: 10_000
  },
  {
    symbol: 'USDT',
    name: 'Tether USD',
    address: '0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e' as const,
    decimals: 6,
    /** 1 USDT ($1) = 10,000 G$ */
    gsPerUnit: 10_000
  }
] as const

/** @deprecated Use SUPPORTED_EXCHANGE_TOKENS */
export const SUPPORTED_TOPUP_TOKENS = SUPPORTED_EXCHANGE_TOKENS
