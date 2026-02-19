import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildPublisherAuthMessage, isPublisherAuthTimestampValid } from './publisher-auth.ts'

describe('publisher auth helpers', () => {
  it('builds deterministic auth message', () => {
    const wallet = '0xAbCdEf0000000000000000000000000000000000'
    const timestamp = 1700000000000
    const message = buildPublisherAuthMessage(wallet, timestamp)
    assert.equal(
      message,
      'SovAds Publisher Auth\nWallet:0xabcdef0000000000000000000000000000000000\nTimestamp:1700000000000'
    )
  })

  it('rejects stale timestamps', () => {
    const now = 1_000_000
    assert.equal(isPublisherAuthTimestampValid(now - 6 * 60 * 1000, now), false)
    assert.equal(isPublisherAuthTimestampValid(now + 6 * 60 * 1000, now), false)
  })

  it('accepts timestamps within window', () => {
    const now = 1_000_000
    assert.equal(isPublisherAuthTimestampValid(now - 60_000, now), true)
    assert.equal(isPublisherAuthTimestampValid(now + 60_000, now), true)
  })
})
