/**
 * Curriculum helpers — seed lookup and filtering utilities.
 * Provides a combined seed index and query functions.
 */
import { SEEDS_L01 } from './levels/l01'
import { SEEDS_L02 } from './levels/l02'
import { SEEDS_L03 } from './levels/l03'
import { SEEDS_L04 } from './levels/l04'
import { SEEDS_L05 } from './levels/l05'
import { SEEDS_L06 } from './levels/l06'
import { SEEDS_L07 } from './levels/l07'
import { SEEDS_L08 } from './levels/l08'
import { SEEDS_L09 } from './levels/l09'
import { SEEDS_L10 } from './levels/l10'
import { SEEDS_L11 } from './levels/l11'
import { SEEDS_L12 } from './levels/l12'
import type { ConversationSeed } from './types'
import type { GrammarTag } from './grammar-tags'

/** Combined array of all 300 seeds across all 12 levels */
export const SEEDS: ConversationSeed[] = [
  ...SEEDS_L01,
  ...SEEDS_L02,
  ...SEEDS_L03,
  ...SEEDS_L04,
  ...SEEDS_L05,
  ...SEEDS_L06,
  ...SEEDS_L07,
  ...SEEDS_L08,
  ...SEEDS_L09,
  ...SEEDS_L10,
  ...SEEDS_L11,
  ...SEEDS_L12,
]

/** Index for O(1) seed lookup by ID */
const seedIndex = new Map<string, ConversationSeed>()
for (const seed of SEEDS) {
  seedIndex.set(seed.id, seed)
}

/** Index for O(1) level-based seed lookup */
const levelIndex = new Map<number, ConversationSeed[]>()
for (const seed of SEEDS) {
  const l = seed.level
  if (!levelIndex.has(l)) levelIndex.set(l, [])
  levelIndex.get(l)!.push(seed)
}

/**
 * Returns all seeds for a given level (1–12).
 * Each level has exactly 25 seeds.
 */
export function getSeedsByLevel(level: number): ConversationSeed[] {
  return levelIndex.get(level) ?? []
}

/**
 * Returns all seeds that target a specific grammar tag.
 * Useful for the grammar filter UI.
 */
export function getSeedsByGrammar(tag: GrammarTag): ConversationSeed[] {
  return SEEDS.filter((seed) => seed.targetGrammar.includes(tag))
}

/**
 * Returns a single seed by its ID, or undefined if not found.
 * Uses O(1) Map lookup.
 */
export function getSeedById(id: string): ConversationSeed | undefined {
  return seedIndex.get(id)
}

/**
 * Returns all seeds in a spiral group across all levels,
 * sorted by spiralOrder ascending.
 */
export function getSpiralGroup(group: string): ConversationSeed[] {
  return SEEDS
    .filter((seed) => seed.spiralGroup === group)
    .sort((a, b) => a.spiralOrder - b.spiralOrder)
}
