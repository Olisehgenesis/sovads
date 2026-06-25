/**
 * Turso environment configuration.
 *
 * Single-DB layout for v0. Cold archive + aggregates DBs can be added later
 * by introducing TURSO_COLD_URL / TURSO_AGG_URL without breaking callers.
 */

function required(name: string): string {
  const value = process.env[name]
  if (!value || value.length === 0) {
    throw new Error(`[turso] missing required env var: ${name}`)
  }
  return value
}

export const tursoEnv = {
  url: required('TURSO_URL'),
  token: required('TURSO_TOKEN'),
  /** Salt used to hash visitors for pageview dedup. */
  visitorSalt: process.env.ANALYTICS_VISITOR_SALT ?? 'dev-salt-change-me',
}
