import { verifyMessage } from 'viem'

/**
 * Admin utility to check if a wallet is an authorized administrator.
 */
export function isWalletAdmin(wallet: string | null | undefined): boolean {
    if (!wallet) return false

    const adminWalletsEnv = process.env.ADMIN_WALLETS || ''
    const adminWallets = adminWalletsEnv
        .split(',')
        .map(w => w.trim().toLowerCase())
        .filter(w => w.length > 0)

    return adminWallets.includes(wallet.toLowerCase())
}

/**
 * Verify that a message was signed by an authorized admin.
 * @param wallet The claimed admin wallet address
 * @param message The message that was signed
 * @param signature The resulting signature
 */
export async function verifyAdminSignature(
    wallet: string,
    message: string,
    signature: string
): Promise<boolean> {
    try {
        if (!isWalletAdmin(wallet)) return false

        const isValid = await verifyMessage({
            address: wallet as `0x${string}`,
            message,
            signature: signature as `0x${string}`,
        })

        return isValid
    } catch (error) {
        console.error('Signature verification failed:', error)
        return false
    }
}
