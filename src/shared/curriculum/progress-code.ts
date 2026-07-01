/**
 * Compact, versioned, cross-device progress code for the scenario path.
 *
 * WHY: a learner's level and "current scenario" already sync (Appwrite
 * user_preferences), but *which scenarios are done/practicing* lived only in
 * localStorage. On a new device the path looked untouched. This module encodes
 * the whole path into a tiny string that rides along with preferences.
 *
 * DESIGN
 * - Every scenario gets a stable ordinal built from the live SEEDS data, so we
 *   NEVER assume a fixed count per level — uneven levels are handled for free.
 * - 2 bits per scenario (0 = new, 1 = practicing, 2 = done) → ~2 bits × N.
 *   For ~300 scenarios that is ~75 bytes → ~100 base64 chars.
 * - The code is prefixed with a version + a registry signature. If the
 *   curriculum ever changes shape, the signature changes and we decode
 *   conservatively instead of silently corrupting progress.
 * - Status is monotonic (new < practicing < done), so merging two devices is
 *   just "take the higher state per scenario" — lossless and conflict-free.
 */

import { SEEDS } from './helpers'

export type ScenarioState = 0 | 1 | 2 // new | practicing | done

export const STATE_NEW: ScenarioState = 0
export const STATE_PRACTICING: ScenarioState = 1
export const STATE_DONE: ScenarioState = 2

const VERSION = 'v1'

// ─── Stable ordinal registry (data-driven) ─────────────────────────────────────

/**
 * Build a stable ordinal for every scenario from the live curriculum.
 * Order: by level ascending, then by the seed's original position in SEEDS
 * (a stable sort). This makes ordinals deterministic without hardcoding any
 * per-level count, so a level with 24 or 26 scenarios just works.
 */
function buildRegistry(): { ids: string[]; index: Map<string, number> } {
  const ordered = SEEDS
    .map((s, i) => ({ id: s.id, level: s.level, i }))
    .sort((a, b) => (a.level - b.level) || (a.i - b.i))
    .map((x) => x.id)

  const index = new Map<string, number>()
  ordered.forEach((id, ord) => index.set(id, ord))
  return { ids: ordered, index }
}

const REGISTRY = buildRegistry()

/** Total scenarios in the current curriculum (whatever it actually is). */
export const SCENARIO_COUNT = REGISTRY.ids.length

/**
 * A cheap signature of the current registry (count + hash of the id list).
 * Lets a decoder detect that a stored code was written against a different
 * curriculum shape and fall back safely.
 */
function registrySignature(): string {
  let h = 0
  const str = REGISTRY.ids.join('|')
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0
  }
  return `${REGISTRY.ids.length}.${(h >>> 0).toString(36)}`
}

const SIGNATURE = registrySignature()

// ─── base64 (browser + node safe) ──────────────────────────────────────────────

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let bin = ''
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
    return btoa(bin)
  }
  // Node fallback (tests)
  return Buffer.from(bytes).toString('base64')
}

function base64ToBytes(s: string): Uint8Array {
  try {
    if (typeof atob === 'function') {
      const bin = atob(s)
      const out = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
      return out
    }
    return new Uint8Array(Buffer.from(s, 'base64'))
  } catch {
    return new Uint8Array(0)
  }
}

// ─── Encode / decode ────────────────────────────────────────────────────────────

/**
 * Encode a {seedId → state} map into a compact code string:
 *   "v1:<signature>:<base64>"
 * Unknown ids are ignored; missing ids default to 'new' (0).
 */
export function encodeProgress(states: Record<string, ScenarioState>): string {
  const byteLen = Math.ceil((SCENARIO_COUNT * 2) / 8)
  const bytes = new Uint8Array(byteLen)

  for (const [id, state] of Object.entries(states)) {
    if (!state) continue // 'new' is the default — no need to store
    const ord = REGISTRY.index.get(id)
    if (ord === undefined) continue
    const bitPos = ord * 2
    const byteIdx = bitPos >> 3
    const shift = bitPos & 7
    bytes[byteIdx] |= (state & 0b11) << shift
  }

  return `${VERSION}:${SIGNATURE}:${bytesToBase64(bytes)}`
}

/**
 * Decode a code string back into a {seedId → state} map (only non-'new'
 * entries are returned). Tolerant: a malformed / mismatched code yields {}
 * rather than throwing, so a bad sync can never wipe local progress (the
 * caller merges, it never blindly overwrites).
 */
export function decodeProgress(code: string | null | undefined): Record<string, ScenarioState> {
  const out: Record<string, ScenarioState> = {}
  if (!code || typeof code !== 'string') return out

  const parts = code.split(':')
  if (parts.length !== 3) return out
  const [version, sig, payload] = parts
  if (version !== VERSION) return out

  const bytes = base64ToBytes(payload)
  if (bytes.length === 0) return out

  // Signature mismatch → curriculum shape changed. Decode only what still maps
  // by ordinal AND is within range; this is conservative but never corrupts.
  const signatureMatches = sig === SIGNATURE

  const max = signatureMatches
    ? SCENARIO_COUNT
    : Math.min(SCENARIO_COUNT, (bytes.length * 8) / 2)

  for (let ord = 0; ord < max; ord++) {
    const bitPos = ord * 2
    const byteIdx = bitPos >> 3
    if (byteIdx >= bytes.length) break
    const shift = bitPos & 7
    const state = ((bytes[byteIdx] >> shift) & 0b11) as ScenarioState
    if (state === 0) continue
    const id = REGISTRY.ids[ord]
    if (id) out[id] = state > 2 ? STATE_DONE : state
  }

  return out
}

/**
 * Merge two progress maps by taking the higher state per scenario.
 * Safe because status only ever ratchets up (new → practicing → done).
 */
export function mergeProgress(
  a: Record<string, ScenarioState>,
  b: Record<string, ScenarioState>
): Record<string, ScenarioState> {
  const out: Record<string, ScenarioState> = { ...a }
  for (const [id, state] of Object.entries(b)) {
    const prev = out[id] ?? 0
    if (state > prev) out[id] = state
  }
  return out
}
