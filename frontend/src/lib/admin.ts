import { verifyMessage } from 'viem'

/**
 * Admin utility to check if a wallet is an authorized administrator.
 */
export function getAdminWallets(): string[] {
    const envList = (process.env.ADMIN_WALLETS || '')
      .split(',')
      .map((w) => w.trim().toLowerCase())
      .filter((w) => !!w)

    const deployerList = (process.env.ADMIN_CONTRACT_DEPLOYERS || '')
      .split(',')
      .map((w) => w.trim().toLowerCase())
      .filter((w) => !!w)

    // Default admin wallet for local/backoffice bootstrapping
    const fallback = ['0x53eaf4cd171842d8144e45211308e5d90b4b0088']

    return Array.from(new Set([...envList, ...deployerList, ...fallback]))
}

export function isWalletAdmin(wallet: string | null | undefined): boolean {
    if (!wallet) return false

    const normalizedWallet = wallet.trim().toLowerCase()
    return getAdminWallets().includes(normalizedWallet)
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
