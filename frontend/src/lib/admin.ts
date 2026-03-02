/**
 * Admin utility to check if a wallet is an authorized administrator.
 */
export function isWalletAdmin(wallet: string | null | undefined): boolean {
    if (!wallet) return false

    // Get admin wallets from environment variable (comma-separated list)
    const adminWalletsEnv = process.env.ADMIN_WALLETS || ''

    // Also check some hardcoded defaults if needed or just rely on ENV
    const adminWallets = adminWalletsEnv
        .split(',')
        .map(w => w.trim().toLowerCase())
        .filter(w => w.length > 0)

    // In development, you might want to allow a specific wallet if not set
    if (process.env.NODE_ENV === 'development' && adminWallets.length === 0) {
        // Optional: add a dev default if helpful
    }

    return adminWallets.includes(wallet.toLowerCase())
}
