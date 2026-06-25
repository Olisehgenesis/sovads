/**
 * Buffered writer for Turso.
 *
 * Use case: high-frequency event ingest (pageviews, impressions, sdk logs)
 * where we don't want to round-trip per event. Buffers up to `maxBatch` rows
 * or `flushIntervalMs` of wall time, whichever comes first, then flushes via
 * a single libSQL batch.
 *
 * Failure mode: on flush error, the rows are handed to `onError` so the caller
 * can persist them to the retry queue. We never throw out of `enqueue` —
 * callers should treat ingest as fire-and-forget.
 *
 * Caveat (serverless): Vercel functions may freeze before flush. For routes
 * that must guarantee a write (e.g. CLICK accounting), call `flushNow()`
 * before returning the response, or write directly with `turso().insert()`.
 */

import type { Client, InStatement } from '@libsql/client'
import { tursoClient } from './client'

type FailedBatch = {
  statements: InStatement[]
  error: unknown
}

export interface BatchedWriterOptions {
  maxBatch?: number
  flushIntervalMs?: number
  onError?: (failed: FailedBatch) => void | Promise<void>
}

const DEFAULT_MAX_BATCH = 100
const DEFAULT_FLUSH_INTERVAL_MS = 1000

class BatchedWriter {
  private queue: InStatement[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private readonly maxBatch: number
  private readonly flushIntervalMs: number
  private readonly onError: (failed: FailedBatch) => void | Promise<void>
  private readonly client: Client

  constructor(client: Client, opts: BatchedWriterOptions = {}) {
    this.client = client
    this.maxBatch = opts.maxBatch ?? DEFAULT_MAX_BATCH
    this.flushIntervalMs = opts.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS
    this.onError =
      opts.onError ??
      ((failed) => {
        console.error('[turso-writer] flush failed', failed.error, 'rows=', failed.statements.length)
      })
  }

  enqueue(stmt: InStatement): void {
    this.queue.push(stmt)
    if (this.queue.length >= this.maxBatch) {
      void this.flush()
      return
    }
    if (!this.timer) {
      this.timer = setTimeout(() => void this.flush(), this.flushIntervalMs)
    }
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.queue.length === 0) return

    const batch = this.queue
    this.queue = []
    try {
      await this.client.batch(batch, 'write')
    } catch (err) {
      await this.onError({ statements: batch, error: err })
    }
  }

  /** For tests / route handlers that must guarantee a flush before returning. */
  flushNow(): Promise<void> {
    return this.flush()
  }

  size(): number {
    return this.queue.length
  }
}

let _writer: BatchedWriter | null = null

export function batchedWriter(): BatchedWriter {
  if (!_writer) {
    _writer = new BatchedWriter(tursoClient())
  }
  return _writer
}
