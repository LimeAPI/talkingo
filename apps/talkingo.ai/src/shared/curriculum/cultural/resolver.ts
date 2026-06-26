/**
 * Cultural seed resolver with fallback for missing content.
 *
 * When no cultural seeds exist for a given language/level combination,
 * returns a generic conversational seed and logs a warning to help
 * content teams identify gaps.
 */

import type { ConversationSeed } from '../types'
import { urCulturalSeeds } from './ur'
import { faCulturalSeeds } from './fa'
import { swCulturalSeeds } from './sw'
import { paCulturalSeeds } from './pa'
import { ptBRCulturalSeeds } from './pt-BR'
import { arEGCulturalSeeds } from './ar-EG'
import { arSACulturalSeeds } from './ar-SA'
import { arLBCulturalSeeds } from './ar-LB'

/** All cultural seeds combined (local aggregation to avoid circular imports) */
const allSeeds: ConversationSeed[] = [
  ...urCulturalSeeds,
  ...faCulturalSeeds,
  ...swCulturalSeeds,
  ...paCulturalSeeds,
  ...ptBRCulturalSeeds,
  ...arEGCulturalSeeds,
  ...arSACulturalSeeds,
  ...arLBCulturalSeeds,
]

/**
 * Maps language codes to their primary region identifier used in culturalContext.
 * Dialect-specific codes map to their dialect region.
 */
const LANGUAGE_REGION_MAP: Record<string, string> = {
  ur: 'PK',
  fa: 'IR',
  sw: 'TZ',
  pa: 'IN',
  pt: 'BR',
  'pt-BR': 'BR',
  'pt-PT': 'PT',
  'ar-EG': 'EG',
  'ar-LB': 'LB',
  'ar-SA': 'SA',
  ar: 'EG', // default Arabic region
}

/**
 * A generic conversational seed used as a fallback when no culture-specific
 * seeds exist for a language/level combination.
 */
export const GENERIC_FALLBACK_SEED: ConversationSeed = {
  id: 'generic-conversation-l01',
  title: 'General Conversation Practice',
  blurb: 'Practice everyday conversational skills in a relaxed setting',
  level: 1,
  spiralGroup: 'general-conversation',
  spiralOrder: 1,
  prerequisites: [],
  category: 'Daily Life',
  scenarioBrief:
    'You meet someone new and have a friendly everyday conversation. Topics can include greetings, introductions, asking about interests, and sharing simple opinions.',
  targetGrammar: ['present-simple-to-be'],
  targetVocab: ['hello', 'name', 'nice', 'how', 'good'],
  difficulty: 'core',
}

/**
 * Returns the level bracket range for a given level.
 * Beginner: 1-4, Intermediate: 5-8, Advanced: 9-12
 */
function getLevelBracket(level: number): { min: number; max: number } {
  if (level <= 4) return { min: 1, max: 4 }
  if (level <= 8) return { min: 5, max: 8 }
  return { min: 9, max: 12 }
}

/**
 * Retrieves cultural seeds for a given language code and level.
 *
 * Filters allCulturalSeeds by the language's region and the level bracket
 * containing the specified level. If no seeds are found, returns a generic
 * fallback seed and logs a warning.
 *
 * @param languageCode - ISO 639-1 language code or dialect code (e.g., 'ur', 'ar-EG')
 * @param level - The learner's current level (1-12)
 * @returns Array of matching ConversationSeed objects
 */
export function getCulturalSeeds(languageCode: string, level: number): ConversationSeed[] {
  const region = LANGUAGE_REGION_MAP[languageCode]
  const { min, max } = getLevelBracket(level)

  const seeds = allSeeds.filter(
    (s) =>
      s.culturalContext?.region === region &&
      s.level >= min &&
      s.level <= max
  )

  if (seeds.length === 0) {
    console.warn(
      `[cultural-seeds] No culture-specific seeds found for language="${languageCode}" level=${level} (bracket ${min}-${max}). Using generic fallback.`
    )
    return [{ ...GENERIC_FALLBACK_SEED, level }]
  }

  return seeds
}
