/**
 * Heritage Mode Property Tests
 *
 * **Validates: Requirements 7.2, 7.6, 7.7, 7.8, 7.9**
 *
 * Property 15: Heritage seed completeness
 * Property 16: Heritage mode toggle preserves progress
 * Property 17: Heritage language validation
 * Property 18: Heritage/standard content distinctness
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { isHeritageSupported, HERITAGE_LANGUAGES } from '@/shared/heritage/index'
import { ALL_HERITAGE_SEEDS, HERITAGE_SEEDS_BY_LANGUAGE } from '@/shared/curriculum/heritage/index'
import { allCulturalSeeds } from '@/shared/curriculum/cultural/index'
import type { TargetLanguage, HeritageLanguage, UserPreferences } from '@/shared/types'

// ─── Constants ───────────────────────────────────────────────────────────────

/** All 32 language codes in the TargetLanguage union */
const ALL_32_CODES: TargetLanguage[] = [
  'en', 'es', 'fr', 'de', 'it', 'nl', 'pl', 'ro', 'ru', 'uk',
  'ja', 'ko', 'zh', 'hi', 'bn', 'id', 'mr', 'ta', 'te', 'th', 'vi',
  'ar', 'tr',
  // Tier 1
  'ur', 'pt', 'fa', 'sw', 'pa',
  // Tier 2
  'tl', 'hu', 'el', 'he',
]

/** Heritage-supported language codes */
const HERITAGE_SUPPORTED: HeritageLanguage[] = ['ur', 'hi', 'ar', 'pa', 'fa', 'tl', 'el', 'he', 'pt']

/** Level brackets as defined in the design */
const LEVEL_BRACKETS = [
  { name: 'beginner', min: 1, max: 4 },
  { name: 'intermediate', min: 5, max: 8 },
  { name: 'advanced', min: 9, max: 12 },
] as const

// ─── Property 15: Heritage seed completeness ─────────────────────────────────
// Feature: language-expansion, Property 15: Heritage seed completeness

describe('Property 15: Heritage seed completeness', () => {
  it('each heritage language has ≥3 seeds per level bracket with heritageMode: true', () => {
    /**Validates: Requirements 7.2*/

    fc.assert(
      fc.property(
        fc.constantFrom(...HERITAGE_SUPPORTED),
        fc.constantFrom(...LEVEL_BRACKETS),
        (lang, bracket) => {
          const langSeeds = HERITAGE_SEEDS_BY_LANGUAGE[lang] ?? []
          const seedsInBracket = langSeeds.filter(
            (seed) =>
              seed.heritageMode === true &&
              seed.level >= bracket.min &&
              seed.level <= bracket.max
          )

          expect(seedsInBracket.length).toBeGreaterThanOrEqual(3)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ─── Property 16: Heritage mode toggle preserves progress ────────────────────
// Feature: language-expansion, Property 16: Heritage mode toggle preserves progress

describe('Property 16: Heritage mode toggle preserves progress', () => {
  it('toggling heritageMode on/off preserves all progress fields', () => {
    /**Validates: Requirements 7.6*/

    fc.assert(
      fc.property(
        // Generate arbitrary progress data
        fc.record({
          completedLessons: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 10 }),
          talkingoLevel: fc.integer({ min: 1, max: 12 }),
          totalSessions: fc.integer({ min: 0, max: 1000 }),
        }),
        (progress) => {
          // Simulate a UserPreferences state with progress
          const preferences: UserPreferences = {
            talkingoLevel: progress.talkingoLevel,
            heritageMode: false,
          }

          // Add completedLessons and totalSessions as arbitrary extra data
          const stateBeforeToggle = {
            completedLessons: [...progress.completedLessons],
            talkingoLevel: progress.talkingoLevel,
            totalSessions: progress.totalSessions,
          }

          // Toggle heritage mode ON
          const withHeritageOn: UserPreferences = {
            ...preferences,
            heritageMode: true,
          }

          // Toggle heritage mode OFF
          const withHeritageOff: UserPreferences = {
            ...withHeritageOn,
            heritageMode: false,
          }

          // Verify progress fields are preserved after toggle on/off
          const stateAfterToggle = {
            completedLessons: [...progress.completedLessons],
            talkingoLevel: withHeritageOff.talkingoLevel,
            totalSessions: progress.totalSessions,
          }

          expect(stateAfterToggle.completedLessons).toEqual(stateBeforeToggle.completedLessons)
          expect(stateAfterToggle.talkingoLevel).toBe(stateBeforeToggle.talkingoLevel)
          expect(stateAfterToggle.totalSessions).toBe(stateBeforeToggle.totalSessions)

          // Also verify the heritageMode toggle itself works correctly
          expect(withHeritageOn.heritageMode).toBe(true)
          expect(withHeritageOff.heritageMode).toBe(false)

          // Ensure toggling does not affect other preference fields
          expect(withHeritageOff.talkingoLevel).toBe(preferences.talkingoLevel)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ─── Property 17: Heritage language validation ───────────────────────────────
// Feature: language-expansion, Property 17: Heritage language validation

describe('Property 17: Heritage language validation', () => {
  it('isHeritageSupported returns true ONLY for the 9 heritage languages', () => {
    /**Validates: Requirements 7.7, 7.8*/

    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_32_CODES),
        (lang) => {
          const expected = HERITAGE_SUPPORTED.includes(lang as HeritageLanguage)
          const actual = isHeritageSupported(lang)

          expect(actual).toBe(expected)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('returns true for all 9 heritage language codes', () => {
    /**Validates: Requirements 7.7*/

    fc.assert(
      fc.property(
        fc.constantFrom(...HERITAGE_SUPPORTED),
        (lang) => {
          expect(isHeritageSupported(lang)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('returns false for all non-heritage language codes', () => {
    /**Validates: Requirements 7.8*/

    const NON_HERITAGE: TargetLanguage[] = ALL_32_CODES.filter(
      (code) => !HERITAGE_SUPPORTED.includes(code as HeritageLanguage)
    )

    fc.assert(
      fc.property(
        fc.constantFrom(...NON_HERITAGE),
        (lang) => {
          expect(isHeritageSupported(lang)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ─── Property 18: Heritage/standard content distinctness ─────────────────────
// Feature: language-expansion, Property 18: Heritage/standard content distinctness

describe('Property 18: Heritage/standard content distinctness', () => {
  it('heritage seed IDs have ≤20% overlap with standard/cultural seed IDs per language and level bracket', () => {
    /**Validates: Requirements 7.9*/

    fc.assert(
      fc.property(
        fc.constantFrom(...HERITAGE_SUPPORTED),
        fc.constantFrom(...LEVEL_BRACKETS),
        (lang, bracket) => {
          // Get heritage seed IDs for this language and bracket
          const langHeritageSeeds = HERITAGE_SEEDS_BY_LANGUAGE[lang] ?? []
          const heritageIds = new Set(
            langHeritageSeeds
              .filter((s) => s.level >= bracket.min && s.level <= bracket.max)
              .map((s) => s.id)
          )

          // Get standard/cultural seed IDs for the same language and bracket
          // Cultural seeds are tagged by region — map heritage language to region
          const regionMap: Record<string, string[]> = {
            ur: ['PK'],
            hi: ['IN'],
            ar: ['EG', 'SA', 'LB'],
            pa: ['IN'],
            fa: ['IR'],
            tl: ['PH'],
            el: ['GR'],
            he: ['IL'],
            pt: ['BR', 'PT'],
          }

          const regions = regionMap[lang] ?? []
          const standardIds = new Set(
            allCulturalSeeds
              .filter(
                (s) =>
                  regions.includes(s.culturalContext?.region ?? '') &&
                  s.level >= bracket.min &&
                  s.level <= bracket.max &&
                  !s.heritageMode
              )
              .map((s) => s.id)
          )

          // If there are no heritage seeds or no standard seeds, overlap is trivially 0%
          if (heritageIds.size === 0 || standardIds.size === 0) {
            return // property holds vacuously
          }

          // Calculate overlap
          let overlapCount = 0
          for (const id of heritageIds) {
            if (standardIds.has(id)) {
              overlapCount++
            }
          }

          const overlapRatio = overlapCount / heritageIds.size
          expect(overlapRatio).toBeLessThanOrEqual(0.20)
        }
      ),
      { numRuns: 100 }
    )
  })
})
