/**
 * Barrel file for cultural scenario seeds.
 * Re-exports all language-specific and dialect-specific cultural seeds.
 */

export { getCulturalSeeds, GENERIC_FALLBACK_SEED } from './resolver'
export { urCulturalSeeds } from './ur'
export { faCulturalSeeds } from './fa'
export { swCulturalSeeds } from './sw'
export { paCulturalSeeds } from './pa'
export { ptBRCulturalSeeds } from './pt-BR'
export { arEGCulturalSeeds } from './ar-EG'
export { arSACulturalSeeds } from './ar-SA'
export { arLBCulturalSeeds } from './ar-LB'

import { urCulturalSeeds } from './ur'
import { faCulturalSeeds } from './fa'
import { swCulturalSeeds } from './sw'
import { paCulturalSeeds } from './pa'
import { ptBRCulturalSeeds } from './pt-BR'
import { arEGCulturalSeeds } from './ar-EG'
import { arSACulturalSeeds } from './ar-SA'
import { arLBCulturalSeeds } from './ar-LB'
import type { ConversationSeed } from '../types'

/** All cultural seeds combined */
export const allCulturalSeeds: ConversationSeed[] = [
  ...urCulturalSeeds,
  ...faCulturalSeeds,
  ...swCulturalSeeds,
  ...paCulturalSeeds,
  ...ptBRCulturalSeeds,
  ...arEGCulturalSeeds,
  ...arSACulturalSeeds,
  ...arLBCulturalSeeds,
]
