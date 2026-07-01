/**
 * Cultural Seeds Property Tests
 *
 * **Validates: Requirements 6.1, 6.3, 6.5, 6.7**
 *
 * Property 12: Cultural seed completeness
 * Property 13: Cultural context field validity
 * Property 14: Cultural seed fallback
 */

import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'
import { allCulturalSeeds } from '@/shared/curriculum/cultural/index'
import { getCulturalSeeds, GENERIC_FALLBACK_SEED } from '@/shared/curriculum/cultural/resolver'
import type { DialectVariant } from '@/shared/types'

// ─── Constants ───────────────────────────────────────────────────────────────

/** New languages and their primary region codes */
const NEW_LANGUAGE_REGIONS = [
  { code: 'ur', region: 'PK' },
  { code: 'fa', region: 'IR' },
  { code: 'sw', region: 'TZ' },
  { code: 'pa', region: 'IN' },
] as const

/** Dialect-specific seeds and their regions */
const DIALECT_REGIONS = [
  { code: 'ar-EG', region: 'EG' },
  { code: 'ar-SA', region: 'SA' },
  { code: 'ar-LB', region: 'LB' },
  { code: 'pt-BR', region: 'BR' },
] as const

/** All regions that should have cultural seeds */
const ALL_CULTURAL_REGIONS = [...NEW_LANGUAGE_REGIONS, ...DIALECT_REGIONS] as const

/** Level brackets as defined in the design */
const LEVEL_BRACKETS = [
  { name: 'beginner', min: 1, max: 4 },
  { name: 'intermediate', min: 5, max: 8 },
  { name: 'advanced', min: 9, max: 12 },
] as const

/** All valid DialectVariant values */
const ALL_DIALECT_VARIANTS: DialectVariant[] = [
  'ar-EG', 'ar-LB', 'ar-SA',
  'es-ES', 'es-MX',
  'pt-BR', 'pt-PT',
]

// ─── Property 12: Cultural seed completeness ─────────────────────────────────
// Feature: language-expansion, Property 12: Cultural seed completeness

describe('Property 12: Cultural seed completeness', () => {
  it('each new language/dialect region has ≥5 seeds per level bracket', () => {
    /**Validates: Requirements 6.1*/

    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_CULTURAL_REGIONS),
        fc.constantFrom(...LEVEL_BRACKETS),
        ({ code, region }, bracket) => {
          const seedsInBracket = allCulturalSeeds.filter(
            (seed) =>
              seed.culturalContext?.region === region &&
              seed.level >= bracket.min &&
              seed.level <= bracket.max
          )

          expect(seedsInBracket.length).toBeGreaterThanOrEqual(
            5,
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  it('seeds in each bracket span at least 2 distinct levels within the bracket', () => {
    /**Validates: Requirements 6.1*/

    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_CULTURAL_REGIONS),
        fc.constantFrom(...LEVEL_BRACKETS),
        ({ region }, bracket) => {
          const seedsInBracket = allCulturalSeeds.filter(
            (seed) =>
              seed.culturalContext?.region === region &&
              seed.level >= bracket.min &&
              seed.level <= bracket.max
          )

          // Seeds should cover more than one level within the bracket
          const distinctLevels = new Set(seedsInBracket.map((s) => s.level))
          expect(distinctLevels.size).toBeGreaterThanOrEqual(2)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ─── Property 13: Cultural context field validity ────────────────────────────
// Feature: language-expansion, Property 13: Cultural context field validity

describe('Property 13: Cultural context field validity', () => {
  it('every seed with culturalContext has non-empty region and category strings', () => {
    /**Validates: Requirements 6.3, 6.5*/

    fc.assert(
      fc.property(
        fc.constantFrom(...allCulturalSeeds),
        (seed) => {
          // Every seed in allCulturalSeeds should have culturalContext
          expect(seed.culturalContext).toBeDefined()
          expect(typeof seed.culturalContext!.region).toBe('string')
          expect(seed.culturalContext!.region.length).toBeGreaterThan(0)
          expect(typeof seed.culturalContext!.category).toBe('string')
          expect(seed.culturalContext!.category.length).toBeGreaterThan(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('when dialectConstraint exists, it is a valid DialectVariant value', () => {
    /**Validates: Requirements 6.5*/

    // Filter seeds that have dialectConstraint
    const seedsWithDialect = allCulturalSeeds.filter(
      (s) => s.culturalContext?.dialectConstraint !== undefined
    )

    // If there are no seeds with dialectConstraint, this property trivially holds
    if (seedsWithDialect.length === 0) {
      // Still valid — property holds vacuously
      expect(true).toBe(true)
      return
    }

    fc.assert(
      fc.property(
        fc.constantFrom(...seedsWithDialect),
        (seed) => {
          const dialect = seed.culturalContext!.dialectConstraint!
          expect(ALL_DIALECT_VARIANTS).toContain(dialect)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('culturalContext.category is one of the defined cultural categories', () => {
    /**Validates: Requirements 6.3*/

    const VALID_CATEGORIES = ['food', 'family', 'market', 'celebration', 'business', 'social']

    fc.assert(
      fc.property(
        fc.constantFrom(...allCulturalSeeds),
        (seed) => {
          expect(VALID_CATEGORIES).toContain(seed.culturalContext!.category)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ─── Property 14: Cultural seed fallback ─────────────────────────────────────
// Feature: language-expansion, Property 14: Cultural seed fallback

describe('Property 14: Cultural seed fallback', () => {
  it('returns a generic seed when called with a language that has no cultural seeds', () => {
    /**Validates: Requirements 6.7*/

    // Languages that do NOT have cultural seeds in allCulturalSeeds
    const LANGUAGES_WITHOUT_CULTURAL_SEEDS = [
      'en', 'fr', 'de', 'it', 'nl', 'pl', 'ro', 'ru', 'uk',
      'ja', 'ko', 'zh', 'hi', 'bn', 'id', 'mr', 'ta', 'te',
      'th', 'vi', 'tr', 'tl', 'hu', 'el', 'he',
    ] as const

    fc.assert(
      fc.property(
        fc.constantFrom(...LANGUAGES_WITHOUT_CULTURAL_SEEDS),
        fc.integer({ min: 1, max: 12 }),
        (lang, level) => {
          const result = getCulturalSeeds(lang, level)

          // Should return at least one seed (the generic fallback)
          expect(result.length).toBeGreaterThanOrEqual(1)

          // The returned seed should be a generic fallback (matches the structure)
          const fallbackSeed = result[0]
          expect(fallbackSeed.id).toBe(GENERIC_FALLBACK_SEED.id)
          expect(fallbackSeed.level).toBe(level)
          // Fallback seed should not have culturalContext
          expect(fallbackSeed.culturalContext).toBeUndefined()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('logs a warning when falling back to generic seed', () => {
    /**Validates: Requirements 6.7*/

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    fc.assert(
      fc.property(
        fc.constantFrom('en', 'fr', 'de', 'ja', 'ko', 'hu'),
        fc.integer({ min: 1, max: 12 }),
        (lang, level) => {
          warnSpy.mockClear()
          getCulturalSeeds(lang, level)
          expect(warnSpy).toHaveBeenCalled()
          const warnMsg = warnSpy.mock.calls[0][0] as string
          expect(warnMsg).toContain('[cultural-seeds]')
          expect(warnMsg).toContain(lang)
        }
      ),
      { numRuns: 100 }
    )

    warnSpy.mockRestore()
  })

  it('returns actual cultural seeds (not fallback) for languages that have them', () => {
    /**Validates: Requirements 6.7*/

    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_CULTURAL_REGIONS),
        fc.constantFrom(1, 5, 9),
        ({ code }, level) => {
          const result = getCulturalSeeds(code, level)

          // Should return real cultural seeds, not the generic fallback
          expect(result.length).toBeGreaterThanOrEqual(1)
          // At least one result should have culturalContext (i.e. not fallback)
          const hasCultural = result.some((s) => s.culturalContext !== undefined)
          expect(hasCultural).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })
})
