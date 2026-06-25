/**
 * postMessage protocol for SovAds standalone unit iframes.
 *
 * The renderer page (`/r/unit`) is loaded inside a host-page iframe and
 * communicates lifecycle + interaction events to its parent via
 * `window.parent.postMessage(message, '*')`. The SDK side filters by
 * `source: 'sovads-unit'` and routes to host callbacks.
 *
 * Versioning: bump `protocolVersion` on breaking shape changes only.
 */
export const SOVADS_UNIT_SOURCE = 'sovads-unit' as const
export const SOVADS_UNIT_PROTOCOL = 1 as const

export type UnitEventType =
  | 'READY'           // iframe booted, no unit fetched yet
  | 'LOADED'          // unit fetched + rendered; payload = { kind, taskId|adId, campaignId }
  | 'NONE'            // /api/serve returned NONE
  | 'IMPRESSION'      // unit became viewport-visible
  | 'INTERACTION'     // intermediate event (survey STEP, etc.)
  | 'COMPLETE'        // terminal success; payload = { completionId?, awarded? }
  | 'CLICK'           // banner click
  | 'DISMISS'         // user closed
  | 'ERROR'           // anything fatal; payload = { message }
  | 'RESIZE'          // unit wants iframe resized to { width, height }

export interface UnitMessage<T = Record<string, unknown>> {
  source: typeof SOVADS_UNIT_SOURCE
  protocolVersion: typeof SOVADS_UNIT_PROTOCOL
  slotId: string
  type: UnitEventType
  ts: number
  payload?: T
}

export function makeUnitMessage<T extends Record<string, unknown>>(
  slotId: string,
  type: UnitEventType,
  payload?: T
): UnitMessage<T> {
  return {
    source: SOVADS_UNIT_SOURCE,
    protocolVersion: SOVADS_UNIT_PROTOCOL,
    slotId,
    type,
    ts: Date.now(),
    payload,
  }
}

export function isUnitMessage(value: unknown): value is UnitMessage {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    v.source === SOVADS_UNIT_SOURCE &&
    typeof v.slotId === 'string' &&
    typeof v.type === 'string' &&
    typeof v.ts === 'number'
  )
}
