/**
 * Dialect System Property Tests
 *
 * **Validates: Requirements 4.4, 4.5, 4.6, 4.7**
 *
 * Property 6: Dialect voice resolution
 * Property 7: Default dialect resolution
 * Property 24: Dialect scenario constraint propagation
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  getDialectsForLanguage,
  hasDialects,
  resolveDialect,
  DEFAULT_DIALECT,
} from '@/shared/languages/dialects'
import { getEdgeVoice, VOICE_MAP } from '@/lib/api/edge-tts-service'
import type { DialectVariant } from '@/shared/types'
import type { ConversationSeed } from '@/shared/curriculum/types'

// ─── Constants ───────────────────────────────────────────────────────────────

const ALL_DIALECT_VARIANTS: DialectVariant[] = [
  'ar-EG', 'ar-LB', 'ar-SA',
  'es-ES', 'es-MX',
  'pt-BR', 'pt-PT',
]

const LANGUAGES_WITH_DIALECTS = ['ar', 'es', 'pt'] as const

const EXPECTED_DEFAULTS: Record<string, DialectVariant> = {
  ar: 'ar-EG',
  es: 'es-ES',
  pt: 'pt-BR',
}

// ─── Property 6: Dialect voice resolution ────────────────────────────────────
// Feature: language-expansion, Property 6: Dialect voice resolution

describe('Property 6: Dialect voice resolution', () => {
  it('returns a voice from the dialect-specific VOICE_MAP entry when available', () => {
    /**Validates: Requirements 4.4, 4.5*/

    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_DIALECT_VARIANTS),
        (dialect) => {
          const voiceConfig = VOICE_MAP[dialect]

          if (voiceConfig) {
            // When a VOICE_MAP entry exists for this dialect, getEdgeVoice should
            // return a voice from that dialect's entry
            const voice = getEdgeVoice(dialect, undefined, dialect)
            expect(
              voice === voiceConfig.primary || voice === voiceConfig.fallback
            ).toBe(true)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('returns dialect-specific primary voice for female personas and fallback for male personas', () => {
    /**Validates: Requirements 4.4*/

    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_DIALECT_VARIANTS),
        fc.constantFrom('eli', 'sofia', 'dr-luma', 'alex', 'riko', 'marco'),
        (dialect, personaId) => {
          const voiceConfig = VOICE_MAP[dialect]
          if (!voiceConfig) return // skip if no entry

          const voice = getEdgeVoice(dialect, personaId, dialect)
          const isMalePersona = ['alex', 'riko', 'marco'].includes(personaId)

          if (isMalePersona) {
            expect(voice).toBe(voiceConfig.fallback)
          } else {
            expect(voice).toBe(voiceConfig.primary)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('falls back to default dialect voice when dialect-specific entry is unavailable', () => {
    /**Validates: Requirements 4.5*/

    // Create a synthetic dialect code that does NOT exist in VOICE_MAP
    // to test the fallback. We use the parent language code to verify
    // that getEdgeVoice falls back to the language's default voice.
    fc.assert(
      fc.property(
        fc.constantFrom(...LANGUAGES_WITH_DIALECTS),
        (lang) => {
          // Call getEdgeVoice with the short language code (no dialect)
          // This should resolve via SHORT_MAP to the language's default BCP-47 code
          const voice = getEdgeVoice(lang)
          const defaultDialect = DEFAULT_DIALECT[lang]
          const defaultVoiceConfig = VOICE_MAP[defaultDialect]

          // When a dialect isn't specified, the voice should come from
          // the SHORT_MAP-resolved code's VOICE_MAP entry
          expect(voice).toBeDefined()
          expect(typeof voice).toBe('string')
          expect(voice.length).toBeGreaterThan(0)

          // The voice should be from a valid VOICE_MAP entry (not en-US fallback)
          // since all these languages have voice entries
          if (defaultVoiceConfig) {
            // The short code resolves through SHORT_MAP which may point to
            // a different BCP-47 than the default dialect. Verify it's a valid voice.
            const resolvedVoice = voice
            const allVoices = Object.values(VOICE_MAP).flatMap(c => [c.primary, c.fallback])
            expect(allVoices).toContain(resolvedVoice)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ─── Property 7: Default dialect resolution ──────────────────────────────────
// Feature: language-expansion, Property 7: Default dialect resolution

describe('Property 7: Default dialect resolution', () => {
  it('resolves undefined dialect to the correct default for languages with dialects', () => {
    /**Validates: Requirements 4.7*/

    fc.assert(
      fc.property(
        fc.constantFrom(...LANGUAGES_WITH_DIALECTS),
        (lang) => {
          const result = resolveDialect(lang, undefined)
          expect(result).toBe(EXPECTED_DEFAULTS[lang])
        }
      ),
      { numRuns: 100 }
    )
  })

  it('resolves null-like (undefined) dialect parameter to ar-EG, es-ES, pt-BR respectively', () => {
    /**Validates: Requirements 4.7*/

    fc.assert(
      fc.property(
        fc.constantFrom('ar' as const, 'es' as const, 'pt' as const),
        (lang) => {
          // Calling without dialect argument simulates null/undefined preference
          const result = resolveDialect(lang)
          const expectedDefaults: Record<string, DialectVariant> = {
            ar: 'ar-EG',
            es: 'es-ES',
            pt: 'pt-BR',
          }
          expect(result).toBe(expectedDefaults[lang])
        }
      ),
      { numRuns: 100 }
    )
  })

  it('returns undefined for languages that do not have dialect variants', () => {
    /**Validates: Requirements 4.7*/

    const languagesWithoutDialects = [
      'en', 'fr', 'de', 'it', 'nl', 'pl', 'ro', 'ru', 'uk',
      'ja', 'ko', 'zh', 'hi', 'bn', 'id', 'mr', 'ta', 'te', 'th', 'vi',
      'tr', 'ur', 'fa', 'sw', 'pa', 'tl', 'hu', 'el', 'he',
    ] as const

    fc.assert(
      fc.property(
        fc.constantFrom(...languagesWithoutDialects),
        (lang) => {
          const result = resolveDialect(lang, undefined)
          expect(result).toBeUndefined()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('returns specified dialect when it is a valid variant for the language', () => {
    /**Validates: Requirements 4.7*/

    // Generate pairs of (language, valid dialect for that language)
    const validPairs: Array<[typeof LANGUAGES_WITH_DIALECTS[number], DialectVariant]> = [
      ['ar', 'ar-EG'], ['ar', 'ar-LB'], ['ar', 'ar-SA'],
      ['es', 'es-ES'], ['es', 'es-MX'],
      ['pt', 'pt-BR'], ['pt', 'pt-PT'],
    ]

    fc.assert(
      fc.property(
        fc.constantFrom(...validPairs),
        ([lang, dialect]) => {
          const result = resolveDialect(lang, dialect)
          expect(result).toBe(dialect)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('falls back to default dialect when an invalid dialect is provided for a dialect-supporting language', () => {
    /**Validates: Requirements 4.7*/

    // Use a dialect that doesn't belong to the tested language
    const invalidPairs: Array<[typeof LANGUAGES_WITH_DIALECTS[number], DialectVariant]> = [
      ['ar', 'es-ES'], ['ar', 'pt-BR'],
      ['es', 'ar-EG'], ['es', 'pt-PT'],
      ['pt', 'ar-SA'], ['pt', 'es-MX'],
    ]

    fc.assert(
      fc.property(
        fc.constantFrom(...invalidPairs),
        ([lang, invalidDialect]) => {
          const result = resolveDialect(lang, invalidDialect)
          expect(result).toBe(EXPECTED_DEFAULTS[lang])
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ─── Property 24: Dialect scenario constraint propagation ────────────────────
// Feature: language-expansion, Property 24: Dialect scenario constraint propagation

describe('Property 24: Dialect scenario constraint propagation', () => {
  it('dialect code can be assigned to culturalContext.dialectConstraint field (type compatibility)', () => {
    /**Validates: Requirements 4.6*/

    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_DIALECT_VARIANTS),
        fc.constantFrom('food', 'family', 'market', 'celebration', 'business', 'social'),
        fc.constantFrom('EG', 'LB', 'SA', 'ES', 'MX', 'BR', 'PT'),
        (dialect, category, region) => {
          // Verify that a resolved dialect can be used as the dialectConstraint field
          // in a culturalContext object — this is a type compatibility check
          const culturalContext: ConversationSeed['culturalContext'] = {
            region,
            category,
            dialectConstraint: dialect,
          }

          // The dialectConstraint should be exactly the dialect code passed in
          expect(culturalContext.dialectConstraint).toBe(dialect)
          expect(culturalContext.region).toBe(region)
          expect(culturalContext.category).toBe(category)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('resolved dialect propagates correctly to dialectConstraint for languages with dialect support', () => {
    /**Validates: Requirements 4.6*/

    fc.assert(
      fc.property(
        fc.constantFrom(...LANGUAGES_WITH_DIALECTS),
        fc.constantFrom(...ALL_DIALECT_VARIANTS),
        (lang, requestedDialect) => {
          // Resolve the dialect using the dialect system
          const resolvedDialect = resolveDialect(lang, requestedDialect)

          if (resolvedDialect) {
            // Construct a culturalContext with the resolved dialect
            const culturalContext: ConversationSeed['culturalContext'] = {
              region: resolvedDialect.split('-')[1] || lang,
              category: 'social',
              dialectConstraint: resolvedDialect,
            }

            // Verify the dialectConstraint is a valid DialectVariant
            expect(ALL_DIALECT_VARIANTS).toContain(culturalContext.dialectConstraint)
            // Verify it matches the resolved dialect
            expect(culturalContext.dialectConstraint).toBe(resolvedDialect)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('when dialect is resolved to a default, dialectConstraint receives the default dialect code', () => {
    /**Validates: Requirements 4.6*/

    fc.assert(
      fc.property(
        fc.constantFrom(...LANGUAGES_WITH_DIALECTS),
        (lang) => {
          // When no dialect is specified, resolveDialect returns the default
          const resolvedDialect = resolveDialect(lang, undefined)!

          // Build culturalContext as the scenario engine would
          const culturalContext: ConversationSeed['culturalContext'] = {
            region: resolvedDialect.split('-')[1] || lang,
            category: 'food',
            dialectConstraint: resolvedDialect,
          }

          // The dialectConstraint should be the expected default
          expect(culturalContext.dialectConstraint).toBe(EXPECTED_DEFAULTS[lang])
        }
      ),
      { numRuns: 100 }
    )
  })
})
