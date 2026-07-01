import { describe, it, expect } from 'vitest'
import {
  encodeProgress,
  decodeProgress,
  mergeProgress,
  SCENARIO_COUNT,
  type ScenarioState,
} from '@talkingo/shared/curriculum/progress-code'
import { SEEDS } from '@talkingo/shared/curriculum'

const ids = SEEDS.map((s) => s.id)

describe('progress-code', () => {
  it('has a non-trivial, data-driven scenario count (not assumed 25×12)', () => {
    expect(SCENARIO_COUNT).toBe(SEEDS.length)
    expect(SCENARIO_COUNT).toBeGreaterThan(0)
  })

  it('round-trips done and practicing states', () => {
    const states: Record<string, ScenarioState> = {
      [ids[0]]: 2,
      [ids[1]]: 1,
      [ids[5]]: 2,
      [ids[SEEDS.length - 1]]: 1,
    }
    const decoded = decodeProgress(encodeProgress(states))
    expect(decoded).toEqual(states)
  })

  it('omits new (0) states from the decoded map', () => {
    const states: Record<string, ScenarioState> = { [ids[0]]: 0, [ids[1]]: 2 }
    const decoded = decodeProgress(encodeProgress(states))
    expect(decoded[ids[0]]).toBeUndefined()
    expect(decoded[ids[1]]).toBe(2)
  })

  it('ignores unknown scenario ids', () => {
    const code = encodeProgress({ 'not-a-real-seed': 2 as ScenarioState, [ids[2]]: 2 })
    const decoded = decodeProgress(code)
    expect(decoded['not-a-real-seed']).toBeUndefined()
    expect(decoded[ids[2]]).toBe(2)
  })

  it('merges by taking the higher state per scenario (ratchet)', () => {
    const a: Record<string, ScenarioState> = { [ids[0]]: 1, [ids[1]]: 2 }
    const b: Record<string, ScenarioState> = { [ids[0]]: 2, [ids[2]]: 1 }
    const merged = mergeProgress(a, b)
    expect(merged[ids[0]]).toBe(2) // practicing → done wins
    expect(merged[ids[1]]).toBe(2) // kept
    expect(merged[ids[2]]).toBe(1) // added
  })

  it('returns empty on malformed or version-mismatched codes (never throws)', () => {
    expect(decodeProgress('')).toEqual({})
    expect(decodeProgress('garbage')).toEqual({})
    expect(decodeProgress('v0:sig:AAAA')).toEqual({})
    expect(decodeProgress(null)).toEqual({})
    expect(decodeProgress(undefined)).toEqual({})
  })

  it('produces a compact code (well under 1KB for full progress)', () => {
    const all: Record<string, ScenarioState> = {}
    for (const id of ids) all[id] = 2
    const code = encodeProgress(all)
    expect(code.length).toBeLessThan(1024)
  })
})
