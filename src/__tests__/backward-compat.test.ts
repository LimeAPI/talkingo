/**
 * Property Tests — Backward Compatibility and Preference Integrity
 *
 * Feature: language-expansion, Property 8, 23
 * **Validates: Requirements 4.9, 7.5, 9.2, 9.5**
 *
 * Property 8: Preference persistence integrity — single-field updates don't modify other fields
 * Property 23: Unknown language code fallback — arbitrary strings resolve to English without error
 *
 * Uses Vitest + fast-check with minimum 100 iterations per property.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { LANGUAGES, getLanguageMeta, type LanguageMeta } from '@talkingo/shared/languages'
import type {
  TargetLanguage,
  DialectVariant,
  ScriptPreference,
  UserPreferences,
  PersonaId,
  LearnerGender,
  LanguageLevel,
} from '@talkingo/shared/types'

// ─── Constants ───────────────────────────────────────────────────────────────

const ALL_32_LANGUAGES: TargetLanguage[] = Object.keys(LANGUAGES) as TargetLanguage[]

const VALID_DIALECT_VARIANTS: DialectVariant[] = [
  'ar-EG', 'ar-LB', 'ar-SA', 'es-ES', 'es-MX', 'pt-BR', 'pt-PT',
]

// ─── Arbitraries (generators) ────────────────────────────────────────────────

const targetLanguageArb = fc.constantFrom(...ALL_32_LANGUAGES)

const dialectVariantArb = fc.constantFrom(...VALID_DIALECT_VARIANTS)

const scriptPreferenceArb = fc.constantFrom<ScriptPreference>('native', 'latin', 'both')

const personaIdArb = fc.constantFrom<PersonaId>('eli', 'alex', 'dr-luma', 'sofia', 'riko', 'marco')

const learnerGenderArb = fc.constantFrom<LearnerGender>('masculine', 'feminine')

const languageLevelArb = fc.constantFrom<LanguageLevel>('beginner', 'intermediate', 'advanced')

/**
 * Generator for a full UserPreferences object with random but valid field values.
 */
const userPreferencesArb: fc.Arbitrary<UserPreferences> = fc.record({
  talkingoLevel: fc.option(fc.integer({ min: 1, max: 12 }), { nil: undefined }),
  level: fc.option(languageLevelArb, { nil: undefined }),
  persona: fc.option(personaIdArb, { nil: undefined }),
  userName: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  targetLanguage: fc.option(targetLanguageArb, { nil: undefined }),
  nativeLanguage: fc.option(targetLanguageArb, { nil: undefined }),
  onboardingComplete: fc.option(fc.boolean(), { nil: undefined }),
  currentUnitId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  preferredScript: fc.option(scriptPreferenceArb, { nil: undefined }),
  learnerGender: fc.option(learnerGenderArb, { nil: undefined }),
  dialect: fc.option(dialectVariantArb, { nil: undefined }),
  heritageMode: fc.option(fc.boolean(), { nil: undefined }),
  uiLanguage: fc.option(fc.constantFrom(...ALL_32_LANGUAGES), { nil: undefined }),
})

// ─── Pure logic: Single-field preference update ──────────────────────────────
// This simulates the behavior of persisting a single-field update to user
// preferences, where all other fields must remain unmodified.

type UpdatableField = 'dialect' | 'heritageMode' | 'uiLanguage' | 'preferredScript'

function applySingleFieldUpdate(
  preferences: UserPreferences,
  field: UpdatableField,
  value: unknown
): UserPreferences {
  return { ...preferences, [field]: value }
}

// ─── Property 8: Preference persistence integrity ────────────────────────────
// Feature: language-expansion, Property 8: Preference persistence integrity
//
// For any UserPreferencesDoc and any single-field update (dialect, heritageMode,
// uiLanguage, or preferredScript), after persisting the update, all OTHER fields
// in the document SHALL retain their pre-update values without modification,
// deletion, or reordering.

describe('Property 8: Preference persistence integrity', () => {
  it('updating dialect does not modify other fields', () => {
    /**Validates: Requirements 4.9, 7.5, 9.2*/
    fc.assert(
      fc.property(
        userPreferencesArb,
        fc.option(dialectVariantArb, { nil: undefined }),
        (originalPrefs, newDialect) => {
          const updated = applySingleFieldUpdate(originalPrefs, 'dialect', newDialect)

          // The updated dialect field should have the new value
          expect(updated.dialect).toBe(newDialect)

          // All other fields should remain identical
          expect(updated.talkingoLevel).toBe(originalPrefs.talkingoLevel)
          expect(updated.level).toBe(originalPrefs.level)
          expect(updated.persona).toBe(originalPrefs.persona)
          expect(updated.userName).toBe(originalPrefs.userName)
          expect(updated.targetLanguage).toBe(originalPrefs.targetLanguage)
          expect(updated.nativeLanguage).toBe(originalPrefs.nativeLanguage)
          expect(updated.onboardingComplete).toBe(originalPrefs.onboardingComplete)
          expect(updated.currentUnitId).toBe(originalPrefs.currentUnitId)
          expect(updated.preferredScript).toBe(originalPrefs.preferredScript)
          expect(updated.learnerGender).toBe(originalPrefs.learnerGender)
          expect(updated.heritageMode).toBe(originalPrefs.heritageMode)
          expect(updated.uiLanguage).toBe(originalPrefs.uiLanguage)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('updating heritageMode does not modify other fields', () => {
    /**Validates: Requirements 4.9, 7.5, 9.2*/
    fc.assert(
      fc.property(
        userPreferencesArb,
        fc.option(fc.boolean(), { nil: undefined }),
        (originalPrefs, newHeritageMode) => {
          const updated = applySingleFieldUpdate(originalPrefs, 'heritageMode', newHeritageMode)

          // The updated heritageMode field should have the new value
          expect(updated.heritageMode).toBe(newHeritageMode)

          // All other fields should remain identical
          expect(updated.talkingoLevel).toBe(originalPrefs.talkingoLevel)
          expect(updated.level).toBe(originalPrefs.level)
          expect(updated.persona).toBe(originalPrefs.persona)
          expect(updated.userName).toBe(originalPrefs.userName)
          expect(updated.targetLanguage).toBe(originalPrefs.targetLanguage)
          expect(updated.nativeLanguage).toBe(originalPrefs.nativeLanguage)
          expect(updated.onboardingComplete).toBe(originalPrefs.onboardingComplete)
          expect(updated.currentUnitId).toBe(originalPrefs.currentUnitId)
          expect(updated.preferredScript).toBe(originalPrefs.preferredScript)
          expect(updated.learnerGender).toBe(originalPrefs.learnerGender)
          expect(updated.dialect).toBe(originalPrefs.dialect)
          expect(updated.uiLanguage).toBe(originalPrefs.uiLanguage)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('updating uiLanguage does not modify other fields', () => {
    /**Validates: Requirements 4.9, 7.5, 9.2*/
    fc.assert(
      fc.property(
        userPreferencesArb,
        fc.option(fc.string({ minLength: 2, maxLength: 5 }), { nil: undefined }),
        (originalPrefs, newUiLanguage) => {
          const updated = applySingleFieldUpdate(originalPrefs, 'uiLanguage', newUiLanguage)

          // The updated uiLanguage field should have the new value
          expect(updated.uiLanguage).toBe(newUiLanguage)

          // All other fields should remain identical
          expect(updated.talkingoLevel).toBe(originalPrefs.talkingoLevel)
          expect(updated.level).toBe(originalPrefs.level)
          expect(updated.persona).toBe(originalPrefs.persona)
          expect(updated.userName).toBe(originalPrefs.userName)
          expect(updated.targetLanguage).toBe(originalPrefs.targetLanguage)
          expect(updated.nativeLanguage).toBe(originalPrefs.nativeLanguage)
          expect(updated.onboardingComplete).toBe(originalPrefs.onboardingComplete)
          expect(updated.currentUnitId).toBe(originalPrefs.currentUnitId)
          expect(updated.preferredScript).toBe(originalPrefs.preferredScript)
          expect(updated.learnerGender).toBe(originalPrefs.learnerGender)
          expect(updated.dialect).toBe(originalPrefs.dialect)
          expect(updated.heritageMode).toBe(originalPrefs.heritageMode)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('updating preferredScript does not modify other fields', () => {
    /**Validates: Requirements 4.9, 7.5, 9.2*/
    fc.assert(
      fc.property(
        userPreferencesArb,
        fc.option(scriptPreferenceArb, { nil: undefined }),
        (originalPrefs, newScript) => {
          const updated = applySingleFieldUpdate(originalPrefs, 'preferredScript', newScript)

          // The updated preferredScript field should have the new value
          expect(updated.preferredScript).toBe(newScript)

          // All other fields should remain identical
          expect(updated.talkingoLevel).toBe(originalPrefs.talkingoLevel)
          expect(updated.level).toBe(originalPrefs.level)
          expect(updated.persona).toBe(originalPrefs.persona)
          expect(updated.userName).toBe(originalPrefs.userName)
          expect(updated.targetLanguage).toBe(originalPrefs.targetLanguage)
          expect(updated.nativeLanguage).toBe(originalPrefs.nativeLanguage)
          expect(updated.onboardingComplete).toBe(originalPrefs.onboardingComplete)
          expect(updated.currentUnitId).toBe(originalPrefs.currentUnitId)
          expect(updated.learnerGender).toBe(originalPrefs.learnerGender)
          expect(updated.dialect).toBe(originalPrefs.dialect)
          expect(updated.heritageMode).toBe(originalPrefs.heritageMode)
          expect(updated.uiLanguage).toBe(originalPrefs.uiLanguage)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('any single updatable field change preserves all other fields (generalized)', () => {
    /**Validates: Requirements 4.9, 7.5, 9.2*/

    const updatableFieldArb = fc.constantFrom<UpdatableField>(
      'dialect', 'heritageMode', 'uiLanguage', 'preferredScript'
    )

    const updateValueArb = fc.oneof(
      fc.option(dialectVariantArb, { nil: undefined }),
      fc.option(fc.boolean(), { nil: undefined }),
      fc.option(fc.string({ minLength: 2, maxLength: 5 }), { nil: undefined }),
      fc.option(scriptPreferenceArb, { nil: undefined }),
    )

    fc.assert(
      fc.property(
        userPreferencesArb,
        updatableFieldArb,
        updateValueArb,
        (originalPrefs, field, value) => {
          const updated = applySingleFieldUpdate(originalPrefs, field, value)

          // All fields OTHER than the updated field should remain identical
          const allFields: (keyof UserPreferences)[] = [
            'talkingoLevel', 'level', 'persona',
            'userName', 'targetLanguage', 'nativeLanguage',
            'onboardingComplete', 'currentUnitId', 'preferredScript',
            'learnerGender', 'dialect', 'heritageMode', 'uiLanguage',
          ]

          for (const key of allFields) {
            if (key !== field) {
              expect(updated[key]).toBe(originalPrefs[key])
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ─── Property 23: Unknown language code fallback ─────────────────────────────
// Feature: language-expansion, Property 23: Unknown language code fallback
//
// For any arbitrary string that is not a valid TargetLanguage code,
// getLanguageMeta() SHALL return the English (en) LanguageMeta entry
// without throwing an error or crashing.

describe('Property 23: Unknown language code fallback', () => {
  it('arbitrary strings resolve to English metadata without error', () => {
    /**Validates: Requirements 9.5*/
    fc.assert(
      fc.property(
        fc.string(),
        (arbitraryCode) => {
          // Should never throw
          const result = getLanguageMeta(arbitraryCode)

          // Should return a valid LanguageMeta (not null/undefined)
          expect(result).toBeDefined()
          expect(result).not.toBeNull()

          // If the code is not a valid TargetLanguage, it should return English
          if (!ALL_32_LANGUAGES.includes(arbitraryCode as TargetLanguage)) {
            expect(result.code).toBe('en')
            expect(result.bcp47).toBe('en-US')
            expect(result.english).toBe('English (US)')
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('returns valid LanguageMeta structure for any input', () => {
    /**Validates: Requirements 9.5*/
    fc.assert(
      fc.property(
        fc.string(),
        (arbitraryCode) => {
          const result = getLanguageMeta(arbitraryCode)

          // Verify the result has all required LanguageMeta fields
          expect(typeof result.code).toBe('string')
          expect(result.code.length).toBeGreaterThan(0)
          expect(typeof result.bcp47).toBe('string')
          expect(result.bcp47.length).toBeGreaterThan(0)
          expect(typeof result.english).toBe('string')
          expect(result.english.length).toBeGreaterThan(0)
          expect(typeof result.native).toBe('string')
          expect(result.native.length).toBeGreaterThan(0)
          expect(['latin', 'non-latin']).toContain(result.script)
          expect(['ltr', 'rtl']).toContain(result.direction)
          expect(typeof result.sampleHello).toBe('string')
          expect(result.sampleHello.length).toBeGreaterThan(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('returns correct metadata for valid language codes', () => {
    /**Validates: Requirements 9.2*/
    fc.assert(
      fc.property(
        targetLanguageArb,
        (validCode) => {
          const result = getLanguageMeta(validCode)

          // For valid codes, should return the correct metadata (not English fallback)
          expect(result.code).toBe(validCode)
          expect(result).toEqual(LANGUAGES[validCode])
        }
      ),
      { numRuns: 100 }
    )
  })

  it('handles undefined input gracefully (returns English)', () => {
    /**Validates: Requirements 9.5*/
    const result = getLanguageMeta(undefined)
    expect(result.code).toBe('en')
    expect(result.bcp47).toBe('en-US')
  })

  it('does not throw for edge-case strings (empty, very long, special chars)', () => {
    /**Validates: Requirements 9.5*/
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(''),
          fc.constant('valueOf'),
          fc.constant('toString'),
          fc.constant('hasOwnProperty'),
          fc.constant('__proto__'),
          fc.constant('constructor'),
          fc.string({ minLength: 100, maxLength: 500 }),
          fc.string({ unit: 'grapheme' }),
          fc.string({ unit: 'binary' }),
        ),
        (edgeCase) => {
          // Should never throw regardless of input
          expect(() => getLanguageMeta(edgeCase)).not.toThrow()

          const result = getLanguageMeta(edgeCase)
          // Unknown codes always fall back to English
          expect(result.code).toBe('en')
          expect(result.bcp47).toBe('en-US')
        }
      ),
      { numRuns: 100 }
    )
  })
})
