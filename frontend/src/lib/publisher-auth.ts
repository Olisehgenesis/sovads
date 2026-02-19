export const PUBLISHER_AUTH_WINDOW_MS = 5 * 60 * 1000

export const buildPublisherAuthMessage = (wallet: string, timestamp: number): string => {
  return `SovAds Publisher Auth\nWallet:${wallet.toLowerCase()}\nTimestamp:${timestamp}`
}

export const isPublisherAuthTimestampValid = (
  timestamp: number,
  now: number = Date.now(),
  windowMs: number = PUBLISHER_AUTH_WINDOW_MS
): boolean => {
  if (!Number.isFinite(timestamp)) {
    return false
  }
  return Math.abs(now - timestamp) <= windowMs
}

