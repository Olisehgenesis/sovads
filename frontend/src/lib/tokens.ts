/**
 * Token configuration - Celo mainnet & Sepolia
 */

// Token list — mainnet only

export interface TokenInfo {
  symbol: string;
  name: string;
  decimals: number;
  address: string;
}

// (No testnet token list maintained — use mainnet tokens below)

/** Celo mainnet tokens (SovadGs, G$, treasury) */
export const CELO_MAINNET_TOKENS: Record<string, TokenInfo> = {
  '0x765de816845861e75a25fca122bb6898b8b1282a': {
    symbol: 'cUSD',
    name: 'Celo Dollar',
    decimals: 18,
    address: '0x765DE816845861e75A25fCA122bb6898B8B1282a'
  },
  '0xceba9300f2b948710d2653dd7b07f33a8b32118c': {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    address: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C'
  },
  '0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e': {
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    address: '0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e'
  },
  '0x62b8b11039fcfe5ab0c56e502b1c372a3d2a9c7a': {
    symbol: 'G$',
    name: 'Good Dollar',
    decimals: 18,
    address: '0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A'
  },
  '0x471ece3750da237f93b8e339c536989b8978a438': {
    symbol: 'CELO',
    name: 'Celo Native Token',
    decimals: 18,
    address: '0x471EcE3750Da237f93B8E339c536989b8978a438'
  }
};

/** Active chain tokens (mainnet) */
const baseTokens = { ...CELO_MAINNET_TOKENS };
const SOV_TOKEN_ADDRESS = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_SOV_TOKEN_ADDRESS || '')
  : (process.env.NEXT_PUBLIC_SOV_TOKEN_ADDRESS || '');
if (SOV_TOKEN_ADDRESS && SOV_TOKEN_ADDRESS !== '0x0000000000000000000000000000000000000000') {
  baseTokens[SOV_TOKEN_ADDRESS.toLowerCase()] = {
    symbol: 'SOV',
    name: 'SovAds Token',
    decimals: 18,
    address: SOV_TOKEN_ADDRESS
  };
}
export const CELO_TOKENS: Record<string, TokenInfo> = baseTokens;

/**
 * Get token information by address
 * @param address - Token contract address
 * @returns TokenInfo or undefined if not found
 */
export function getTokenInfo(address: string | null | undefined): TokenInfo | undefined {
  if (!address) return undefined;
  return CELO_TOKENS[address.toLowerCase()];
}

/**
 * Get token symbol by address
 * @param address - Token contract address
 * @returns Token symbol or 'TOKEN' if not found
 */
export function getTokenSymbol(address: string | null | undefined): string {
  return getTokenInfo(address)?.symbol || 'TOKEN';
}

/**
 * Get token name by address
 * @param address - Token contract address
 * @returns Token name or 'Token' if not found
 */
export function getTokenName(address: string | null | undefined): string {
  return getTokenInfo(address)?.name || 'Token';
}

/**
 * Get formatted token label (symbol — name)
 * @param address - Token contract address
 * @returns Formatted label or truncated address if not found
 */
export function getTokenLabel(address: string | null | undefined): string {
  const info = getTokenInfo(address);
  if (info) {
    return `${info.symbol} — ${info.name}`;
  }
  if (address) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }
  return 'Unknown Token';
}

/**
 * Get all available tokens (including SOV if configured)
 * @returns Array of token addresses
 */
export function getAllTokenAddresses(): string[] {
  return Object.values(CELO_TOKENS).map(token => token.address);
}

/**
 * Check if address is SovAds token
 * @param address - Token contract address
 * @returns True if address is SovAds token
 */
export function isSovAdsToken(address: string | null | undefined): boolean {
  const info = getTokenInfo(address);
  return info?.symbol === 'SOV';
}

