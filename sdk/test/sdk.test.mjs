import test from 'node:test'
import assert from 'node:assert/strict'

// Minimal DOM stubs for SDK constructor in Node tests.
Object.defineProperty(globalThis, 'window', {
  value: {
  location: { hostname: 'localhost', href: 'http://localhost:3000' },
  innerWidth: 1280,
  innerHeight: 720,
  localStorage: {
    _store: new Map(),
    getItem(key) { return this._store.get(key) ?? null },
    setItem(key, value) { this._store.set(key, value) },
  },
  },
  configurable: true,
})
Object.defineProperty(globalThis, 'document', { value: { referrer: '' }, configurable: true })
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'test', language: 'en-US' }, configurable: true })
Object.defineProperty(globalThis, 'screen', { value: { width: 1920, height: 1080 }, configurable: true })
Object.defineProperty(globalThis, 'crypto', {
  value: { randomUUID: () => '00000000-0000-0000-0000-000000000000' },
  configurable: true,
})
Object.defineProperty(globalThis, 'btoa', {
  value: (value) => Buffer.from(value, 'binary').toString('base64'),
  configurable: true,
})

const { SovAds } = await import('../dist/index.js')

test('normalizeUrl adds protocol for localhost', () => {
  const sdk = new SovAds({ apiUrl: 'http://localhost:3000' })
  assert.equal(sdk.normalizeUrl('localhost:3000/path'), 'http://localhost:3000/path')
})

test('normalizeUrl keeps valid https URL', () => {
  const sdk = new SovAds({ apiUrl: 'http://localhost:3000' })
  assert.equal(sdk.normalizeUrl('https://example.com/ad'), 'https://example.com/ad')
})
