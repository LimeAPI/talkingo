/**
 * Heritage Mode Scenario Seeds — Barrel file
 *
 * Exports all heritage/diaspora seeds for languages that support Heritage Mode.
 * Heritage-supported languages: ur, hi, ar, pa, fa, tl, el, he, pt
 */

export { HERITAGE_SEEDS_UR } from './ur'
export { HERITAGE_SEEDS_HI } from './hi'
export { HERITAGE_SEEDS_AR } from './ar'
export { HERITAGE_SEEDS_PA } from './pa'
export { HERITAGE_SEEDS_FA } from './fa'
export { HERITAGE_SEEDS_TL } from './tl'
export { HERITAGE_SEEDS_EL } from './el'
export { HERITAGE_SEEDS_HE } from './he'
export { HERITAGE_SEEDS_PT } from './pt'

import { HERITAGE_SEEDS_UR } from './ur'
import { HERITAGE_SEEDS_HI } from './hi'
import { HERITAGE_SEEDS_AR } from './ar'
import { HERITAGE_SEEDS_PA } from './pa'
import { HERITAGE_SEEDS_FA } from './fa'
import { HERITAGE_SEEDS_TL } from './tl'
import { HERITAGE_SEEDS_EL } from './el'
import { HERITAGE_SEEDS_HE } from './he'
import { HERITAGE_SEEDS_PT } from './pt'

import type { ConversationSeed } from '../types'

/** All heritage seeds combined for iteration/filtering */
export const ALL_HERITAGE_SEEDS: ConversationSeed[] = [
  ...HERITAGE_SEEDS_UR,
  ...HERITAGE_SEEDS_HI,
  ...HERITAGE_SEEDS_AR,
  ...HERITAGE_SEEDS_PA,
  ...HERITAGE_SEEDS_FA,
  ...HERITAGE_SEEDS_TL,
  ...HERITAGE_SEEDS_EL,
  ...HERITAGE_SEEDS_HE,
  ...HERITAGE_SEEDS_PT,
]

/** Heritage seeds indexed by language code */
export const HERITAGE_SEEDS_BY_LANGUAGE: Record<string, ConversationSeed[]> = {
  ur: HERITAGE_SEEDS_UR,
  hi: HERITAGE_SEEDS_HI,
  ar: HERITAGE_SEEDS_AR,
  pa: HERITAGE_SEEDS_PA,
  fa: HERITAGE_SEEDS_FA,
  tl: HERITAGE_SEEDS_TL,
  el: HERITAGE_SEEDS_EL,
  he: HERITAGE_SEEDS_HE,
  pt: HERITAGE_SEEDS_PT,
}
