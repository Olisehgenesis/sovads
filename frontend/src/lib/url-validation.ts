/**
 * URL validation helpers shared between the create-campaign form, the
 * EditCampaignModal, and any other surface that asks the advertiser to
 * paste a "real" link (landing URLs, CTA VISIT_URL targets, etc.).
 *
 * Goals:
 *  - Accept either bare hosts (`example.com`) or full URLs (`https://example.com/path`).
 *    Bare hosts get a synthesised `https://` prefix during validation so the
 *    user doesn't have to type it.
 *  - Reject empty strings, javascript:/data:/file: schemes, and obvious
 *    typos like `htps://`.
 *  - Return a normalized form the caller can store / display.
 */

/** Schemes we accept on the wire. */
const ALLOWED_SCHEMES = new Set(['http:', 'https:'])

export type UrlValidationResult =
  | { ok: true; url: string; host: string }
  | { ok: false; reason: string }

/**
 * Validate a user-entered URL. Returns the normalized form (with scheme
 * prefixed when the user typed a bare host) on success, or a human-readable
 * reason on failure.
 */
export function validateHttpUrl(raw: string): UrlValidationResult {
  const value = (raw ?? '').trim()
  if (!value) return { ok: false, reason: 'URL is required.' }

  // Block obvious dangerous schemes before they hit the URL parser. (URL
  // accepts `javascript:` as a valid URL, so we have to guard explicitly.)
  if (/^(javascript|data|file|vbscript):/i.test(value)) {
    return { ok: false, reason: 'Only http(s) URLs are allowed.' }
  }

  const candidate = /^(https?:)?\/\//i.test(value) ? value : `https://${value}`

  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    return { ok: false, reason: 'That doesn\u2019t look like a valid URL.' }
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    return { ok: false, reason: 'Only http and https links are allowed.' }
  }

  const host = parsed.hostname
  if (!host) return { ok: false, reason: 'URL is missing a hostname.' }

  // Reject hostnames without a dot AND not `localhost` — these are almost
  // always typos (e.g. `examplecom`).
  if (!host.includes('.') && host !== 'localhost') {
    return { ok: false, reason: 'Hostname needs a domain (e.g. example.com).' }
  }

  // Trim trailing dot ("example.com." \u2192 "example.com").
  const cleanHost = host.replace(/\.$/, '')
  parsed.hostname = cleanHost

  return { ok: true, url: parsed.toString(), host: cleanHost }
}

/** True \u2194 `validateHttpUrl(raw).ok`. Convenience for inline JSX checks. */
export function isValidHttpUrl(raw: string): boolean {
  return validateHttpUrl(raw).ok
}

/**
 * Returns the normalized URL on success, otherwise the original input
 * unchanged. Use this when you want to forgive minor formatting issues
 * without surfacing an error.
 */
export function normalizeHttpUrl(raw: string): string {
  const r = validateHttpUrl(raw)
  return r.ok ? r.url : raw
}
