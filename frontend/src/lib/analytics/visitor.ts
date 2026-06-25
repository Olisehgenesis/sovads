/**
 * Privacy-safe visitor hashing.
 *
 * Strategy (Plausible-style):
 *   visitor_hash = sha256( daily_salt | ip | user_agent | site_id )
 *   session_hash = sha256( visitor_hash | hour_bucket )
 *
 * Daily salt rotation makes cross-day re-identification infeasible.
 * Never persist raw IP or UA in any analytics table.
 */

import { createHash } from 'crypto'
import { tursoEnv } from '@/lib/turso/env'

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

export function visitorHash(args: {
  ip: string
  userAgent: string
  siteId: string
}): string {
  return sha256Hex(`${tursoEnv.visitorSalt}|${args.ip}|${args.userAgent}|${args.siteId}`)
}

export function sessionHash(visitor: string, at: Date = new Date()): string {
  const hourBucket = Math.floor(at.getTime() / (60 * 60 * 1000))
  return sha256Hex(`${visitor}|${hourBucket}`)
}

/** One-way hash of an IP for events that need approximate dedup but not full attribution. */
export function ipHash(ip: string): string {
  return sha256Hex(`${tursoEnv.visitorSalt}|${ip}`)
}
