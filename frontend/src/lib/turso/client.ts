/**
 * Single libSQL client + Drizzle instance for the Turso firehose DB.
 *
 * Why a singleton: serverless invocations reuse module scope on warm starts,
 * which keeps connection setup cost near zero. Don't create per-request clients.
 */

import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { tursoEnv } from './env'
import * as schema from './schema'

let _client: Client | null = null
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null

export function tursoClient(): Client {
  if (!_client) {
    _client = createClient({
      url: tursoEnv.url,
      authToken: tursoEnv.token,
    })
  }
  return _client
}

export function turso() {
  if (!_db) {
    _db = drizzle(tursoClient(), { schema })
  }
  return _db
}

export type TursoDb = ReturnType<typeof turso>
